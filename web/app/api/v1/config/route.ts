// GET /api/v1/config: docs/api-contract.md > GET /config.
// Route mẫu: các route khác viết theo cùng kiểu (types từ lib/types, lỗi qua lib/server/http).
import { NextResponse } from "next/server";
import { addresses, explorerTxUrl } from "@/lib/chain";
import { env } from "@/lib/server/env";
import { readTimeouts } from "@/lib/server/chain";
import { apiError } from "@/lib/server/http";
import type { ConfigResponse } from "@/lib/types";

export async function GET() {
  try {
    const timeouts = await readTimeouts();
    const body: ConfigResponse = {
      chainId: 43113,
      contracts: { escrow: addresses.escrow, token: addresses.token, vault: addresses.vault },
      aiSigner: addresses.aiSigner,
      tokenDecimals: 6,
      vndPerToken: env.vndPerToken,
      feeBps: env.feeBps,
      timeouts,
      explorerTxUrl,
    };
    return NextResponse.json(body);
  } catch (e) {
    // Chưa deploy contract (địa chỉ 0x0) hoặc RPC lỗi.
    return apiError("WRONG_STATE", `Không đọc được contract: ${(e as Error).message}`);
  }
}
