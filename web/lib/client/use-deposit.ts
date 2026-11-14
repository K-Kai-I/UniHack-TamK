"use client";
// Người thuê gửi cọc bằng MỘT chữ ký giao dịch: ký permit ERC-2612 (không tốn gas, chỉ ký tin nhắn)
// rồi gọi depositWithPermit(id, wantYield, permitDeadline, v, r, s) (docs/contract-spec.md).
// Vì sao permit: gửi stablecoin thường cần 2 giao dịch (approve rồi deposit). Chữ ký permit cho phép
// contract tự "approve" ngay trong deposit, nên người dùng chỉ thấy một lần xác nhận giao dịch.
import { useCallback, useMemo, useState } from "react";
import { useAccount, usePublicClient, useSignTypedData } from "wagmi";
import { parseSignature } from "viem";
import { addresses, chain, escrowAbi, usdcAbi } from "@/lib/chain";
import type { Amount } from "@/lib/types";
import { friendlyTxError } from "./tx-errors";
import { useTx, type TxState } from "./use-tx";

const PERMIT_VALID_SECONDS = 20 * 60; // chữ ký permit chỉ có hiệu lực 20 phút

export function useDeposit() {
  const tx = useTx();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: chain.id });
  const { signTypedDataAsync } = useSignTypedData();
  const [stage, setStage] = useState<"idle" | "permit">("idle");
  const [permitError, setPermitError] = useState<string | undefined>();

  /** Trả true khi giao dịch gửi cọc thành công. */
  const deposit = useCallback(
    async (dealId: number, depositAmount: Amount, wantYield: boolean): Promise<boolean> => {
      if (!address || !publicClient) {
        setPermitError("Chưa có ví. Đăng nhập rồi thử lại.");
        return false;
      }
      setPermitError(undefined);
      tx.reset();
      setStage("permit");
      try {
        // Số tiền cọc phải đủ trong ví, nếu không permit ký xong vẫn revert ở contract.
        const value = BigInt(depositAmount); // AGENTS.md luật 8: bigint, không number
        const [balance, nonce, domain] = await Promise.all([
          publicClient.readContract({ address: addresses.token, abi: usdcAbi, functionName: "balanceOf", args: [address] }),
          publicClient.readContract({ address: addresses.token, abi: usdcAbi, functionName: "nonces", args: [address] }),
          publicClient.readContract({ address: addresses.token, abi: usdcAbi, functionName: "eip712Domain" }),
        ]);
        if (balance < value) {
          setPermitError("Ví chưa đủ mUSDC để gửi cọc. Bấm “Nhận tiền test” rồi thử lại.");
          return false;
        }

        const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALID_SECONDS);
        const signature = await signTypedDataAsync({
          domain: { name: domain[1], version: domain[2], chainId: Number(domain[3]), verifyingContract: domain[4] },
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "Permit",
          message: { owner: address, spender: addresses.escrow, value, nonce, deadline: permitDeadline },
        });
        const { r, s, v, yParity } = parseSignature(signature);
        const vByte = Number(v ?? BigInt(27 + (yParity ?? 0)));

        setStage("idle");
        const receipt = await tx.run({
          address: addresses.escrow,
          abi: escrowAbi,
          functionName: "depositWithPermit",
          args: [BigInt(dealId), wantYield, permitDeadline, vByte, r, s],
        });
        return receipt !== null;
      } catch (e) {
        setPermitError(friendlyTxError(e));
        return false;
      } finally {
        setStage("idle");
      }
    },
    [address, publicClient, signTypedDataAsync, tx],
  );

  // Gộp bước ký permit vào cùng 3 trạng thái của giao dịch để UI chỉ cần một TxStatus.
  const state: TxState = useMemo(() => {
    if (stage === "permit") return { phase: "signing" };
    if (permitError) return { phase: "error", error: permitError };
    return tx.state;
  }, [stage, permitError, tx.state]);

  const reset = useCallback(() => {
    setPermitError(undefined);
    tx.reset();
  }, [tx]);

  return { state, deposit, reset };
}
