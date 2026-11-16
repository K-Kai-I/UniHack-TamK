import { DamageReportScreen } from "@/components/damage-report";
import type { Role } from "@/lib/client/deal-actions";

// Báo cáo AI + Đề xuất (chủ trọ) / Phản hồi, Kháng nghị (người thuê): GĐ6 trong docs/user-flow.md.
// `?as=tenant|landlord` chỉ có tác dụng khi chạy dữ liệu giả (giống màn Chi tiết hợp đồng).
export default async function DealReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { dealId } = await params;
  const { as } = await searchParams;
  const previewAs: Role | undefined = as === "tenant" || as === "landlord" ? as : undefined;
  return <DamageReportScreen dealId={dealId} previewAs={previewAs} />;
}
