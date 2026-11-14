"use client";
// Chủ trọ ký createDeal bằng ví. Đối số lấy NGUYÊN từ POST /api/v1/listings > createDealArgs
// (docs/api-contract.md): frontend không tự đổi ngày sang giây, không tự tính termsHash (AGENTS.md luật 5).
import { useCallback, useState } from "react";
import { parseEventLogs } from "viem";
import { addresses, escrowAbi } from "@/lib/chain";
import type { Amount, Hash } from "@/lib/types";
import { useTx } from "./use-tx";

// TODO(spec): chưa có kiểu CreateDealArgs trong web/lib/types.ts. Khai báo tạm theo
// docs/api-contract.md > POST /listings. Khi nhóm chốt thì chuyển sang types.ts.
export interface CreateDealArgs {
  deposit: Amount;
  reserveFee: Amount;
  moveInDate: number; // giây Unix, API đã đổi sẵn
  leaseEnd: number;
  yieldEnabled: boolean;
  termsHash: Hash;
}

export function useCreateDeal() {
  const tx = useTx();
  const [dealId, setDealId] = useState<bigint | null>(null);

  /** Ký createDeal. Trả về { dealId, txHash } nếu thành công (txHash để gọi POST /listings/:id/onchain), ngược lại null. */
  const createDeal = useCallback(
    async (a: CreateDealArgs): Promise<{ dealId: bigint; txHash: Hash } | null> => {
      setDealId(null);
      const receipt = await tx.run({
        address: addresses.escrow,
        abi: escrowAbi,
        functionName: "createDeal",
        // Số tiền: chuỗi → bigint (AGENTS.md luật 8), không qua number.
        args: [BigInt(a.deposit), BigInt(a.reserveFee), BigInt(a.moveInDate), BigInt(a.leaseEnd), a.yieldEnabled, a.termsHash],
      });
      if (!receipt) return null;

      // dealId nằm trong event DealCreated (indexed id).
      const [ev] = parseEventLogs({ abi: escrowAbi, eventName: "DealCreated", logs: receipt.logs });
      const id = ev?.args.id ?? null;
      setDealId(id);
      // Bước kế do màn gọi làm: POST /listings/:listingId/onchain { dealId, txHash }.
      return id === null ? null : { dealId: id, txHash: receipt.transactionHash };
    },
    [tx],
  );

  return { ...tx, createDeal, dealId };
}
