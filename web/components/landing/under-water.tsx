// "Dưới mặt nước": phần duy nhất của landing nói về chuỗi. Số liệu đọc thật từ Avalanche Fuji lúc render
// (trang làm mới mỗi 60 giây), không có con số nào gõ tay.
import "server-only";
import type React from "react";
import { ExternalLink } from "lucide-react";
import deployments from "@shared/deployments.json";
import { addresses, usdcAbi, TOKEN_DECIMALS } from "@/lib/chain";
import { escrowAbi } from "@/lib/abi";
import { publicClient } from "@/lib/server/chain";
import { env } from "@/lib/server/env";
import s from "./landing.module.css";

const SNOW = "https://testnet.snowtrace.io";

interface Live { deals: bigint; locked: bigint; block: bigint; at: Date }

async function readLive(): Promise<Live | null> {
  try {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000));
    const [deals, locked, block] = await Promise.race([
      Promise.all([
        publicClient.readContract({ address: addresses.escrow, abi: escrowAbi, functionName: "dealCount" }),
        publicClient.readContract({ address: addresses.token, abi: usdcAbi, functionName: "balanceOf", args: [addresses.escrow] }),
        publicClient.getBlockNumber(),
      ]),
      timeout,
    ]);
    return { deals: deals as bigint, locked: locked as bigint, block, at: new Date() };
  } catch {
    return null;
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function toVnd(units: bigint) {
  // Tiền thử 6 số lẻ → VND theo vndPerToken; chỉ để hiển thị, không gửi lên chuỗi.
  const whole = Number(units / BigInt(10 ** TOKEN_DECIMALS));
  return (whole * env.vndPerToken).toLocaleString("vi-VN") + " ₫";
}

export async function UnderWater() {
  const live = await readLive();
  const contracts = [
    { name: "Hợp đồng giữ cọc", addr: deployments.contracts.DepositEscrow },
    { name: "Tiền thử (USDC test)", addr: deployments.contracts.MockUSDC },
    { name: "Ví ký con dấu AI", addr: deployments.aiSigner },
  ];

  return (
    <section id="kiem-chung" aria-labelledby="deep-title" className={`${s.deep} py-20 md:py-28`}>
      <div className={`${s.wrap} space-y-14`}>
        <div className="max-w-[46rem] space-y-4">
          <h2 id="deep-title" className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] text-balance md:text-6xl">Dưới mặt nước</h2>
          <p className={`text-lg ${s.deepMuted}`}>
            Bạn không cần đọc phần này để dùng app. Nó dành cho người muốn tự kiểm chứng: hợp đồng chạy trên Avalanche Fuji, ai cũng xem được mã và từng giao dịch.
          </p>
        </div>

        <div className={`space-y-3 border-y py-8 ${s.deepRule}`}>
          {live ? (
            <p className="max-w-[60rem] text-2xl leading-snug font-semibold text-pretty md:text-[2rem]">
              Lúc <Num>{live.at.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}</Num>, đã có{" "}
              <Num>{live.deals.toString()}</Num> phòng được đăng lên hợp đồng, {live.locked > BigInt(0) ? <>và hợp đồng đang giữ <Num>{toVnd(live.locked)}</Num> tiền thử.</> : <>và lúc này không có khoản cọc nào đang nằm chờ.</>} Khối mới nhất:{" "}
              <Num>#{live.block.toLocaleString("vi-VN")}</Num>.
            </p>
          ) : (
            <p className="text-2xl font-semibold">Chưa đọc được chuỗi lúc này. Bạn vẫn xem được hợp đồng trực tiếp trên Snowtrace ở bên dưới.</p>
          )}
          <p className={`text-sm ${s.deepMuted}`}>Đọc trực tiếp từ Avalanche Fuji khi trang được tạo, làm mới mỗi phút. Giờ Việt Nam. Không có con số nào gõ tay.</p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          <div className="space-y-5">
            <h3 className="text-2xl font-extrabold tracking-tight">Tiền chỉ đi tới bốn nơi</h3>
            <ol className={`divide-y border-y ${s.deepRule}`}>
              {[
                ["Người thuê", "phần cọc còn lại sau mức trừ"],
                ["Chủ trọ", "mức trừ đã chốt, hoặc phí giữ chỗ nếu người thuê không đến"],
                ["Ví phí", "chỉ nhận phí trên tiền lãi, khi có bật gửi lãi"],
                ["Két lãi", "nơi cọc được gửi để sinh lãi, nếu người thuê chọn"],
              ].map(([who, what]) => (
                <li key={who} className={`flex gap-4 py-4 ${s.deepRule}`}>
                  <span className="w-28 shrink-0 font-bold">{who}</span>
                  <span className={s.deepMuted}>{what}</span>
                </li>
              ))}
            </ol>
            <p className={s.deepMuted}>
              Không có hàm nào cho nhóm, server hay AI rút tiền. Ví deploy chỉ làm được hai việc: thêm và bớt bồi thẩm.
            </p>
          </div>

          <dl className="grid content-start gap-x-8 gap-y-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
            {[
              ["Mạng", "Avalanche Fuji (C-Chain, chain ID " + deployments.chainId + "). Giao dịch chốt trong 1–2 giây."],
              ["Hợp đồng", "Solidity 0.8.24, OpenZeppelin v5. Không proxy, không ai nâng cấp hay đổi luật sau khi deploy."],
              ["Ảnh", "Chụp bằng camera trong app. Mã SHA-256 của bộ ảnh được ghi lên chuỗi, sửa một điểm ảnh là lệch."],
              ["Con dấu AI", "Chữ ký EIP-712 gắn với số hợp đồng và mã bộ ảnh. Hợp đồng tự kiểm tra người ký, không dùng lại được cho hợp đồng khác."],
              ["Hạn chót", "Ghi trong hợp đồng. Quá hạn thì ai cũng gọi được poke() để tiền đi theo luật."],
              ["Đăng nhập", "Google qua Privy, ví tạo ngầm. Người dùng không cần biết ví là gì."],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-bold">{k}</dt>
                <dd className={s.deepMuted}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <ul className={`grid gap-3 border-t pt-8 sm:grid-cols-3 ${s.deepRule}`}>
          {contracts.map((c) => (
            <li key={c.addr}>
              <a href={`${SNOW}/address/${c.addr}`} target="_blank" rel="noreferrer" className="group flex min-h-14 items-center justify-between gap-3 rounded-xl px-1 py-2 hover:underline underline-offset-4">
                <span className="min-w-0">
                  <span className="block font-semibold">{c.name}</span>
                  <span className={`block font-mono text-sm ${s.deepMuted}`}>{short(c.addr)}</span>
                </span>
                <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
                <span className="sr-only">(mở Snowtrace trong thẻ mới)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono font-semibold whitespace-nowrap tabular-nums underline decoration-white/30 decoration-2 underline-offset-[0.2em]">{children}</span>;
}
