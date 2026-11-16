import { MismatchFlow } from "@/components/mismatch-flow";
import type { Role } from "@/lib/client/deal-actions";

// Báo phòng không đúng mô tả (nhánh C, docs/user-flow.md GĐ3, P1): người thuê chụp thực tế, AI so với ảnh đăng tin,
// ký reportMismatch. Chủ trọ mở cùng màn để xem bằng chứng và phản đối (contestMismatch).
// `?as=tenant|landlord` chỉ có tác dụng khi chạy dữ liệu giả.
export default async function MismatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { dealId } = await params;
  const { as } = await searchParams;
  const previewAs: Role | undefined = as === "tenant" || as === "landlord" ? as : undefined;
  return <MismatchFlow dealId={dealId} previewAs={previewAs} />;
}
