// Danh mục phòng và yêu cầu thuê (docs/api-contract.md > Danh mục phòng và yêu cầu thuê).
// Chủ trọ đăng phòng không cần ngày → người thuê tìm phòng, chọn ngày, gửi yêu cầu → chủ trọ duyệt và ký createDeal
// → người thuê cọc ở /rooms/:dealId như luồng cũ.
import { apiFetch } from "./api";
import type { CreateDealArgs } from "./use-create-deal";

export interface CatalogRoom {
  roomId: string;
  title: string;
  address: string;
  rentVnd: number;
  amenities: string[];
  depositAmount: string;
  reserveFeeAmount: string;
  coverUrl: string | null;
  landlord: `0x${string}`;
  createdAt: string;
}

export interface CatalogRoomDetail extends CatalogRoom {
  listingPhotoUrls: string[];
  positions: { id: string; name: string; instruction: string; exampleUrl: string }[];
  priceList: { id: string; item: string; unit: string; priceAmount: string }[];
  yieldEnabled: boolean;
  /** Khoảng ngày đã có người thuê (GET /rooms/:roomId). */
  bookedRanges?: { moveInDate: string; leaseEnd: string }[];
}

export type RoomSort = "newest" | "price_asc" | "price_desc";
export interface RoomSearch {
  q?: string;
  minRent?: number | null;
  maxRent?: number | null;
  sort?: RoomSort;
}

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface RentalRequest {
  requestId: string;
  roomId: string;
  title: string;
  landlord: `0x${string}`;
  tenant: `0x${string}`;
  moveInDate: string;
  leaseEnd: string;
  note: string | null;
  status: RequestStatus;
  listingId: string | null;
  dealId: number | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ApproveResponse {
  listingId: string;
  dealId: number | null;
  termsHash: `0x${string}`;
  createDealArgs: CreateDealArgs;
}

/** Body của POST /rooms: như POST /listings nhưng không có `dates`. */
export type RoomBody = Record<string, unknown>;

export async function createRoom(body: RoomBody, token: string | null) {
  return apiFetch<{ roomId: string }>("/rooms", { method: "POST", body, token });
}

export async function searchRooms(s: RoomSearch): Promise<CatalogRoom[]> {
  const p = new URLSearchParams();
  if (s.q?.trim()) p.set("q", s.q.trim());
  if (s.minRent != null) p.set("minRent", String(s.minRent));
  if (s.maxRent != null) p.set("maxRent", String(s.maxRent));
  if (s.sort && s.sort !== "newest") p.set("sort", s.sort);
  const qs = p.toString();
  return (await apiFetch<{ items: CatalogRoom[] }>(`/rooms${qs ? `?${qs}` : ""}`)).items;
}

export async function fetchCatalogRoom(roomId: string) {
  return apiFetch<CatalogRoomDetail>(`/rooms/${encodeURIComponent(roomId)}`);
}

export async function sendRentalRequest(
  roomId: string,
  body: { moveInDate: string; leaseEnd: string; note?: string },
  token: string | null,
) {
  return apiFetch<{ requestId: string; status: RequestStatus }>(`/rooms/${encodeURIComponent(roomId)}/requests`, {
    method: "POST",
    body,
    token,
  });
}

export async function fetchRequests(token: string | null) {
  return apiFetch<{ incoming: RentalRequest[]; outgoing: RentalRequest[] }>("/requests", { token });
}

export async function approveRequest(requestId: string, token: string | null) {
  return apiFetch<ApproveResponse>(`/requests/${encodeURIComponent(requestId)}/approve`, { method: "POST", token });
}

export async function decideRequest(requestId: string, action: "reject" | "cancel", token: string | null) {
  return apiFetch<{ ok: true; status: RequestStatus }>(`/requests/${encodeURIComponent(requestId)}/${action}`, {
    method: "POST",
    token,
  });
}

/** Ngày yyyy-mm-dd + số tháng → yyyy-mm-dd (giữ ngày trong tháng, tràn thì lùi về cuối tháng). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
