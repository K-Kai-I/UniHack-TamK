"use client";
// Danh sách vụ chờ phiếu của một bồi thẩm (GET /disputes?juror=, P1). Chạm một vụ để mở màn Bỏ phiếu.
// Ví có phải bồi thẩm hay không do contract quyết (isJuror, owner thêm bằng addJuror); server chỉ đọc lại.
// Màn này chỉ dẫn tới vụ có sẵn: không bỏ phiếu, không gửi giao dịch, không suy kết quả vụ.
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { ChevronRight, Gavel, Hourglass, Inbox, RefreshCw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NetworkBanner } from "@/components/network-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { WalletChip } from "@/components/wallet-chip";
import { formatDateTime } from "@/lib/client/date";
import { DEALS_MOCK } from "@/lib/client/deals-data";
import { fetchJurorDisputes, type JurorDisputeItem } from "@/lib/client/disputes-api";
import { formatDuration, useCountdown } from "@/lib/client/use-countdown";
import type { Address } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIND_LABEL = { DEDUCTION: "Tranh chấp mức trừ", MISMATCH: "Phòng sai mô tả" } as const;

export type JuryListStatus = "loading" | "wallet-pending" | "login" | "ready";

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

  return (
    <>
      <NetworkBanner />
      <JuryListView
        status={!ready ? "loading" : !signedIn ? (authenticated ? "wallet-pending" : "login") : q.isPending ? "loading" : "ready"}
        items={q.data?.items ?? []}
        isJuror={q.data?.isJuror ?? false}
        loaded={!!q.data}
        address={address}
        error={!!q.error}
        refreshing={q.isFetching}
        onLogin={login}
        onRetry={() => { void q.refetch(); }}
        mock={DEALS_MOCK}
      />
    </>
  );
}

/** Phần trình bày dùng chung với trang mẫu; quyền và dữ liệu thật do JuryList phụ trách. */
export function JuryListView({
  status, items, isJuror, loaded, address, error = false, refreshing = false, onLogin, onRetry, mock = false,
}: {
  status: JuryListStatus;
  items: JurorDisputeItem[];
  isJuror: boolean;
  /** Đã có ít nhất một lần tải thành công (để giữ dữ liệu cũ khi lần cập nhật sau lỗi). */
  loaded: boolean;
  address?: string;
  error?: boolean;
  refreshing?: boolean;
  onLogin: () => void;
  onRetry: () => void;
  mock?: boolean;
}) {
  // Lần tải đầu lỗi: chưa có dữ liệu để giữ. Lần cập nhật lỗi: giữ kết quả cũ và nói rõ.
  const firstLoadFailed = error && !loaded;
  const staleBanner = error && loaded && (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning bg-warning/15 p-4 text-warning-foreground">
      <p className="max-w-prose text-sm">Chưa cập nhật được danh sách mới. Dưới đây là lần tải thành công gần nhất, có thể đã có vụ mới hoặc vụ đã chốt.</p>
      <Button variant="outline" onClick={onRetry} disabled={refreshing}>{refreshing ? "Đang thử lại…" : "Thử lại"}</Button>
    </div>
  );
  const sorted = sortCases(items);

  let body: React.ReactNode;
  if (status === "loading" || status === "wallet-pending") {
    body = (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="text-sm text-muted-foreground">
          {status === "wallet-pending" ? "Đang kết nối ví để kiểm tra quyền bồi thẩm…" : "Đang tải vụ chờ phiếu…"}
        </p>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl lg:h-24" />)}
      </div>
    );
  } else if (status === "login") {
    body = (
      <Empty icon={<Gavel className="size-8" />} title="Đăng nhập để xem vụ chờ phiếu" text="Ví của bạn quyết định bạn có phải bồi thẩm hay không.">
        <Button size="lg" onClick={onLogin}>Đăng nhập</Button>
      </Empty>
    );
  } else if (firstLoadFailed) {
    body = (
      <Empty icon={<Inbox className="size-8" />} title="Không tải được danh sách" text="Kiểm tra mạng rồi thử lại. Chưa biết ví này có vụ nào hay không.">
        <Button onClick={onRetry} disabled={refreshing}>{refreshing ? "Đang thử lại…" : "Thử lại"}</Button>
      </Empty>
    );
  } else if (!isJuror) {
    body = (
      <Empty
        icon={<UserX className="size-8" />}
        title="Ví này chưa là bồi thẩm"
        text="Danh sách bồi thẩm do nhóm vận hành thêm vào hợp đồng thông minh. Bạn vẫn mở được bằng chứng của một vụ từ trang hợp đồng, nhưng không bỏ phiếu được."
      >
        <WalletChip address={address} />
        <p className="text-sm text-muted-foreground">Đúng ví mới thấy vụ. Nếu bạn đã được thêm, đăng nhập lại bằng ví đó.</p>
      </Empty>
    );
  } else if (items.length === 0) {
    body = (
      <div className="space-y-6">
        {staleBanner}
        <Empty icon={<Inbox className="size-8" />} title="Không có vụ nào chờ phiếu của bạn" text="Vụ mới xuất hiện ở đây, danh sách tự cập nhật mỗi 15 giây. Vụ bạn đã bỏ phiếu không còn hiện.">
          <WalletChip address={address} />
        </Empty>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        {staleBanner}
        <section className="space-y-3" aria-label="Vụ chờ phiếu">
          <h2 className="text-lg font-bold">Chờ phiếu của bạn <span className="font-normal text-muted-foreground">({sorted.length})</span></h2>
          <ul className="space-y-3 lg:space-y-0 lg:divide-y lg:border-y lg:border-border">
            {sorted.map((it) => <li key={it.dealId}><DisputeCard item={it} /></li>)}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader href="/" backLabel="Về trang chủ" title="Bồi thẩm" />
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">Vụ chờ phiếu của bạn</h1>
          <p className="max-w-prose text-muted-foreground">
            Xem ảnh, chọn một bên. Bên nào đủ 2 phiếu thì thắng ngay. Bạn chỉ chọn bên, không nhập số tiền.
          </p>
        </div>
        {status === "ready" && !firstLoadFailed && isJuror && (
          <Button variant="ghost" onClick={onRetry} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
            {refreshing ? "Đang cập nhật…" : "Tải lại"}
          </Button>
        )}
      </div>
      {body}
      {mock && <p className="mt-6 text-sm text-muted-foreground">Dữ liệu mẫu: ví nào cũng được coi là bồi thẩm.</p>}
    </PageShell>
  );
}

/** Vụ còn hạn lên trước, hạn gần nhất trước; vụ đã quá hạn xuống cuối; cùng hạn thì mã mới trước. */
function sortCases(list: JurorDisputeItem[]): JurorDisputeItem[] {
  const now = Date.now();
  const due = (d: JurorDisputeItem) => Date.parse(d.deadline);
  const over = (d: JurorDisputeItem) => (due(d) <= now ? 1 : 0);
  return [...list].sort((a, b) => over(a) - over(b) || due(a) - due(b) || b.dealId - a.dealId);
}

function DisputeCard({ item }: { item: JurorDisputeItem }) {
  const { passed, msLeft } = useCountdown(item.deadline);
  const total = item.votes.landlord + item.votes.tenant;
  return (
    <Link
      href={`/jury/${item.dealId}`}
      className={cn(
        "grid min-w-0 gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:grid-cols-[minmax(0,1fr)_220px_240px_20px] lg:items-center lg:gap-6 lg:rounded-none lg:border-0 lg:py-5",
        passed ? "border-border" : "border-primary/40",
      )}
    >
      <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <Gavel className="size-4 shrink-0" aria-hidden="true" /> {KIND_LABEL[item.kind]} · Hợp đồng #{item.dealId}
        </p>
        <h3 className="font-bold">{item.title}</h3>
      </div>
      <dl className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-3 text-sm lg:block lg:border-0 lg:pt-0">
        <dt className="text-muted-foreground">Phiếu hiện có</dt>
        <dd className="font-semibold tabular-nums">
          Chủ trọ {item.votes.landlord} · Người thuê {item.votes.tenant}
          <span className="sr-only">, tổng {total} phiếu</span>
        </dd>
      </dl>
      <div className="min-w-0 space-y-1 text-sm [overflow-wrap:anywhere]">
        <p className={cn("flex items-start gap-1.5 font-medium tabular-nums", passed ? "text-destructive" : "text-muted-foreground")}>
          <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {passed ? "Đã quá hạn bỏ phiếu" : msLeft !== null ? `Còn ${formatDuration(msLeft)}` : ""}
        </p>
        <p className="text-muted-foreground">Hạn: <time dateTime={item.deadline}>{formatDateTime(item.deadline)}</time> (giờ VN)</p>
        <p className="font-semibold text-primary">
          {passed ? "Mở vụ xem kết quả" : "Xem bằng chứng và bỏ phiếu"}
          <ChevronRight className="ml-1 inline size-4 lg:hidden" aria-hidden="true" />
        </p>
      </div>
      <ChevronRight className="hidden size-5 text-muted-foreground lg:block" aria-hidden="true" />
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
    <div className="grid place-items-center gap-4 rounded-2xl bg-muted px-4 py-12 text-center sm:px-8">
      <span className="text-muted-foreground">{icon}</span>
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-prose text-sm text-muted-foreground">{text}</p>}
      {children}
    </div>
  );
}
