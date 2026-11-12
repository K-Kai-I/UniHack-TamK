// Đọc chuỗi phía server. Trạng thái hợp đồng luôn lấy từ đây, không lấy từ database.
import "server-only";
import { createPublicClient, http } from "viem";
import { addresses, chain, escrowAbi } from "../chain";
import { env } from "./env";
import { DEAL_STATES } from "../types";

export const publicClient = createPublicClient({ chain, transport: http(env.fujiRpcUrl) });

export async function readDeal(dealId: bigint) {
  const deal = await publicClient.readContract({
    address: addresses.escrow,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [dealId],
  });
  return { ...deal, stateName: DEAL_STATES[deal.state] };
}

export async function readTimeouts() {
  const names = [
    "moveInGrace",
    "checkInObjection",
    "mismatchWindow",
    "abandonWindow",
    "checkOutGrace",
    "proposeWindow",
    "respondWindow",
    "juryWindow",
  ] as const;
  const values = await Promise.all(
    names.map((functionName) =>
      publicClient.readContract({ address: addresses.escrow, abi: escrowAbi, functionName }),
    ),
  );
  return Object.fromEntries(names.map((n, i) => [n, Number(values[i])])) as Record<(typeof names)[number], number>;
}
