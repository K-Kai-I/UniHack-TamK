// Đọc log từ API trình duyệt khối (Routescan): dữ liệu mẫu chép từ API thật, contract v5 trên Fuji.
// Chạy: npm run be:test
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeEventLog } from "viem";
import { escrowAbi } from "../../chain";
import { explorerToLog, type ExplorerLog } from "../events";

const dealCreated: ExplorerLog = {
  topics: [
    "0x549ef9350b1a59c9c81e6f6a026f46f931b4c1b1e330762508fefdf979c588a0",
    "0x0000000000000000000000000000000000000000000000000000000000000002",
    "0x0000000000000000000000001ae0cb564afb8f442d1568e80fd2fb21e63d6a22",
  ],
  data: "0x00000000000000000000000000000000000000000000000000000000014fb1800000000000000000000000000000000000000000000000000000000000432380000000000000000000000000000000000000000000000000000000006afd06a0000000000000000000000000000000000000000000000000000000006cde3a200000000000000000000000000000000000000000000000000000000000000001200bdeae85cda81b0124c380272f5db6f125758a3e98a4d876059327f84ea86d",
  blockNumber: "0x3a732d9",
  timeStamp: "0x6afdc654",
  logIndex: "0x", // Routescan ghi logIndex 0 là "0x"
  transactionHash: "0x51d2c8c885c063906cfc91542c307c26393cb2547f57a91224c11a585ac26feb",
};

test("log Routescan đổi sang viem: logIndex '0x' là 0, giải mã được sự kiện của deal #2", () => {
  const log = explorerToLog(dealCreated);
  assert.equal((log as unknown as { logIndex: number }).logIndex, 0);
  assert.equal((log as unknown as { blockNumber: bigint }).blockNumber, 61289177n);
  const ev = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
  assert.equal((ev.args as { id?: bigint }).id, 2n);
});

test("data rỗng (sự kiện không có dữ liệu) đổi thành '0x', không làm hỏng giải mã", () => {
  const log = explorerToLog({ ...dealCreated, data: "", logIndex: "0x6" });
  assert.equal(log.data, "0x");
  assert.equal((log as unknown as { logIndex: number }).logIndex, 6);
});
