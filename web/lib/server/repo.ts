// Truy vấn database. Route chỉ gọi các hàm ở đây, không viết SQL trực tiếp.
import "server-only";
import { db, newId } from "./db";
export { newId };
import type { Address, Hash, PhotoSetKind, PhotoSetManifest, Terms } from "../types";
import type { RoomTemplate } from "./terms-builder";

// ------------------------------------------------------------------ ảnh

export type PhotoPurpose = "listing" | "example" | "checkin" | "checkout" | "mismatch";

export interface PhotoMeta {
  id: string;
  owner: Address;
  sha256: Hash;
  mime: string;
  bytes: number;
  purpose: PhotoPurpose;
  position_id: string | null;
  captured_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
}

export async function insertPhoto(
  id: string,
  p: Omit<PhotoMeta, "id">,
  storagePath: string | null,
  data: Uint8Array | null,
): Promise<void> {
  await (await db()).query(
    `INSERT INTO photos (id, owner, sha256, mime, bytes, storage_path, data, purpose, position_id, captured_at, lat, lng, accuracy_m)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, p.owner, p.sha256, p.mime, p.bytes, storagePath, data, p.purpose, p.position_id, p.captured_at, p.lat, p.lng, p.accuracy_m],
  );
}

/** Số ảnh một ví đã tải lên trong 24 giờ qua (để chặn lạm dụng kho ảnh). */
export async function countRecentPhotos(owner: Address): Promise<number> {
  const rows = await (await db()).query<{ n: number | string }>(
    "SELECT count(*) AS n FROM photos WHERE owner = $1 AND created_at > now() - interval '24 hours'",
    [owner],
  );
  return Number(rows[0]?.n ?? 0);
}

const META_COLS = "id, owner, sha256, mime, bytes, purpose, position_id, captured_at, lat, lng, accuracy_m";

export async function getPhotoMetas(ids: string[]): Promise<Map<string, PhotoMeta>> {
  if (ids.length === 0) return new Map();
  const rows = await (await db()).query<PhotoMeta>(`SELECT ${META_COLS} FROM photos WHERE id = ANY($1::text[])`, [ids]);
  return new Map(rows.map((r) => [r.id, normalizeMeta(r)]));
}

function normalizeMeta(r: PhotoMeta): PhotoMeta {
  const t = r.captured_at as unknown;
  return { ...r, captured_at: t instanceof Date ? t.toISOString() : (t as string | null) };
}

// ------------------------------------------------------------------ tin đăng

export interface ListingRow {
  id: string;
  request_id?: string | null;
  landlord: Address;
  terms: Terms;
  terms_hash: Hash;
  deal_id: string | null;
  tx_hash: string | null;
}

/** `requestId`: tin đăng sinh ra khi chủ trọ duyệt một yêu cầu thuê (riêng cho người gửi, không liệt kê công khai). */
export async function insertListing(landlord: Address, terms: Terms, termsHash: Hash, requestId: string | null = null): Promise<string> {
  const id = newId("ls");
  await (await db()).query(
    "INSERT INTO listings (id, landlord, terms, terms_hash, request_id) VALUES ($1, $2, $3::text::jsonb, $4, $5)",
    [id, landlord, JSON.stringify(terms), termsHash, requestId],
  );
  return id;
}

export async function getListing(id: string): Promise<ListingRow | null> {
  const rows = await (await db()).query<ListingRow>("SELECT * FROM listings WHERE id = $1", [id]);
  return rows[0] ? fixListing(rows[0]) : null;
}

export async function getListingByDeal(dealId: bigint): Promise<ListingRow | null> {
  const rows = await (await db()).query<ListingRow>("SELECT * FROM listings WHERE deal_id = $1", [dealId.toString()]);
  return rows[0] ? fixListing(rows[0]) : null;
}

export async function bindListing(id: string, dealId: bigint, txHash: string): Promise<void> {
  await (await db()).query("UPDATE listings SET deal_id = $2, tx_hash = $3 WHERE id = $1 AND deal_id IS NULL", [
    id,
    dealId.toString(),
    txHash,
  ]);
}

export async function listBoundListings(): Promise<ListingRow[]> {
  const rows = await (await db()).query<ListingRow>(
    "SELECT * FROM listings WHERE deal_id IS NOT NULL AND request_id IS NULL ORDER BY deal_id DESC LIMIT 200",
  );
  return rows.map(fixListing);
}

export async function getListingsByDeals(dealIds: bigint[]): Promise<Map<string, ListingRow>> {
  if (dealIds.length === 0) return new Map();
  const rows = await (await db()).query<ListingRow>("SELECT * FROM listings WHERE deal_id = ANY($1::bigint[])", [
    dealIds.map(String),
  ]);
  return new Map(rows.map((r) => [String(r.deal_id), fixListing(r)]));
}

function fixListing(r: ListingRow): ListingRow {
  return { ...r, deal_id: r.deal_id == null ? null : String(r.deal_id) };
}

// ------------------------------------------------------------------ bộ ảnh

export interface PhotoSetRow {
  id: string;
  deal_id: string;
  kind: PhotoSetKind;
  manifest: PhotoSetManifest;
  set_hash: Hash;
  photo_ids: Record<string, string>;
  created_by: Address;
}

export async function insertPhotoSet(
  dealId: bigint,
  kind: PhotoSetKind,
  manifest: PhotoSetManifest,
  setHash: Hash,
  photoIds: Record<string, string>,
  by: Address,
): Promise<string> {
  const id = newId("ps");
  await (await db()).query(
    `INSERT INTO photo_sets (id, deal_id, kind, manifest, set_hash, photo_ids, created_by)
     VALUES ($1,$2,$3,$4::text::jsonb,$5,$6::text::jsonb,$7)`,
    [id, dealId.toString(), kind, JSON.stringify(manifest), setHash.toLowerCase(), JSON.stringify(photoIds), by],
  );
  return id;
}

/** Bộ ảnh của deal có đúng hash đang nằm trên chuỗi. */
export async function getPhotoSetByHash(dealId: bigint, setHash: string): Promise<PhotoSetRow | null> {
  const rows = await (await db()).query<PhotoSetRow>(
    "SELECT * FROM photo_sets WHERE deal_id = $1 AND set_hash = $2 ORDER BY created_at DESC LIMIT 1",
    [dealId.toString(), setHash.toLowerCase()],
  );
  return rows[0] ? { ...rows[0], deal_id: String(rows[0].deal_id) } : null;
}

/** Bộ ảnh mới nhất của một loại (dùng cho bộ ảnh báo phòng sai, chưa có hash trên chuỗi). */
export async function getLatestPhotoSet(dealId: bigint, kind: PhotoSetKind): Promise<PhotoSetRow | null> {
  const rows = await (await db()).query<PhotoSetRow>(
    "SELECT * FROM photo_sets WHERE deal_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1",
    [dealId.toString(), kind],
  );
  return rows[0] ? { ...rows[0], deal_id: String(rows[0].deal_id) } : null;
}

export async function getPhotoSet(id: string): Promise<PhotoSetRow | null> {
  const rows = await (await db()).query<PhotoSetRow>("SELECT * FROM photo_sets WHERE id = $1", [id]);
  return rows[0] ? { ...rows[0], deal_id: String(rows[0].deal_id) } : null;
}

// ------------------------------------------------------------------ báo cáo AI

export interface AiReportRow {
  id: string;
  deal_id: string;
  type: "damage" | "mismatch";
  input_hash: string;
  status: "processing" | "done" | "failed";
  report: unknown;
  report_hash: string | null;
  sealed_amount: string | null;
  verdict: number | null;
  signature: string | null;
  error: string | null;
  explanation?: unknown;
}

/** Lưu lời giải thích phụ (OpenAI). Không đụng tới báo cáo đã hash và ký. */
export async function setAiExplanation(id: string, explanation: unknown): Promise<void> {
  await (await db()).query("UPDATE ai_reports SET explanation = $2::text::jsonb WHERE id = $1", [id, JSON.stringify(explanation)]);
}

/** Tạo bản ghi "processing" nếu chưa có. Trả về bản ghi hiện có và cờ created. */
export async function claimAiReport(
  dealId: bigint,
  type: "damage" | "mismatch",
  inputHash: string,
): Promise<{ row: AiReportRow; created: boolean }> {
  const d = await db();
  const id = newId("ai");
  const inserted = await d.query<AiReportRow>(
    `INSERT INTO ai_reports (id, deal_id, type, input_hash, status) VALUES ($1,$2,$3,$4,'processing')
     ON CONFLICT (deal_id, type, input_hash) DO NOTHING RETURNING *`,
    [id, dealId.toString(), type, inputHash.toLowerCase()],
  );
  if (inserted[0]) return { row: inserted[0], created: true };
  const existing = await getAiReport(dealId, type, inputHash);
  return { row: existing!, created: false };
}

/** Cho chạy lại khi lần trước lỗi, hoặc kẹt ở processing quá 3 phút (hàm bị dừng giữa chừng). */
export async function retryFailedAiReport(id: string): Promise<boolean> {
  const rows = await (await db()).query(
    `UPDATE ai_reports SET status = 'processing', error = NULL, updated_at = now()
     WHERE id = $1 AND (status = 'failed' OR (status = 'processing' AND updated_at < now() - interval '3 minutes'))
     RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

export async function getAiReport(dealId: bigint, type: "damage" | "mismatch", inputHash?: string) {
  const d = await db();
  const rows = inputHash
    ? await d.query<AiReportRow>(
        "SELECT * FROM ai_reports WHERE deal_id = $1 AND type = $2 AND input_hash = $3",
        [dealId.toString(), type, inputHash.toLowerCase()],
      )
    : await d.query<AiReportRow>(
        "SELECT * FROM ai_reports WHERE deal_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1",
        [dealId.toString(), type],
      );
  return rows[0] ?? null;
}

export async function finishAiReport(
  id: string,
  r: { report: unknown; reportHash: string; sealedAmount?: string; verdict?: number; signature: string },
) {
  await (await db()).query(
    `UPDATE ai_reports SET status='done', report=$2::text::jsonb, report_hash=$3, sealed_amount=$4, verdict=$5,
       signature=$6, error=NULL, updated_at=now() WHERE id=$1`,
    [id, JSON.stringify(r.report), r.reportHash, r.sealedAmount ?? null, r.verdict ?? null, r.signature],
  );
}

export async function failAiReport(id: string, error: string) {
  await (await db()).query("UPDATE ai_reports SET status='failed', error=$2, updated_at=now() WHERE id=$1", [
    id,
    error.slice(0, 500),
  ]);
}

// ------------------------------------------------------------------ faucet

/** Ghi lượt nhận nếu ví chưa nhận trong 24 giờ. Trả false nếu bị giới hạn. */
export async function claimFaucet(wallet: Address): Promise<boolean> {
  const rows = await (await db()).query(
    `INSERT INTO faucet_claims (wallet, claimed_at) VALUES ($1, now())
     ON CONFLICT (wallet) DO UPDATE SET claimed_at = now()
       WHERE faucet_claims.claimed_at < now() - interval '24 hours'
     RETURNING wallet`,
    [wallet],
  );
  return rows.length > 0;
}

export async function releaseFaucet(wallet: Address) {
  await (await db()).query("DELETE FROM faucet_claims WHERE wallet = $1", [wallet]);
}

// ------------------------------------------------------------------ danh mục phòng và yêu cầu thuê

export interface RoomRow {
  id: string;
  landlord: Address;
  template: RoomTemplate;
  active: boolean;
  created_at: string;
}

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface RequestRow {
  id: string;
  room_id: string;
  tenant: Address;
  move_in: string;
  lease_end: string;
  note: string | null;
  status: RequestStatus;
  listing_id: string | null;
  created_at: string;
  decided_at: string | null;
  // từ JOIN
  landlord?: Address;
  title?: string;
  deal_id?: string | null;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const fixRoom = (r: RoomRow): RoomRow => ({ ...r, created_at: iso(r.created_at)! });
const fixRequest = (r: RequestRow): RequestRow => ({
  ...r,
  move_in: iso(r.move_in)!,
  lease_end: iso(r.lease_end)!,
  created_at: iso(r.created_at)!,
  decided_at: iso(r.decided_at),
  deal_id: r.deal_id == null ? null : String(r.deal_id),
});

export async function insertRoom(landlord: Address, template: RoomTemplate): Promise<string> {
  const id = newId("rm");
  await (await db()).query("INSERT INTO rooms (id, landlord, template) VALUES ($1, $2, $3::text::jsonb)", [
    id,
    landlord,
    JSON.stringify(template),
  ]);
  return id;
}

export async function getRoom(id: string): Promise<RoomRow | null> {
  const rows = await (await db()).query<RoomRow>("SELECT * FROM rooms WHERE id = $1", [id]);
  return rows[0] ? fixRoom(rows[0]) : null;
}

/** Phòng đang mở trong danh mục, mới trước. Lọc và tìm làm ở route (bỏ dấu tiếng Việt cho dễ gõ). */
export async function listActiveRooms(limit = 500): Promise<RoomRow[]> {
  const rows = await (await db()).query<RoomRow>("SELECT * FROM rooms WHERE active ORDER BY created_at DESC LIMIT $1", [limit]);
  return rows.map(fixRoom);
}

export async function insertRequest(r: { roomId: string; tenant: Address; moveIn: Date; leaseEnd: Date; note: string | null }) {
  const id = newId("rq");
  await (await db()).query(
    "INSERT INTO rental_requests (id, room_id, tenant, move_in, lease_end, note) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, r.roomId, r.tenant, r.moveIn.toISOString(), r.leaseEnd.toISOString(), r.note],
  );
  return id;
}

const REQUEST_SELECT = `SELECT q.*, r.landlord, r.template->'room'->>'title' AS title, l.deal_id
  FROM rental_requests q JOIN rooms r ON r.id = q.room_id LEFT JOIN listings l ON l.id = q.listing_id`;

export async function getRequest(id: string): Promise<RequestRow | null> {
  const rows = await (await db()).query<RequestRow>(`${REQUEST_SELECT} WHERE q.id = $1`, [id]);
  return rows[0] ? fixRequest(rows[0]) : null;
}

export async function listRequestsByTenant(tenant: Address): Promise<RequestRow[]> {
  const rows = await (await db()).query<RequestRow>(`${REQUEST_SELECT} WHERE q.tenant = $1 ORDER BY q.created_at DESC LIMIT 100`, [tenant]);
  return rows.map(fixRequest);
}

export async function listRequestsByLandlord(landlord: Address): Promise<RequestRow[]> {
  const rows = await (await db()).query<RequestRow>(`${REQUEST_SELECT} WHERE r.landlord = $1 ORDER BY q.created_at DESC LIMIT 100`, [landlord]);
  return rows.map(fixRequest);
}

export async function hasPendingRequest(roomId: string, tenant: Address): Promise<boolean> {
  const rows = await (await db()).query<{ id: string }>(
    "SELECT id FROM rental_requests WHERE room_id = $1 AND tenant = $2 AND status = 'PENDING' LIMIT 1",
    [roomId, tenant],
  );
  return rows.length > 0;
}

/** Yêu cầu ĐÃ DUYỆT của phòng có khoảng ngày chồng lên [moveIn, leaseEnd) (kèm deal_id nếu đã lên chuỗi). */
export async function listApprovedOverlapping(roomId: string, moveIn: Date, leaseEnd: Date, excludeId: string | null = null): Promise<RequestRow[]> {
  const rows = await (await db()).query<RequestRow>(
    `${REQUEST_SELECT} WHERE q.room_id = $1 AND q.status = 'APPROVED' AND q.move_in < $3 AND q.lease_end > $2
       AND ($4::text IS NULL OR q.id <> $4) ORDER BY q.move_in`,
    [roomId, moveIn.toISOString(), leaseEnd.toISOString(), excludeId],
  );
  return rows.map(fixRequest);
}

/** Mọi yêu cầu đã duyệt của phòng (để hiện các khoảng ngày đã có người thuê). */
export async function listApprovedForRoom(roomId: string): Promise<RequestRow[]> {
  const rows = await (await db()).query<RequestRow>(
    `${REQUEST_SELECT} WHERE q.room_id = $1 AND q.status = 'APPROVED' ORDER BY q.move_in`, [roomId]);
  return rows.map(fixRequest);
}

/** Duyệt một yêu cầu thì các yêu cầu đang chờ trùng ngày của cùng phòng bị từ chối luôn. Trả số yêu cầu bị từ chối. */
export async function rejectPendingOverlapping(roomId: string, moveIn: Date, leaseEnd: Date, keepId: string): Promise<number> {
  const rows = await (await db()).query<{ id: string }>(
    `UPDATE rental_requests SET status = 'REJECTED', decided_at = now()
     WHERE room_id = $1 AND status = 'PENDING' AND id <> $4 AND move_in < $3 AND lease_end > $2 RETURNING id`,
    [roomId, moveIn.toISOString(), leaseEnd.toISOString(), keepId],
  );
  return rows.length;
}

/** Đổi trạng thái, chỉ khi đang ở `from` (tránh hai thao tác chồng nhau). Trả true nếu đổi được. */
export async function setRequestStatus(id: string, from: RequestStatus, to: RequestStatus, listingId: string | null = null) {
  const rows = await (await db()).query<{ id: string }>(
    `UPDATE rental_requests SET status = $3, listing_id = COALESCE($4, listing_id), decided_at = now()
     WHERE id = $1 AND status = $2 RETURNING id`,
    [id, from, to, listingId],
  );
  return rows.length > 0;
}
