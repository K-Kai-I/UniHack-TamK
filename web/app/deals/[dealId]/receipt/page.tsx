import { DealReceipt } from "@/components/deal-receipt";
import type { Role } from "@/lib/client/deal-actions";

// Biên nhận cuối (cả hai bên): ai nhận bao nhiêu theo event Paid, link Snowtrace. GĐ6 trong docs/user-flow.md.
export default async function DealReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { dealId } = await params;
  const { as } = await searchParams;
  const previewAs: Role | undefined = as === "tenant" || as === "landlord" ? as : undefined;
  return <DealReceipt dealId={dealId} previewAs={previewAs} />;
}
