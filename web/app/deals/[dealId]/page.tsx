import { DealDetail } from "@/components/deal-detail";
import type { Role } from "@/lib/client/deal-actions";

// Chi tiết hợp đồng (cả hai bên, GĐ 1–6). Next 15: params và searchParams là Promise.
// `?as=tenant|landlord` chỉ có tác dụng khi chạy dữ liệu giả (xem components/deal-detail.tsx).
export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { dealId } = await params;
  const { as } = await searchParams;
  const previewAs: Role | undefined = as === "tenant" || as === "landlord" ? as : undefined;
  return <DealDetail dealId={dealId} previewAs={previewAs} />;
}
