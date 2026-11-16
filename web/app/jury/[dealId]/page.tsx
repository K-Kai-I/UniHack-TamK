import { JuryVote } from "@/components/jury-vote";

// Bỏ phiếu một vụ: bằng chứng + chọn một bên (docs/user-flow.md GĐ3 nhánh C, GĐ6 nhánh G).
// Hai bên của hợp đồng mở màn này để xem phiếu, không bỏ phiếu được.
export default async function JuryVotePage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  return <JuryVote dealId={dealId} />;
}
