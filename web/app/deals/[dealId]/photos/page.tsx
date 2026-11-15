import { PhotoCaptureFlow, type CaptureKind } from "@/components/photo-capture-flow";
import type { Role } from "@/lib/client/deal-actions";

// Camera chụp theo vị trí: /deals/:id/photos?kind=checkin|checkout (GĐ3, GĐ5).
// `?as=tenant|landlord` chỉ có tác dụng khi chạy dữ liệu giả (giống màn Chi tiết hợp đồng).
export default async function DealPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ kind?: string; as?: string }>;
}) {
  const { dealId } = await params;
  const { kind, as } = await searchParams;
  const k: CaptureKind = kind === "checkout" ? "checkout" : "checkin";
  const previewAs: Role | undefined = as === "tenant" || as === "landlord" ? as : undefined;
  return <PhotoCaptureFlow dealId={dealId} kind={k} previewAs={previewAs} />;
}
