"use client";
// Hook gửi giao dịch lên contract, có đúng 3 trạng thái cho UI (AGENTS.md):
//   chờ ký / chờ xác nhận (signing, pending) → xong (success, kèm hash cho link Snowtrace) → lỗi (error).
//
// Hai đường gửi:
//  1. Mặc định: wagmi writeContractAsync (ví Privy hoặc ví ngoài), người dùng tự trả gas bằng AVAX test.
//  2. Trả gas hộ: bật NEXT_PUBLIC_SPONSOR_GAS=1 VÀ ví đang dùng là ví embedded của Privy →
//     useSendTransaction(..., { sponsor: true }). Cần bật "Fee sponsorship" cho Fuji trong Privy dashboard.
//     Ví ngoài (MetaMask/Core) luôn đi đường 1.
// Trước khi gửi luôn mô phỏng (simulateContract) để lỗi của contract hiện ra bằng tiếng Việt,
// và để không đốt hạn mức trả gas hộ cho giao dịch chắc chắn revert.
import { useCallback, useRef, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { encodeFunctionData, isAddressEqual, zeroAddress, type Abi, type TransactionReceipt } from "viem";
import { chain } from "@/lib/chain";
import type { Address, Hash } from "@/lib/types";
import { friendlyTxError } from "./tx-errors";

export type TxPhase = "idle" | "signing" | "pending" | "success" | "error";

export interface TxState {
  phase: TxPhase;
  hash?: Hash;
  error?: string;
  /** true nếu giao dịch này đi đường trả gas hộ của Privy. */
  sponsored?: boolean;
  /** true khi chuỗi đã chạy và báo revert: chắc chắn chưa đổi gì, ký lại là an toàn. Có hash mà không có cờ này nghĩa là chưa biết kết quả. */
  reverted?: boolean;
}

/** Kết quả lần gửi gần nhất, đọc đồng bộ (state React chỉ cập nhật ở lần render sau). */
export interface TxOutcome {
  hash?: Hash;
  reverted: boolean;
}

export interface TxRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

const SPONSOR_ENABLED = process.env.NEXT_PUBLIC_SPONSOR_GAS === "1";

export function useTx() {
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const { address: account } = useAccount();
  const { wallets } = useWallets();
  const publicClient = usePublicClient({ chainId: chain.id });
  const { writeContractAsync } = useWriteContract();
  const { sendTransaction } = useSendTransaction();

  const outcome = useRef<TxOutcome>({ reverted: false });

  const reset = useCallback(() => {
    outcome.current = { reverted: false };
    setState({ phase: "idle" });
  }, []);

  /** Gửi giao dịch. Trả về receipt nếu thành công, null nếu lỗi (lỗi nằm trong state.error). */
  const run = useCallback(
    async (req: TxRequest): Promise<TransactionReceipt | null> => {
      if (!account || !publicClient) {
        setState({ phase: "error", error: "Chưa có ví. Đăng nhập rồi thử lại." });
        return null;
      }
      if (isAddressEqual(req.address, zeroAddress)) {
        setState({
          phase: "error",
          error: "Contract chưa được deploy (shared/deployments.json còn địa chỉ 0x0). Chờ Khải deploy.",
        });
        return null;
      }

      const embedded = wallets.find(
        (w) => w.walletClientType === "privy" && isAddressEqual(w.address as Address, account),
      );
      const sponsored = SPONSOR_ENABLED && !!embedded;

      try {
        outcome.current = { reverted: false };
        setState({ phase: "signing", sponsored });

        // Mô phỏng trước: revert thì ném lỗi custom của contract ngay, chưa tốn gas.
        await publicClient.simulateContract({
          account,
          address: req.address,
          abi: req.abi,
          functionName: req.functionName,
          args: req.args,
        });

        let hash: Hash;
        if (sponsored) {
          const data = encodeFunctionData({ abi: req.abi, functionName: req.functionName, args: req.args });
          const res = await sendTransaction(
            { to: req.address, data, chainId: chain.id },
            { sponsor: true, address: embedded!.address },
          );
          hash = res.hash;
        } else {
          hash = await writeContractAsync({
            address: req.address,
            abi: req.abi,
            functionName: req.functionName,
            args: req.args,
            chainId: chain.id,
          });
        }

        outcome.current = { hash, reverted: false };
        setState({ phase: "pending", hash, sponsored });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          outcome.current = { hash, reverted: true };
          setState({ phase: "error", hash, sponsored, reverted: true, error: "Giao dịch bị chuỗi từ chối (reverted)." });
          return null;
        }
        setState({ phase: "success", hash, sponsored });
        return receipt;
      } catch (e) {
        setState((s) => ({ phase: "error", hash: s.hash, sponsored, error: friendlyTxError(e) }));
        return null;
      }
    },
    [account, publicClient, wallets, writeContractAsync, sendTransaction],
  );

  /**
   * Chờ lại kết quả của một giao dịch ĐÃ gửi (hash có sẵn) mà lần trước chưa biết kết quả.
   * Không ký và không gửi gì mới. Trả về receipt nếu thành công, ngược lại null.
   */
  const resume = useCallback(
    async (hash: Hash): Promise<TransactionReceipt | null> => {
      if (!publicClient) {
        setState((s) => ({ ...s, phase: "error", hash, error: "Chưa kết nối được chuỗi. Thử lại sau." }));
        return null;
      }
      outcome.current = { hash, reverted: false };
      setState((s) => ({ phase: "pending", hash, sponsored: s.sponsored }));
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          outcome.current = { hash, reverted: true };
          setState((s) => ({
            phase: "error", hash, sponsored: s.sponsored, reverted: true,
            error: "Giao dịch bị chuỗi từ chối (reverted).",
          }));
          return null;
        }
        setState((s) => ({ phase: "success", hash, sponsored: s.sponsored }));
        return receipt;
      } catch (e) {
        setState((s) => ({ phase: "error", hash, sponsored: s.sponsored, error: friendlyTxError(e) }));
        return null;
      }
    },
    [publicClient],
  );

  return { state, run, resume, outcome, reset, sponsorEnabled: SPONSOR_ENABLED };
}
