// Truy vấn database. Route chỉ gọi các hàm ở đây, không viết SQL trực tiếp.
import "server-only";
import { db, newId } from "./db";
export { newId };
import type { Address, Hash, PhotoSetKind, PhotoSetManifest, Terms } from "../types";

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
  landlord: Address;
  terms: Terms;
  terms_hash: Hash;
  deal_id: string | null;
  tx_hash: string | null;
}

export async function insertListing(landlord: Address, terms: Terms, termsHash: Hash): Promise<string> {
  const id = newId("ls");
  await (await db()).query(
    "INSERT INTO listings (id, landlord, terms, terms_hash) VALUES ($1, $2, $3::jsonb, $4)",
    [id, landlord, JSON.stringify(terms), termsHash],
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
    "SELECT * FROM listings WHERE deal_id IS NOT NULL ORDER BY deal_id DESC LIMIT 200",
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
     VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7)`,
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
  await (await db()).query("UPDATE ai_reports SET explanation = $2::jsonb WHERE id = $1", [id, JSON.stringify(explanation)]);
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
    `UPDATE ai_reports SET status='done', report=$2::jsonb, report_hash=$3, sealed_amount=$4, verdict=$5,
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
