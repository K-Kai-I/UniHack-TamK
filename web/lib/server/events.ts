// Đọc sự kiện của contract về database để làm mục history trong GET /deals/:id.
// RPC công khai của Fuji giới hạn số khối mỗi lần eth_getLogs (từ 11/2026: tối đa 100 khối), nên đọc từng đoạn
// LOGS_CHUNK khối (mặc định 100) và nhớ khối cuối đã đọc. Bot keeper đọc nhiều đoạn trong một ngân sách thời gian
// để đuổi kịp chuỗi (Fuji ~2 giây một khối, tức ~1.800 khối mỗi giờ).
// Tồn nhiều khối (vd sau khi deploy contract mới) thì hỏi API của trình duyệt khối Routescan/Snowtrace trước:
// nó đã lập chỉ mục sự kiện theo contract, một lần hỏi trả hết (tới 1.000 log), thay vì hàng nghìn lần eth_getLogs.
import "server-only";
import { decodeEventLog, numberToHex, type Log } from "viem";
import deployments from "@shared/deployments.json";
import { addresses, escrowAbi } from "../chain";
import { logsClient, publicClient } from "./chain";
import { db } from "./db";
import { DEAL_STATES, type Hash } from "../types";

const CHUNK = BigInt(Math.max(1, Math.floor(Number(process.env.LOGS_CHUNK ?? 100)) || 100));

async function cursorKey() {
  return `events:${addresses.escrow.toLowerCase()}`;
}

/** Số đoạn hỏi cùng lúc. RPC công khai chịu được vài yêu cầu song song; tăng nữa dễ bị chặn tốc độ. */
const PARALLEL = 3;

/** Tồn hơn chừng này khối thì đuổi kịp bằng API trình duyệt khối. */
const EXPLORER_MIN_GAP = BigInt(500);
/** Chừa lại chừng này khối mới nhất cho RPC đọc (phòng khi chỉ mục của trình duyệt khối chậm vài phút). */
const EXPLORER_LAG = BigInt(300);
const EXPLORER_API =
  process.env.EXPLORER_API_URL ?? "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api";

export type ExplorerLog = { topics: string[]; data: string; blockNumber: string; timeStamp: string; logIndex: string; transactionHash: string };

/** Đổi một log kiểu Etherscan sang dạng viem. Routescan ghi logIndex 0 là "0x" và data rỗng là "". */
export function explorerToLog(l: ExplorerLog): Log {
  const hexNum = (v: string) => (v && v !== "0x" ? Number(v) : 0);
  return {
    address: addresses.escrow,
    topics: l.topics.filter(Boolean) as [`0x${string}`, ...`0x${string}`[]],
    data: (l.data && l.data !== "" ? l.data : "0x") as `0x${string}`,
    blockNumber: BigInt(l.blockNumber),
    logIndex: hexNum(l.logIndex),
    transactionHash: l.transactionHash as `0x${string}`,
  } as unknown as Log;
}

/** Lấy log của contract trong [from, to] từ API kiểu Etherscan (Routescan). Lỗi thì ném, để quay về đọc bằng RPC. */
async function explorerLogs(from: bigint, to: bigint): Promise<{ logs: Log[]; times: Map<string, bigint> }> {
  const logs: Log[] = [];
  const times = new Map<string, bigint>();
  for (let page = 1; page <= 20; page++) {
    const url = `${EXPLORER_API}?module=logs&action=getLogs&address=${addresses.escrow}&fromBlock=${from}&toBlock=${to}&page=${page}&offset=1000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Explorer HTTP ${res.status}`);
    const body = (await res.json()) as { status: string; message: string; result: ExplorerLog[] | string };
    // "No records found" là kết quả hợp lệ (đoạn đó không có sự kiện), không phải lỗi.
    if (!Array.isArray(body.result)) {
      if (/no records/i.test(body.message) || /no records/i.test(String(body.result))) break;
      throw new Error(`Explorer: ${body.message} ${String(body.result).slice(0, 80)}`);
    }
    for (const l of body.result) {
      times.set(BigInt(l.blockNumber).toString(), BigInt(l.timeStamp));
      logs.push(explorerToLog(l));
    }
    if (body.result.length < 1000) break;
  }
  return { logs, times };
}

/** Giải mã log của contract và lưu vào chain_events. Trả số sự kiện đã đọc.
 *  `knownTimes`: thời điểm theo số khối nếu đã biết (API trình duyệt khối trả sẵn), khỏi hỏi RPC. */
async function saveLogs(conn: Awaited<ReturnType<typeof db>>, logs: Log[], knownTimes?: Map<string, bigint>): Promise<number> {
  const decoded = logs.flatMap((log) => {
    try {
      const ev = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
      const args = ev.args as { id?: bigint; to?: number };
      if (args.id === undefined) return [];
      // StateChanged ghi kèm trạng thái mới, vd "StateChanged:ACTIVE" (poke chỉ phát sự kiện này).
      const name = ev.eventName === "StateChanged" ? `StateChanged:${DEAL_STATES[Number(args.to)]}` : ev.eventName;
      return [{ log, event: name, dealId: args.id }];
    } catch {
      return [];
    }
  });
  // Thời điểm = timestamp của khối chứa giao dịch.
  const blocks = [...new Set(decoded.map((d) => BigInt(d.log.blockNumber as unknown as string)))].filter(
    (b) => !knownTimes?.has(b.toString()),
  );
  const times = new Map([
    ...(knownTimes ?? new Map<string, bigint>()),
    ...(await Promise.all(
      blocks.map(async (b) => [b.toString(), (await publicClient.getBlock({ blockNumber: b })).timestamp] as const),
    )),
  ]);
  for (const d of decoded) {
    const block = BigInt(d.log.blockNumber as unknown as string);
    await conn.query(
      `INSERT INTO chain_events (tx_hash, log_index, block_number, deal_id, event, at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6)) ON CONFLICT DO NOTHING`,
      [d.log.transactionHash, Number(d.log.logIndex), block.toString(), d.dealId.toString(), d.event, Number(times.get(block.toString()))],
    );
  }
  return decoded.length;
}

/** Đọc thêm tối đa maxChunks đoạn khối, dừng sớm khi quá budgetMs. Lỗi RPC thì dừng, lần sau đọc tiếp
 *  (con trỏ đã lưu sau mỗi đoạn). Trả số sự kiện mới. */
export async function syncEvents(maxChunks = 10, budgetMs = Infinity): Promise<number> {
  const startedAt = Date.now();
  const conn = await db();
  const key = await cursorKey();
  const rows = await conn.query<{ value: string }>("SELECT value FROM sync_state WHERE key = $1", [key]);
  let from = rows[0] ? BigInt(rows[0].value) + BigInt(1) : BigInt(deployments.deployBlock ?? 0);
  const latest = await publicClient.getBlockNumber();
  let added = 0;

  // Tồn nhiều: đuổi kịp bằng trình duyệt khối, chừa EXPLORER_LAG khối mới nhất cho RPC. Lỗi thì đọc bằng RPC như cũ.
  if (latest - from > EXPLORER_MIN_GAP) {
    const until = latest - EXPLORER_LAG;
    try {
      const { logs, times } = await explorerLogs(from, until);
      added += await saveLogs(conn, logs, times);
      await conn.query(
        "INSERT INTO sync_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [key, until.toString()],
      );
      from = until + BigInt(1);
    } catch (e) {
      console.warn("[events] trình duyệt khối lỗi, đọc bằng RPC:", (e as Error).message?.split("\n")[0]);
    }
  }

  let chunks = 0;
  while (chunks < maxChunks && from <= latest && Date.now() - startedAt < budgetMs) {
    // Hỏi song song vài đoạn liền nhau rồi xử lý theo thứ tự; đoạn nào lỗi thì dừng ở đó (lần sau đọc tiếp).
    const ranges: { from: bigint; to: bigint }[] = [];
    for (let f = from; ranges.length < PARALLEL && chunks + ranges.length < maxChunks && f <= latest; ) {
      const to = f + CHUNK - BigInt(1) < latest ? f + CHUNK - BigInt(1) : latest;
      ranges.push({ from: f, to });
      f = to + BigInt(1);
    }
    const results = await Promise.allSettled(
      ranges.map(
        (r) =>
          logsClient.request({
            method: "eth_getLogs",
            params: [{ address: addresses.escrow, fromBlock: numberToHex(r.from), toBlock: numberToHex(r.to) }],
          }) as Promise<Log[]>,
      ),
    );
    for (let k = 0; k < ranges.length; k++) {
      const res = results[k];
      if (res.status === "rejected") throw res.reason;
      added += await saveLogs(conn, res.value);
      await conn.query(
        "INSERT INTO sync_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [key, ranges[k].to.toString()],
      );
      from = ranges[k].to + BigInt(1);
      chunks++;
    }
  }
  return added;
}

let lastSyncAt = 0;
let syncing: Promise<unknown> | null = null;

/** Bản nhẹ cho các trang đọc: mỗi phiên bản hàm đọc sự kiện tối đa 1 lần / 15 giây, không chạy chồng nhau,
 *  và không bắt người dùng chờ quá `waitMs` (đọc dở thì lần sau đọc tiếp nhờ con trỏ trong sync_state). */
export async function syncEventsSoon(waitMs = 1500): Promise<void> {
  if (!syncing && Date.now() - lastSyncAt > 15_000) {
    lastSyncAt = Date.now();
    syncing = syncEvents(3)
      .catch((e) => console.error("[events]", (e as Error).message?.split("\n")[0]))
      .finally(() => {
        syncing = null;
      });
  }
  if (syncing) await Promise.race([syncing, new Promise((r) => setTimeout(r, waitMs))]);
}

/** Lịch sử của một deal, cũ trước mới sau. StateChanged chỉ giữ khi giao dịch đó không có sự kiện nào khác
 *  (vd poke chuyển RESERVED → ACTIVE), vì các trường hợp còn lại đã có sự kiện chính nói rõ hơn. */
export async function dealHistory(dealId: bigint): Promise<{ event: string; txHash: Hash; at: string }[]> {
  const rows = await (await db()).query<{ event: string; tx_hash: string; at: string | Date }>(
    `SELECT e.event, e.tx_hash, e.at FROM chain_events e
     WHERE e.deal_id = $1
       AND (e.event NOT LIKE 'StateChanged:%' OR NOT EXISTS (
         SELECT 1 FROM chain_events o
         WHERE o.tx_hash = e.tx_hash AND o.deal_id = e.deal_id AND o.event NOT LIKE 'StateChanged:%'))
     ORDER BY e.block_number, e.log_index`,
    [dealId.toString()],
  );
  return rows.map((r) => ({ event: r.event, txHash: r.tx_hash as Hash, at: new Date(r.at).toISOString() }));
}
