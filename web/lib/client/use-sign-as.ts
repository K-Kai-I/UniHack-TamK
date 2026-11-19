"use client";
// Trước khi ký: bảo đảm ví đang ký đúng là ví server ghi cho người dùng (vd chủ trọ của phòng).
// Ký nhầm ví (MetaMask thay vì ví Privy) thì giao dịch vẫn lên chuỗi nhưng server không gắn được,
// và bấm lại sẽ tạo hợp đồng trùng. Nên chặn TRƯỚC khi ký.
import { useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount } from "wagmi";
import { isAddressEqual } from "viem";
import { shortAddress } from "./money";

/** Trả null nếu đang ký bằng đúng ví; ngược lại trả câu báo lỗi (đã tự chuyển ví nếu được). */
export function useSignAs() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  return useCallback(
    async (expected: `0x${string}`): Promise<string | null> => {
      if (address && isAddressEqual(address, expected)) return null;
      const right = wallets.find((w) => isAddressEqual(w.address as `0x${string}`, expected));
      if (right) {
        await setActiveWallet(right);
        return `Đã chuyển sang đúng ví ${shortAddress(expected)}. Bấm lại để ký.`;
      }
      return `Phải ký bằng ví ${shortAddress(expected)} (ví của tài khoản lúc đăng phòng), nhưng app đang dùng ví ${address ? shortAddress(address) : "khác"}. Đăng xuất rồi đăng nhập lại bằng Google, rồi thử lại.`;
    },
    [address, wallets, setActiveWallet],
  );
}
