// Kho ảnh. Có SUPABASE_URL + STORAGE_KEY thì dùng Supabase Storage (bucket "photos", private);
// không có thì lưu byte ảnh vào cột photos.data (chỉ để chạy local).
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db";
import { env } from "./env";

const BUCKET = "photos";
let client: SupabaseClient | undefined;

function supabase(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.storageKey) return null;
  client ??= createClient(env.supabaseUrl, env.storageKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function usingCloudStorage(): boolean {
  return supabase() !== null;
}

/** Lưu ảnh. Trả storage_path (kho ảnh) hoặc null (đã lưu vào database). */
export async function putPhoto(photoId: string, mime: string, data: Uint8Array): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const path = `${photoId}.${mime === "image/png" ? "png" : "jpg"}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, data, { contentType: mime, upsert: false });
  if (error) throw new Error(`Lưu ảnh thất bại: ${error.message}`);
  return path;
}

/** Đọc byte ảnh theo id. */
export async function getPhotoBytes(photoId: string): Promise<{ mime: string; data: Uint8Array } | null> {
  const rows = await (await db()).query<{ mime: string; storage_path: string | null; data: Uint8Array | null }>(
    "SELECT mime, storage_path, data FROM photos WHERE id = $1",
    [photoId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.storage_path) {
    const sb = supabase();
    if (!sb) throw new Error("Ảnh nằm trong kho ảnh nhưng server chưa cấu hình SUPABASE_URL/STORAGE_KEY");
    const { data, error } = await sb.storage.from(BUCKET).download(row.storage_path);
    if (error || !data) throw new Error(`Đọc ảnh thất bại: ${error?.message ?? "không có dữ liệu"}`);
    return { mime: row.mime, data: new Uint8Array(await data.arrayBuffer()) };
  }
  return row.data ? { mime: row.mime, data: new Uint8Array(row.data) } : null;
}

/** Ảnh dạng data URL để gửi cho module AI (không lộ đường dẫn kho ảnh ra ngoài). */
export async function photoDataUrl(photoId: string): Promise<string> {
  const p = await getPhotoBytes(photoId);
  if (!p) throw new Error(`Không tìm thấy ảnh ${photoId}`);
  return `data:${p.mime};base64,${Buffer.from(p.data).toString("base64")}`;
}
