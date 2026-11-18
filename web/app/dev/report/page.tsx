"use client";
// Preview nội bộ cho task 12: ghép ReportLayout với báo cáo giả, không gọi API, ví hay chuỗi.
// /dev/report?set=mixed|clean|capped|many&photos=0|1&seal=0|1&ai=done|processing|failed|none|error&role=landlord|tenant|viewer&expl=0|1&nocheckin=1
// mixed = đủ NEW_DAMAGE (trong + ngoài bảng giá), WEAR, NO_CHANGE, UNCLEAR; clean = không đổi hết; capped = tổng vượt cọc; many = 10 vị trí.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionArea } from "@/components/action-area";
import { ReportLayout } from "@/components/damage-report";
import type { DamageAiResponse } from "@/lib/client/ai-report-api";
import type { Role } from "@/lib/client/deal-actions";
import { fetchDealView, MOCK_EXPLANATION, type DealView } from "@/lib/client/deals-data";
import type { DamagePosition, DamageVerdict, Hash, Position } from "@/lib/types";

const NAMES = [
  "Tường đầu giường", "Cửa ra vào", "Sàn nhà", "Cửa sổ", "Nhà vệ sinh", "Bồn rửa",
  "Trần nhà", "Bếp và bồn rửa chén", "Tủ quần áo và kệ treo đồ", "Ban công và lan can phía sau",
];
const H = (n: string) => `0x${n.repeat(64).slice(0, 64)}` as Hash;

/** Ảnh giả bằng canvas để thấy khung ảnh; không phải ảnh phòng thật. */
function fakePhoto(label: string, w: number, h: number, hue: number): Promise<string> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = `hsl(${hue} 35% 70%)`;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#222";
  g.font = `${Math.round(h / 12)}px sans-serif`;
  g.fillText(label, 24, h / 2);
  return new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b!)), "image/jpeg", 0.8));
}

type Row = Pick<DamagePosition, "verdict" | "priceItemId" | "quantity" | "outsidePriceList"> & { text: string; confidence: number };
const ROWS: Record<string, Row[]> = {
  mixed: [
    { verdict: "NEW_DAMAGE", priceItemId: "i1", quantity: 1, outsidePriceList: false, confidence: 0.86, text: "Ảnh trả phòng có một vết bẩn lớn ở góc phải mảng tường." },
    { verdict: "NEW_DAMAGE", priceItemId: null, quantity: 0, outsidePriceList: true, confidence: 0.78, text: "Tay nắm cửa bị gãy một nửa, bảng giá không có hạng mục này." },
    { verdict: "WEAR", priceItemId: null, quantity: 0, outsidePriceList: false, confidence: 0.74, text: "Sơn cửa bạc màu đều, không thấy vết trầy mới." },
    { verdict: "NO_CHANGE", priceItemId: null, quantity: 0, outsidePriceList: false, confidence: 0.93, text: "Hai ảnh giống nhau, sàn sạch và nguyên vẹn." },
    { verdict: "UNCLEAR", priceItemId: null, quantity: 0, outsidePriceList: false, confidence: 0.4, text: "Ảnh trả phòng bị mờ, không đủ rõ để so sánh." },
  ],
  clean: [{ verdict: "NO_CHANGE", priceItemId: null, quantity: 0, outsidePriceList: false, confidence: 0.95, text: "Hai ảnh giống nhau, không có thay đổi." }],
  capped: [
    { verdict: "NEW_DAMAGE", priceItemId: "i1", quantity: 10, outsidePriceList: false, confidence: 0.9, text: "Nhiều mảng tường bị bong sơn và ố lớn." },
    { verdict: "NEW_DAMAGE", priceItemId: "i2", quantity: 8, outsidePriceList: false, confidence: 0.8, text: "Ổ khóa bị phá, phải thay nhiều lần." },
  ],
};
ROWS.many = Array.from({ length: 10 }, (_, i) => ROWS.mixed[i % 5]);

export default function ReportPreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [base, setBase] = useState<DealView | null>(null);
  const [photos, setPhotos] = useState<Record<string, [string, string]>>({});

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search));
    fetchDealView(24).then(setBase);
  }, []);

  const set = q?.get("set") && ROWS[q.get("set")!] ? q.get("set")! : "mixed";
  const rows = ROWS[set];
  const n = set === "many" ? 10 : set === "clean" ? 4 : rows.length;
  const withPhotos = q?.get("photos") === "1";
  const aiStatus = (q?.get("ai") ?? "done") as DamageAiResponse["status"] | "error";
  const sealed = q?.get("seal") !== "0";
  const role = (q?.get("role") ?? "viewer") as Role;
  const withExplanation = q?.get("expl") !== "0";

  const positions: Position[] = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        id: `p${i + 1}`,
        name: NAMES[i % NAMES.length],
        instruction: "Đứng ở cửa, chụp toàn bộ khu vực này theo chiều dọc.",
        examplePhoto: { photoId: `x${i}`, sha256: H("0"), url: "" } as never,
      })),
    [n],
  );

  useEffect(() => {
    if (!withPhotos) return;
    let gone = false;
    const urls: string[] = [];
    (async () => {
      const next: Record<string, [string, string]> = {};
      for (const [i, p] of positions.entries()) {
        const before = await fakePhoto(`Nhận phòng · ${p.name}`, 1600, 1200, 200 + i * 12);
        // Vài ảnh dọc để thấy khung giữ đủ ảnh, không cắt.
        const after = i % 3 === 1 ? await fakePhoto(`Trả phòng (dọc) · ${p.name}`, 900, 1600, 20 + i * 12) : await fakePhoto(`Trả phòng · ${p.name}`, 1600, 1200, 20 + i * 12);
        urls.push(before, after);
        next[p.id] = [before, after];
      }
      if (!gone) setPhotos(next);
    })();
    return () => {
      gone = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [withPhotos, positions]);

  const deal: DealView | null = useMemo(() => {
    if (!base) return null;
    const mk = (hash: Hash, idx: 0 | 1) => ({
      setHash: hash,
      items: positions.map((p) => ({ positionId: p.id, url: photos[p.id]?.[idx] ?? "" })),
    });
    const priceList = base.terms.priceList;
    const results: DamagePosition[] = positions.map((p, i) => {
      const r = rows[i % rows.length];
      const item = priceList.find((x) => x.id === r.priceItemId);
      const amount = item ? (BigInt(item.priceAmount) * BigInt(r.quantity)).toString() : "0";
      return { positionId: p.id, verdict: r.verdict as DamageVerdict, confidence: r.confidence, description: r.text, priceItemId: r.priceItemId, quantity: r.quantity, outsidePriceList: r.outsidePriceList, amount };
    });
    const total = results.reduce((s, r) => s + BigInt(r.amount), 0n);
    const cap = BigInt(base.onchain.deposit);
    const sealedAmount = total > cap ? cap : total;
    return {
      ...base,
      terms: { ...base.terms, positions },
      photoSets: {
        ...base.photoSets,
        checkin: q?.get("nocheckin") === "1" ? null : mk(H("c"), 0),
        checkout: mk(H("d"), 1),
      },
      reports: {
        ...base.reports,
        damage: aiStatus === "done" ? { schema: "kct.report.damage/1", dealId: base.dealId, checkInHash: H("c"), checkOutHash: H("d"), model: "gemini-3.1-flash-lite", promptVersion: "damage-v1", createdAt: new Date().toISOString(), positions: results, totalAmount: total.toString(), sealedAmount: sealedAmount.toString() } : null,
      },
      aiStatus: { ...base.aiStatus, damage: aiStatus === "error" ? null : aiStatus === "none" ? null : aiStatus },
      explanation: withExplanation ? MOCK_EXPLANATION : null,
    };
  }, [base, positions, photos, rows, aiStatus, withExplanation, q]);

  if (!q || !deal) return null;
  const report = deal.reports.damage;
  const ai: DamageAiResponse | undefined =
    aiStatus === "error"
      ? undefined
      : aiStatus === "done" && report
        ? {
            status: "done",
            report,
            explanation: withExplanation ? MOCK_EXPLANATION : undefined,
            seal: sealed ? { dealId: deal.dealId, checkInHash: report.checkInHash, checkOutHash: report.checkOutHash, aiAmount: report.sealedAmount, reportHash: H("e"), signature: `0x${"ab".repeat(65)}`, signer: `0x${"5".repeat(40)}` } : null,
          }
        : { status: aiStatus as DamageAiResponse["status"], report: null, seal: null, ...(aiStatus === "failed" ? { error: "Mô hình AI không trả lời (dữ liệu giả)." } : {}) };

  const state = role === "landlord" ? "CHECKED_OUT" : role === "tenant" ? "PROPOSED" : deal.onchain.state;
  const view: DealView = { ...deal, onchain: { ...deal.onchain, state, hasAiSeal: sealed } };

  return (
    <ReportLayout
      deal={view}
      role={role}
      back="/dev/ui"
      ai={ai}
      aiLoading={false}
      aiLoadFailed={aiStatus === "error"}
      onRetryAi={() => {}}
      onExpire={() => {}}
      action={
        role === "viewer" ? null : (
          <>
            <section aria-labelledby="dev-action" className="space-y-2">
              <h2 id="dev-action" className="text-lg font-bold">
                {role === "landlord" ? "Đề xuất của bạn" : "Trả lời đề xuất"}
              </h2>
              <p className="text-sm text-muted-foreground">Chỗ này là ProposePanel / RespondPanel (task 13).</p>
            </section>
            <ActionArea>
              <Button size="lg" className="w-full text-base">{role === "landlord" ? "Gửi đề xuất" : "Đồng ý"}</Button>
            </ActionArea>
          </>
        )
      }
    />
  );
}
