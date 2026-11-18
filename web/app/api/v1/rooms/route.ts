// POST /api/v1/rooms: chủ trọ đăng phòng vào danh mục (chưa có ngày, chưa lên chuỗi).
// GET /api/v1/rooms?q=&minRent=&maxRent=&sort=newest|price_asc|price_desc: người thuê tìm phòng.
// docs/api-contract.md > Danh mục phòng và yêu cầu thuê.
import { requireWallet } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { insertRoom, listActiveRooms } from "@/lib/server/repo";
import { fold, roomSummary } from "@/lib/server/rooms-view";
import { bad, buildRoomTemplate, type RoomBody } from "@/lib/server/terms-builder";

export const POST = route(async (req: Request) => {
  const landlord = await requireWallet(req);
  const template = await buildRoomTemplate(landlord, await readJson<RoomBody>(req));
  const roomId = await insertRoom(landlord, template);
  return json({ roomId }, 201);
});

const SORTS = ["newest", "price_asc", "price_desc"] as const;

export const GET = route(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  const q = fold((p.get("q") ?? "").trim()).slice(0, 100);
  const num = (k: string) => {
    const v = p.get(k);
    if (v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw bad(`${k} phải là số không âm`);
    return n;
  };
  const minRent = num("minRent");
  const maxRent = num("maxRent");
  const sort = (p.get("sort") ?? "newest") as (typeof SORTS)[number];
  if (!SORTS.includes(sort)) throw bad(`sort phải là một trong ${SORTS.join(", ")}`);

  const words = q.split(/\s+/).filter(Boolean);
  const rooms = (await listActiveRooms()).filter((r) => {
    const rent = r.template.room.rentVnd;
    if (minRent !== null && rent < minRent) return false;
    if (maxRent !== null && rent > maxRent) return false;
    if (!words.length) return true;
    const hay = fold(`${r.template.room.title} ${r.template.room.address} ${r.template.room.amenities.join(" ")}`);
    return words.every((w) => hay.includes(w));
  });
  if (sort === "price_asc") rooms.sort((a, b) => a.template.room.rentVnd - b.template.room.rentVnd);
  if (sort === "price_desc") rooms.sort((a, b) => b.template.room.rentVnd - a.template.room.rentVnd);
  return json({ items: rooms.map((r) => roomSummary(req, r)) });
});
