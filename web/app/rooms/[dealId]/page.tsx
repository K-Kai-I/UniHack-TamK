import { RoomDetail } from "@/components/room-detail";

// Chi tiết phòng + Gửi cọc. Next 15: params là Promise.
export default async function RoomPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  return <RoomDetail dealId={dealId} />;
}
