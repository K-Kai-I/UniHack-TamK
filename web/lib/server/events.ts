// Đọc sự kiện của contract về database để làm mục history trong GET /deals/:id.
// RPC công khai của Fuji giới hạn số khối mỗi lần eth_getLogs, nên đọc từng đoạn 2.000 khối
// và nhớ khối cuối đã đọc. Bot keeper gọi mỗi phút nên mỗi lần chỉ phải đọc một hai đoạn.
import "server-only";
import { decodeEventLog, numberToHex, type Log } from "viem";
import deployments from "@shared/deployments.json";
import { addresses, escrowAbi } from "../chain";
import { publicClient } from "./chain";
import { db } from "./db";
import { DEAL_STATES, type Hash } from "../types";

const CHUNK = BigInt(2000);

async function cursorKey() {
  return `events:${addresses.escrow.toLowerCase()}`;
}

/** Đọc thêm tối đa maxChunks đoạn khối. Lỗi RPC thì dừng, lần sau đọc tiếp. Trả số sự kiện mới. */
export async function syncEvents(maxChunks = 10): Promise<number> {
  const conn = await db();
  const key = await cursorKey();
  const rows = await conn.query<{ value: string }>("SELECT value FROM sync_state WHERE key = $1", [key]);
  let from = rows[0] ? BigInt(rows[0].value) + BigInt(1) : BigInt(deployments.deployBlock ?? 0);
  const latest = await publicClient.getBlockNumber();
  let added = 0;

  for (let i = 0; i < maxChunks && from <= latest; i++) {
    const to = from + CHUNK - BigInt(1) < latest ? from + CHUNK - BigInt(1) : latest;
    const logs = (await publicClient.request({
      method: "eth_getLogs",
      params: [{ address: addresses.escrow, fromBlock: numberToHex(from), toBlock: numberToHex(to) }],
    })) as Log[];

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
    const blocks = [...new Set(decoded.map((d) => BigInt(d.log.blockNumber as unknown as string)))];
    const times = new Map(
      await Promise.all(
        blocks.map(async (b) => [b.toString(), (await publicClient.getBlock({ blockNumber: b })).timestamp] as const),
      ),
    );
    for (const d of decoded) {
      const block = BigInt(d.log.blockNumber as unknown as string);
      await conn.query(
        `INSERT INTO chain_events (tx_hash, log_index, block_number, deal_id, event, at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6)) ON CONFLICT DO NOTHING`,
        [d.log.transactionHash, Number(d.log.logIndex), block.toString(), d.dealId.toString(), d.event, Number(times.get(block.toString()))],
      );
      added++;
    }
    await conn.query(
      "INSERT INTO sync_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [key, to.toString()],
    );
    from = to + BigInt(1);
  }
  return added;
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
