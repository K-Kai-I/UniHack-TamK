// Kiểm tra chất lượng khung hình camera ngay trên điện thoại (P2 "kiểm tra chất lượng ảnh").
// Chỉ đo 3 điều đo được ổn định: quá tối, quá chói, máy đang rung. Không chấm "đúng góc":
// đã thử so ảnh thu nhỏ với ảnh lúc nhận phòng trên bộ test 13 cặp và kết quả không phân biệt được
// cùng cảnh với khác cảnh, nên việc canh góc vẫn để người dùng làm bằng lớp ảnh mờ.
// Không đo "mờ nét" tuyệt đối: tường trơn của phòng trọ có độ nét rất thấp dù ảnh rõ, sẽ báo sai liên tục.

/** Cạnh dài của khung hình thu nhỏ dùng để đo (pixel). Nhỏ để chạy mượt trên điện thoại yếu. */
export const SAMPLE_SIZE = 160;

// Ngưỡng chọn theo bộ test web/lib/ai/eval/reference-v2 (13 cặp ảnh thật, thu về 160 px):
// ảnh tối (03-sau) có độ sáng trung bình 20 và 85% điểm ảnh dưới 40; mọi ảnh đạt đều sáng ≥ 97 và ≤ 23% điểm tối.
const DARK_MEAN = 50;
const DARK_SHARE = 0.6;
const DARK_PIXEL = 40;
// Không ảnh nào trong bộ test có quá 2% điểm ảnh cháy sáng; 20% là chụp ngược sáng hoặc rọi thẳng đèn.
const GLARE_PIXEL = 245;
const GLARE_SHARE = 0.2;
/** Chênh lệch độ sáng trung bình giữa hai lần đo liên tiếp (~0,5 giây) để coi là máy đang rung. */
export const SHAKE_DIFF = 12;

export type FrameIssue = "dark" | "glare" | "shake";
export type FrameCheck = { ok: boolean; issues: FrameIssue[] };

/** Đổi RGBA (ImageData.data) sang độ sáng 0–255 cho từng điểm ảnh. */
export function toLuma(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return out;
}

/** Chấm một khung hình. `prev` là khung đo lần trước (cùng kích thước) để biết máy có đang rung không. */
export function checkFrame(
  luma: Uint8Array,
  prev?: Uint8Array | null,
): FrameCheck {
  const n = luma.length;
  if (!n) return { ok: false, issues: ["dark"] };
  let sum = 0;
  let dark = 0;
  let glare = 0;
  let diff = 0;
  const comparable = !!prev && prev.length === n;
  for (let i = 0; i < n; i++) {
    const y = luma[i];
    sum += y;
    if (y < DARK_PIXEL) dark++;
    if (y > GLARE_PIXEL) glare++;
    if (comparable) diff += Math.abs(y - prev![i]);
  }
  const issues: FrameIssue[] = [];
  if (sum / n < DARK_MEAN || dark / n > DARK_SHARE) issues.push("dark");
  if (glare / n > GLARE_SHARE) issues.push("glare");
  if (comparable && diff / n > SHAKE_DIFF) issues.push("shake");
  return { ok: issues.length === 0, issues };
}

/** Câu báo cho người dùng, ưu tiên lỗi dễ sửa nhất trước. */
export function frameMessage(check: FrameCheck): string {
  if (check.ok) return "Đủ sáng, máy đứng yên. Chụp được";
  if (check.issues.includes("dark")) return "Hơi tối: bật đèn phòng lên";
  if (check.issues.includes("glare"))
    return "Quá chói: tránh chĩa thẳng vào đèn hoặc cửa sổ";
  return "Máy đang rung: cầm chắc tay rồi chụp";
}
