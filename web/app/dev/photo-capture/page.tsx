"use client";
// Preview nội bộ cho task 11: ghép các khối của photo-capture-flow với dữ liệu giả, không gọi API, ví hay chuỗi.
// /dev/photo-capture?n=3..10&kind=checkin|checkout&mode=shoot|shot|review|done&refs=1
// shoot = camera thật (cần quyền camera); shot = vị trí 1 đã có ảnh; review = đủ ảnh; done = đã gửi.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionArea } from "@/components/action-area";
import { PageHeader } from "@/components/page-header";
import { PageColumns, PageShell } from "@/components/page-shell";
import { PositionStrip, Review, ShootStep, type Shot } from "@/components/photo-capture-flow";
import { WALL_SAMPLE_TERMS } from "@/lib/client/rooms-data";
import { fetchDealView, type DealView } from "@/lib/client/deals-data";
import type { Position } from "@/lib/types";

const NAMES = [
  "Tường đầu giường", "Cửa ra vào", "Sàn nhà", "Cửa sổ", "Nhà vệ sinh", "Bồn rửa",
  "Trần nhà", "Bếp và bồn rửa chén", "Tủ quần áo và kệ treo đồ", "Ban công và lan can phía sau",
];

/** Ảnh giả bằng canvas để thấy khung ảnh, không phải ảnh phòng thật. */
function fakePhoto(label: string, w: number, h: number, hue: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = `hsl(${hue} 35% 70%)`;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#222";
  g.font = `${Math.round(h / 12)}px sans-serif`;
  g.fillText(label, 24, h / 2);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.8));
}

export default function PhotoCapturePreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [shots, setShots] = useState<Record<string, Shot>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [base, setBase] = useState<DealView | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQ(params);
    fetchDealView(params.get("kind") === "checkout" ? 23 : 21).then(setBase);
  }, []);
  const n = Math.min(10, Math.max(3, Number(q?.get("n") ?? 3)));
  const kind = q?.get("kind") === "checkout" ? "checkout" : "checkin";
  const mode = q?.get("mode") ?? "shoot";
  const withRefs = q?.get("refs") === "1";

  const positions: Position[] = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        id: `p${i + 1}`,
        name: NAMES[i % NAMES.length],
        instruction: "Đứng ở cửa, chụp toàn bộ khu vực này theo chiều dọc, thấy rõ góc trên và dưới.",
        examplePhoto: { photoId: `x${i}`, sha256: `0x${"0".repeat(64)}`, url: "" } as never,
      })),
    [n],
  );

  useEffect(() => {
    if (!q) return;
    let gone = false;
    const urls: string[] = [];
    (async () => {
      const nextShots: Record<string, Shot> = {};
      const nextRefs: Record<string, string> = {};
      for (const [i, p] of positions.entries()) {
        if (withRefs) {
          const b = await fakePhoto(`Tham chiếu ${p.name}`, 1280, 960, 200 + i * 10);
          const u = URL.createObjectURL(b);
          urls.push(u);
          nextRefs[p.id] = u;
        }
        const wanted = mode === "review" || mode === "done" || (mode === "shot" && i === 0);
        if (wanted) {
          const b = await fakePhoto(`Ảnh chụp ${p.name}`, i % 2 ? 1920 : 1080, i % 2 ? 1080 : 1920, 30 + i * 10);
          const u = URL.createObjectURL(b);
          urls.push(u);
          nextShots[p.id] = { blob: b, capturedAt: new Date().toISOString(), previewUrl: u };
        }
      }
      if (gone) return;
      setRefs(nextRefs);
      setShots(nextShots);
      setStep(mode === "review" || mode === "done" ? n : 0);
    })();
    return () => {
      gone = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [q, positions, mode, withRefs, n]);

  const deal: DealView | null = useMemo(() => {
    if (!base) return null;
    return {
      ...base,
      terms: { ...base.terms, positions, room: { ...WALL_SAMPLE_TERMS.room, title: "Phòng 302 · Nhà trọ Hạnh Phúc, Cầu Giấy" } },
      examplePhotoUrls: kind === "checkin" ? refs : {},
      photoSets: {
        ...base.photoSets,
        checkin: { setHash: `0x${"c".repeat(64)}`, items: positions.map((p) => ({ positionId: p.id, url: kind === "checkout" ? (refs[p.id] ?? "") : "" })) },
      },
    };
  }, [base, kind, positions, refs]);

  if (!q || !deal) return null;
  const pos = positions[Math.min(step, n - 1)];
  const sent = mode === "done";

  return (
    <PageShell>
      <PageHeader href="/dev/ui" backLabel="Về trang mẫu" title={kind === "checkin" ? "Ảnh nhận phòng" : "Ảnh trả phòng"} right={<span className="text-sm tabular-nums">{step >= n ? "Kiểm tra" : `${step + 1}/${n}`}</span>} />
      <p className="text-sm text-muted-foreground">Phòng 302 · Nhà trọ Hạnh Phúc, Cầu Giấy · {n} vị trí cần chụp</p>
      <PositionStrip positions={positions} shots={shots} step={step} onPick={sent ? undefined : setStep} />
      {step >= n ? (
        <PageColumns className="mt-4">
          <Review deal={deal} shots={shots} kind={kind} onPick={sent ? undefined : setStep} sent={sent} />
          <div>
            <ActionArea>
              <Button size="lg" className="w-full text-base">{sent ? "Về hợp đồng" : "Gửi ảnh"}</Button>
            </ActionArea>
          </div>
        </PageColumns>
      ) : (
        <ShootStep
          key={pos.id}
          deal={deal}
          kind={kind}
          pos={pos}
          shot={shots[pos.id] ?? null}
          onCapture={() => {}}
          onRetake={() => setShots((s) => { const x = { ...s }; delete x[pos.id]; return x; })}
          onNext={() => setStep(step + 1)}
          isLast={step === n - 1}
          taken={Object.keys(shots).length}
        />
      )}
    </PageShell>
  );
}
