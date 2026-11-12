// Con dấu AI (EIP-712): docs/contract-spec.md > Con dấu AI.
// Phải khớp DAMAGE_REPORT_TYPEHASH / MISMATCH_REPORT_TYPEHASH trong contracts/src/DepositEscrow.sol.
import type { Address } from "./types";

export function sealDomain(chainId: number, verifyingContract: Address) {
  return { name: "KetCocTro", version: "1", chainId, verifyingContract } as const;
}

export const sealTypes = {
  DamageReport: [
    { name: "dealId", type: "uint256" },
    { name: "checkInHash", type: "bytes32" },
    { name: "checkOutHash", type: "bytes32" },
    { name: "aiAmount", type: "uint256" },
    { name: "reportHash", type: "bytes32" },
  ],
  MismatchReport: [
    { name: "dealId", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "verdict", type: "uint8" },
    { name: "reportHash", type: "bytes32" },
  ],
} as const;
