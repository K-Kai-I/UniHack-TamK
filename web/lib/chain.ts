// Mạng, địa chỉ và ABI dùng chung cho frontend và server.
import { avalancheFuji } from "viem/chains";
import deployments from "@shared/deployments.json";
import type { Address } from "./types";

export const chain = avalancheFuji; // chain ID 43113
export const explorerTxUrl = "https://testnet.snowtrace.io/tx/";

export const addresses = {
  escrow: deployments.contracts.DepositEscrow as Address,
  token: deployments.contracts.MockUSDC as Address,
  vault: (deployments.contracts.MockVault ?? null) as Address | null,
  aiSigner: deployments.aiSigner as Address,
};

export { escrowAbi, usdcAbi } from "./abi";

export const TOKEN_DECIMALS = 6;
