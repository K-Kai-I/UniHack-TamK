// Xác thực: header Authorization: Bearer <access token của Privy>.
// Server kiểm tra token, hỏi Privy các ví của user, và KHÔNG tin địa chỉ ví client tự gửi.
// Client có nhiều ví thì gửi thêm header x-wallet-address để chọn; ví đó phải thuộc user.
import "server-only";
import { PrivyClient } from "@privy-io/server-auth";
import type { Address } from "../types";
import { env } from "./env";
import { ApiErr } from "./http";

let client: PrivyClient | undefined;
function privy(): PrivyClient {
  try {
    client ??= new PrivyClient(env.privyAppId(), env.privyAppSecret());
  } catch {
    throw new ApiErr("UNAUTHORIZED", "Server chưa cấu hình Privy (NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET)");
  }
  return client;
}

const walletCache = new Map<string, { wallets: Address[]; at: number }>();

async function walletsOf(userId: string): Promise<Address[]> {
  const hit = walletCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.wallets;
  const user = await privy().getUserById(userId);
  const wallets = user.linkedAccounts
    .filter((a) => a.type === "wallet" && (a as { chainType?: string }).chainType === "ethereum")
    .map((a) => a as unknown as { address: string; walletClientType?: string })
    // ví nhúng (đăng nhập Google) đứng trước
    .sort((a, b) => Number(b.walletClientType === "privy") - Number(a.walletClientType === "privy"))
    .map((a) => a.address.toLowerCase() as Address);
  walletCache.set(userId, { wallets, at: Date.now() });
  return wallets;
}

/** Chỉ dùng khi chạy local: AUTH_DEV_BYPASS=1 và không chạy trên Vercel. */
function devWallet(req: Request): Address | null {
  if (process.env.AUTH_DEV_BYPASS !== "1" || process.env.VERCEL) return null;
  const w = req.headers.get("x-dev-wallet");
  return w && /^0x[0-9a-fA-F]{40}$/.test(w) ? (w.toLowerCase() as Address) : null;
}

/** Trả địa chỉ ví (chữ thường) của người gọi, hoặc ném UNAUTHORIZED. */
export async function requireWallet(req: Request): Promise<Address> {
  const dev = devWallet(req);
  if (dev) return dev;

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ApiErr("UNAUTHORIZED", "Thiếu access token");

  let userId: string;
  try {
    userId = (await privy().verifyAuthToken(token)).userId;
  } catch (e) {
    if (e instanceof ApiErr) throw e;
    throw new ApiErr("UNAUTHORIZED", "Access token không hợp lệ hoặc đã hết hạn");
  }

  const wallets = await walletsOf(userId);
  if (wallets.length === 0) throw new ApiErr("UNAUTHORIZED", "Tài khoản chưa có ví Ethereum");
  const picked = req.headers.get("x-wallet-address")?.toLowerCase();
  if (picked) {
    if (!wallets.includes(picked as Address)) throw new ApiErr("FORBIDDEN", "Ví này không thuộc tài khoản");
    return picked as Address;
  }
  return wallets[0];
}
