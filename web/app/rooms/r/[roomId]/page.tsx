import { CatalogRoom } from "@/components/catalog-room";

// Chi tiết phòng trong danh mục + gửi yêu cầu thuê. (/rooms/:dealId là hợp đồng đã lên chuỗi, màn gửi cọc.)
export default async function CatalogRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <CatalogRoom roomId={roomId} />;
}
