"use client";
// Chủ trọ ký createDeal bằng ví. Đối số lấy NGUYÊN từ POST /api/v1/listings > createDealArgs
// (docs/api-contract.md): frontend không tự đổi ngày sang giây, không tự tính termsHash (AGENTS.md luật 5).
import { useCallback, useState } from "react";
import { parseEventLogs, type TransactionReceipt } from "viem";
import { addresses, escrowAbi } from "@/lib/chain";
import type { Amount, Hash } from "@/lib/types";
import { useTx, type TxState } from "./use-tx";

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

/**
 * Kết quả createDeal. `ok: false` kèm `txHash` mà không `reverted` nghĩa là giao dịch có thể ĐÃ lên chuỗi:
 * màn gọi không được ký lại, phải kiểm tra/chờ lại theo hash (resumeDeal) để khỏi tạo hai deal.
 */
export type CreateDealResult =
  | { ok: true; dealId: bigint; txHash: Hash }
  | { ok: false; txHash?: Hash; reverted: boolean };

/** Hash của giao dịch đã gửi mà chưa biết kết quả (lỗi mạng lúc chờ, hoặc đã xong nhưng chưa đọc được mã phòng). */
export function sentHashOf(state: TxState): Hash | undefined {
  return state.hash && !state.reverted && (state.phase === "error" || state.phase === "success") ? state.hash : undefined;
}

export const isUnresolved = (r: CreateDealResult) => !r.ok && !!r.txHash && !r.reverted;

/**
 * Ký createDeal, trừ khi lần trước đã gửi giao dịch mà chưa biết kết quả: khi đó chỉ chờ lại giao dịch cũ.
 * Spec không chặn trùng termsHash, nên ký lần hai sẽ tạo deal thứ hai cho cùng một tin.
 */
export async function signOrResume(
  state: TxState,
  actions: { createDeal: (a: CreateDealArgs) => Promise<CreateDealResult>; resumeDeal: (h: Hash) => Promise<CreateDealResult> },
  args: CreateDealArgs,
  onStart?: (kind: "sign" | "check") => void,
): Promise<CreateDealResult> {
  const hash = sentHashOf(state);
  onStart?.(hash ? "check" : "sign");
  return hash ? actions.resumeDeal(hash) : actions.createDeal(args);
}

function readDealId(receipt: TransactionReceipt): CreateDealResult {
  // dealId nằm trong event DealCreated (indexed id).
  const [ev] = parseEventLogs({ abi: escrowAbi, eventName: "DealCreated", logs: receipt.logs });
  const id = ev?.args.id ?? null;
  // Bước kế do màn gọi làm: POST /listings/:listingId/onchain { dealId, txHash }.
  return id === null
    ? { ok: false, txHash: receipt.transactionHash, reverted: false }
    : { ok: true, dealId: id, txHash: receipt.transactionHash };
}

export function useCreateDeal() {
  const tx = useTx();
  const { run, resume, outcome } = tx;
  const [dealId, setDealId] = useState<bigint | null>(null);

  /** Ký createDeal. Thành công trả { ok: true, dealId, txHash } (txHash để gọi POST /listings/:id/onchain). */
  const createDeal = useCallback(
    async (a: CreateDealArgs): Promise<CreateDealResult> => {
      setDealId(null);
      const receipt = await run({
        address: addresses.escrow,
        abi: escrowAbi,
        functionName: "createDeal",
        // Số tiền: chuỗi → bigint (AGENTS.md luật 8), không qua number.
        args: [BigInt(a.deposit), BigInt(a.reserveFee), BigInt(a.moveInDate), BigInt(a.leaseEnd), a.yieldEnabled, a.termsHash],
      });
      if (!receipt) return { ok: false, txHash: outcome.current.hash, reverted: outcome.current.reverted };
      const result = readDealId(receipt);
      if (result.ok) setDealId(result.dealId);
      return result;
    },
    [run, outcome],
  );

  /** Chờ lại giao dịch createDeal đã gửi (không ký mới) và đọc dealId từ biên nhận. */
  const resumeDeal = useCallback(
    async (hash: Hash): Promise<CreateDealResult> => {
      const receipt = await resume(hash);
      if (!receipt) return { ok: false, txHash: hash, reverted: outcome.current.reverted };
      const result = readDealId(receipt);
      if (result.ok) setDealId(result.dealId);
      return result;
    },
    [resume, outcome],
  );

  return { ...tx, createDeal, resumeDeal, dealId };
}
