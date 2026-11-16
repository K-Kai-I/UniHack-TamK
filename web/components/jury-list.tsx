"use client";
// Danh sách vụ chờ phiếu của một bồi thẩm (GET /disputes?juror=, P1). Chạm một vụ để mở màn Bỏ phiếu.
// Ví có phải bồi thẩm hay không do contract quyết (isJuror, owner thêm bằng addJuror); server chỉ đọc lại.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { ChevronRight, Gavel, Hourglass, Inbox, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { WalletChip } from "@/components/wallet-chip";
import { DEALS_MOCK } from "@/lib/client/deals-data";
import { fetchJurorDisputes, type JurorDisputeItem } from "@/lib/client/disputes-api";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import type { Address } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIND_LABEL = { DEDUCTION: "Tranh chấp mức trừ", MISMATCH: "Phòng sai mô tả" } as const;

export function JuryList() {
  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const signedIn = DEALS_MOCK || (authenticated && !!address);
  const q = useQuery({
    queryKey: ["juror-disputes", address],
    queryFn: () => fetchJurorDisputes((address ?? zeroAddress) as Address),
    enabled: ready && signedIn,
    refetchInterval: 15_000, // vụ mới mở hoặc bồi thẩm khác vừa chốt
  });

  let body: React.ReactNode;
  if (!ready || (signedIn && q.isPending)) {
    body = (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  } else if (!signedIn) {
    body = (
      <Empty icon={<Gavel className="size-8" />} title="Đăng nhập để xem vụ chờ phiếu">
        <Button onClick={login}>Đăng nhập</Button>
      </Empty>
    );
  } else if (q.error) {
    body = (
      <Empty icon={<Inbox className="size-8" />} title="Không tải được danh sách" text="Kiểm tra mạng rồi thử lại.">
        <Button onClick={() => q.refetch()}>Thử lại</Button>
      </Empty>
    );
  } else if (!q.data?.isJuror) {
    body = (
      <Empty
        icon={<UserX className="size-8" />}
        title="Ví này chưa là bồi thẩm"
        text="Danh sách bồi thẩm do nhóm vận hành thêm vào contract. Bạn vẫn mở được bằng chứng của một vụ từ trang hợp đồng."
      >
        <WalletChip address={address} />
      </Empty>
    );
  } else if (q.data.items.length === 0) {
    body = <Empty icon={<Inbox className="size-8" />} title="Không có vụ nào chờ phiếu" text="Có vụ mới, danh sách tự cập nhật." />;
  } else {
    body = (
      <ul className="space-y-3">
        {q.data.items.map((it) => (
          <li key={it.dealId}>
            <DisputeCard item={it} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <NetworkBanner />
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-16">
        <PageHeader href="/" backLabel="Về trang chủ" title="Bồi thẩm" />
        <section className="mt-2 mb-6 space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">Vụ chờ phiếu của bạn</h1>
          <p className="text-muted-foreground">
            Xem ảnh, chọn một bên. Bên nào đủ 2 phiếu thì thắng ngay. Bạn không nhập số tiền.
          </p>
        </section>
        {body}
        {DEALS_MOCK && <p className="mt-6 text-xs text-muted-foreground">Dữ liệu giả: ví nào cũng được coi là bồi thẩm.</p>}
      </main>
    </>
  );
}

function DisputeCard({ item }: { item: JurorDisputeItem }) {
  const { passed, msLeft } = useCountdown(item.deadline);
  return (
    <Link
      href={`/jury/${item.dealId}`}
      className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition hover:bg-secondary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
          <Gavel className="size-3.5" /> {KIND_LABEL[item.kind]} · #{item.dealId}
        </p>
        <p className="truncate font-semibold">{item.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1 tabular-nums", passed && "text-destructive")}>
            <Hourglass className="size-3.5" />
            {passed ? "Hết hạn bỏ phiếu" : msLeft !== null ? `Còn ${formatDuration(msLeft)}` : ""}
          </span>
          <span className="tabular-nums">
            Chủ trọ {item.votes.landlord} · Người thuê {item.votes.tenant}
          </span>
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-2xl bg-muted px-6 py-12 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="font-semibold">{title}</p>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
      {children}
    </div>
  );
}
