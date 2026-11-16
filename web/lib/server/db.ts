// Database: Postgres thật khi có DATABASE_URL (Supabase, Neon...), ngược lại dùng PGlite
// (Postgres chạy trong tiến trình) để dev và test không cần cài gì.
// Cả hai nhận cùng câu SQL với tham số $1, $2...
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, unknown>;
export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

const g = globalThis as unknown as { __kctDb?: Promise<Db> };

export function db(): Promise<Db> {
  g.__kctDb ??= open();
  return g.__kctDb;
}

async function open(): Promise<Db> {
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  const url = process.env.DATABASE_URL;

  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false để chạy được qua pooler (Supabase cổng 6543, PgBouncer).
    const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
    await sql.unsafe(schema);
    return {
      query: async <T,>(text: string, params: unknown[] = []) =>
        (await sql.unsafe(text, params as never[])) as unknown as T[],
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // Trên Vercel không ghi được ổ đĩa: dùng bộ nhớ (mất dữ liệu khi hàm khởi động lại).
  const dir = process.env.VERCEL ? "memory://" : process.env.PGLITE_DIR ?? join(process.cwd(), ".data", "pglite");
  if (process.env.VERCEL) console.warn("[db] Chưa đặt DATABASE_URL: đang dùng database tạm trong bộ nhớ");
  const pg = new PGlite(dir);
  await pg.exec(schema);
  return {
    query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
}

/** Tạo id dạng tiền tố + chuỗi xếp theo thời gian, ví dụ ph_lz3k2j9a1b2c3d4e5f6a7b8. */
export function newId(prefix: "ls" | "ph" | "ps" | "ai"): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}
