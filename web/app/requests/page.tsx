import type { Metadata } from "next";
import { RentalRequests } from "@/components/rental-requests";

export const metadata: Metadata = { title: "Yêu cầu thuê · Két Cọc Trọ" };

// Yêu cầu thuê: chủ trọ duyệt / từ chối, người thuê xem trạng thái và đi gửi cọc.
export default function RequestsPage() {
  return <RentalRequests />;
}
