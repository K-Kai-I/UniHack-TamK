// POST /api/v1/uploads: docs/api-contract.md > POST /uploads.
// Nhận 1 ảnh (multipart), tính SHA-256 trên đúng các byte đã lưu, cất vào kho ảnh.
import { hashImage } from "@/lib/hash";
import { requireWallet } from "@/lib/server/auth";
import { ApiErr, json, photoUrl, route } from "@/lib/server/http";
import { insertPhoto, newId, type PhotoPurpose } from "@/lib/server/repo";
import { putPhoto } from "@/lib/server/storage";

const PURPOSES: PhotoPurpose[] = ["listing", "example", "checkin", "checkout", "mismatch"];
const MAX_BYTES = 5 * 1024 * 1024;

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Nhận diện JPEG/PNG bằng byte đầu file, không tin Content-Type của client. */
function sniff(b: Uint8Array): "image/jpeg" | "image/png" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

export const POST = route(async (req: Request) => {
  const owner = await requireWallet(req);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiErr("BAD_REQUEST", "Cần multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) throw new ApiErr("BAD_REQUEST", "Thiếu trường file");
  if (file.size > MAX_BYTES) throw new ApiErr("FILE_TOO_LARGE", "Ảnh quá 5 MB");
  const purpose = String(form.get("purpose") ?? "") as PhotoPurpose;
  if (!PURPOSES.includes(purpose)) throw new ApiErr("BAD_REQUEST", `purpose phải là ${PURPOSES.join(" | ")}`);

  const data = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(data);
  if (!mime) throw new ApiErr("BAD_REQUEST", "Chỉ nhận ảnh JPEG hoặc PNG");

  const capturedRaw = form.get("capturedAt");
  const capturedAt = capturedRaw ? new Date(String(capturedRaw)) : null;
  if (capturedAt && Number.isNaN(capturedAt.getTime())) throw new ApiErr("BAD_REQUEST", "capturedAt không phải ISO 8601");

  const id = newId("ph");
  const sha256 = hashImage(data);
  const storagePath = await putPhoto(id, mime, data);
  await insertPhoto(
    id,
    {
      owner,
      sha256,
      mime,
      bytes: data.length,
      purpose,
      position_id: (form.get("positionId") as string | null) || null,
      captured_at: capturedAt ? capturedAt.toISOString() : null,
      lat: num(form.get("lat")),
      lng: num(form.get("lng")),
      accuracy_m: num(form.get("accuracyM")),
    },
    storagePath,
    storagePath ? null : data,
  );

  return json({ photoId: id, url: photoUrl(req, id), sha256, bytes: data.length }, 201);
});
