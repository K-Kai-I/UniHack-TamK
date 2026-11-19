"use client";
// Preview nội bộ cho task 14: MismatchResultView / MismatchEvidenceLayout với dữ liệu giả, không gọi ví, API hay chuỗi.
// /dev/mismatch?view=result|evidence&photos=0|1&n=<số vị trí>&long=1&passed=1
//   result:   &verdict=2|1|0|failed|none|processing|loaderror&tx=idle|signing|pending|success|error&next=DISPUTED&retrying=1&retryerr=1
//   evidence: &role=tenant|landlord|viewer&state=MISMATCH_REPORTED|DISPUTED|REFUNDED&seal=0|1&verdict=2|1
// Ảnh giả vẽ bằng canvas để thấy khung ảnh; không phải ảnh phòng thật. Mọi nút chỉ ghi vào bảng nhật ký bên dưới.
import { useEffect, useMemo, useState } from "react";
import { MismatchEvidenceLayout, MismatchResultView } from "@/components/mismatch-flow";
import type { Role } from "@/lib/client/deal-actions";
import { fetchDealView, mockMismatchReport, type DealView } from "@/lib/client/deals-data";
import type { MismatchAiResponse } from "@/lib/client/mismatch-api";
import type { TxState } from "@/lib/client/use-tx";
import type { DealState, Hash, ListingVerdict, Position } from "@/lib/types";

const RATE = 25000;
const HASH = `0x${"1".repeat(64)}` as Hash;
const H = (n: string) => `0x${n.repeat(64).slice(0, 64)}` as Hash;
const NAMES = [
  "Tường đầu giường", "Cửa ra vào", "Sàn nhà", "Cửa sổ", "Nhà vệ sinh", "Bồn rửa",
  "Trần nhà", "Bếp và bồn rửa chén", "Tủ quần áo và kệ treo đồ", "Ban công và lan can phía sau",
];
const CODE: Record<string, { v: ListingVerdict; n: 0 | 1 | 2 }> = {
  "2": { v: "MISMATCH", n: 2 },
  "1": { v: "UNCLEAR", n: 1 },
  "0": { v: "MATCH", n: 0 },
};

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

function txFrom(name: string): TxState {
  switch (name) {
    case "signing": return { phase: "signing" };
    case "pending": return { phase: "pending", hash: HASH };
    case "success": return { phase: "success", hash: HASH };
    case "error": return { phase: "error", error: "Bạn đã hủy ký. Có thể thử lại khi sẵn sàng." };
    default: return { phase: "idle" };
  }
}

export default function MismatchPreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [base, setBase] = useState<DealView | null>(null);
  const [photos, setPhotos] = useState<Record<string, [string, string]>>({});
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search));
    fetchDealView(21).then(setBase);
  }, []);

  const view = q?.get("view") === "evidence" ? "evidence" : "result";
  const n = Math.max(1, Math.min(10, Number(q?.get("n") ?? 3)));
  const withPhotos = q?.get("photos") === "1";
  const long = q?.get("long") === "1";
  const passed = q?.get("passed") === "1";

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
    let alive = true;
    (async () => {
      const out: Record<string, [string, string]> = {};
      for (const [i, p] of positions.entries()) {
        out[p.id] = [await fakePhoto(`Lúc đăng tin ${i + 1}`, 1200, 900, 200), await fakePhoto(`Thực tế ${i + 1}`, 900, 1200, 20)];
      }
      if (alive) setPhotos(out);
    })();
    return () => {
      alive = false;
    };
  }, [withPhotos, positions]);

  const deal: DealView | null = useMemo(() => {
    if (!base || !q) return null;
    const state = (view === "result" ? "RESERVED" : (q.get("state") ?? "MISMATCH_REPORTED")) as DealState;
    const deadline = new Date(Date.now() + (passed ? -60_000 : 90 * 60_000)).toISOString();
    const hasSeal = q.get("seal") !== "0";
    const title = long
      ? "Đặng Thị Mỹ Duyên — Phòng trên đường Nguyễn Hữu Phước, ngõ 12 ".repeat(3)
      : base.terms.room.title;
    const report = view === "evidence" && hasSeal ? { ...mockMismatchReport(21), verdict: CODE[q.get("verdict") ?? "2"].v } : null;
    return {
      ...base,
      terms: { ...base.terms, room: { ...base.terms.room, title }, positions },
      onchain: {
        ...base.onchain,
        state,
        deadline: state === "REFUNDED" ? null : deadline,
        canPoke: passed && state === "MISMATCH_REPORTED",
        hasAiSeal: hasSeal,
        disputeKind: state === "DISPUTED" ? "MISMATCH" : base.onchain.disputeKind,
        votesTenant: state === "DISPUTED" ? 1 : 0,
      },
      examplePhotoUrls: withPhotos ? Object.fromEntries(positions.map((p) => [p.id, photos[p.id]?.[0] ?? ""])) : {},
      photoSets: {
        ...base.photoSets,
        mismatch:
          view === "evidence"
            ? {
                setHash: HASH,
                photoSetId: "ps_preview",
                items: positions.map((p) => ({ positionId: p.id, url: withPhotos ? (photos[p.id]?.[1] ?? "") : "" })),
              }
            : null,
      },
      reports: { ...base.reports, mismatch: report },
    };
  }, [base, q, view, positions, photos, withPhotos, long, passed]);

  if (!q || !deal) return null;

  const note = (s: string) => setLog((l) => [...l.slice(-4), s]);
  const verdictQ = q.get("verdict") ?? "2";
  const ai: MismatchAiResponse | undefined = (() => {
    if (verdictQ === "loaderror") return undefined;
    if (verdictQ === "processing") return { status: "processing", report: null, seal: null };
    if (verdictQ === "none") return { status: "none", report: null, seal: null };
    if (verdictQ === "failed") return { status: "failed", report: null, seal: null, error: "Máy chủ AI quá tải." };
    const c = CODE[verdictQ] ?? CODE["2"];
    return {
      status: "done",
      report: { ...mockMismatchReport(21), verdict: c.v, reasons: q.get("reasons") === "0" ? [] : mockMismatchReport(21).reasons },
      seal: { dealId: 21, termsHash: HASH, evidenceHash: HASH, verdict: c.n, reportHash: HASH, signature: HASH },
    };
  })();
  const actual = withPhotos ? Object.fromEntries(positions.map((p) => [p.id, photos[p.id]?.[1] ?? ""])) : undefined;

  return (
    <>
      {view === "result" ? (
        <MismatchResultView
          deal={deal}
          rate={RATE}
          ai={ai}
          loading={false}
          loadFailed={verdictQ === "loaderror"}
          actualUrls={actual}
          tx={txFrom(q.get("tx") ?? "idle")}
          nextState={(q.get("next") as DealState | null) ?? undefined}
          retrying={q.get("retrying") === "1"}
          retryError={q.get("retryerr") === "1" ? "Chưa gọi được AI. Thử lại sau một lát." : ""}
          back="/dev/ui"
          onSign={() => note("ký")}
          onRetryAi={() => note("thử lại AI")}
          onReloadAi={() => note("tải lại AI")}
          onCheckin={() => note("quay lại nhận phòng")}
        />
      ) : (
        <MismatchEvidenceLayout
          deal={deal}
          role={(q.get("role") ?? "viewer") as Role}
          back="/dev/ui"
          onExpire={() => note("hết hạn")}
          onContest={() => note("phản đối")}
        />
      )}
      <p className="sr-only" role="log" data-testid="preview-log">
        {log.join(" | ")}
      </p>
    </>
  );
}
