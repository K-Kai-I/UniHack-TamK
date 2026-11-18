"use client";
// Preview nội bộ cho task 16: JuryVoteView với dữ liệu giả, không gọi ví, API hay chuỗi.
// /dev/vote?kind=deduction|mismatch&access=juror|party|voted|not-juror|checking|check-failed|logged-out
//   &state=DISPUTED|SETTLED|REFUNDED&vl=<phiếu chủ trọ>&vt=<phiếu người thuê>&ai=0|1&passed=1&yield=1
//   &tx=idle|signing|pending|success|error&n=<số vị trí>&photos=1&long=1&empty=1&dep=<VND>&d=<VND chủ trọ>&c=<VND người thuê>
// Ảnh giả vẽ bằng canvas để thấy khung ảnh; không phải ảnh phòng thật. Mọi nút chỉ ghi vào bảng nhật ký ẩn.
import { useEffect, useMemo, useState } from "react";
import { JuryVoteView, type JuryAccess, type Side } from "@/components/jury-vote";
import { fetchDealView, type DealView } from "@/lib/client/deals-data";
import type { DisputeEvidence, DisputeView } from "@/lib/client/disputes-api";
import { vndToAmount } from "@/lib/client/money";
import type { TxState } from "@/lib/client/use-tx";
import type { DamageVerdict, DealState, Hash, ListingVerdict } from "@/lib/types";

const RATE = 25000;
const HASH = `0x${"1".repeat(64)}` as Hash;
const tok = (vnd: number) => vndToAmount(BigInt(vnd), RATE).toString();
const NAMES = [
  "Tường đầu giường", "Cửa ra vào", "Sàn nhà", "Cửa sổ", "Nhà vệ sinh", "Bồn rửa",
  "Trần nhà", "Bếp và bồn rửa chén", "Tủ quần áo và kệ treo đồ", "Ban công và lan can phía sau",
];
const VERDICTS: DamageVerdict[] = ["NEW_DAMAGE", "WEAR", "UNCLEAR"];

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

export default function VotePreview() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [base, setBase] = useState<{ deduction: DealView; mismatch: DealView } | null>(null);
  const [photos, setPhotos] = useState<Record<number, [string, string]>>({});
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search));
    Promise.all([fetchDealView(26), fetchDealView(35)]).then(([deduction, mismatch]) => setBase({ deduction, mismatch }));
  }, []);

  const kind = q?.get("kind") === "mismatch" ? "mismatch" : "deduction";
  const n = Math.max(0, Math.min(10, Number(q?.get("n") ?? 3)));
  const withPhotos = q?.get("photos") === "1";
  const long = q?.get("long") === "1";
  const passed = q?.get("passed") === "1";

  useEffect(() => {
    if (!withPhotos) return;
    let alive = true;
    (async () => {
      const out: Record<number, [string, string]> = {};
      for (let i = 0; i < n; i++) out[i] = [await fakePhoto(`Trước ${i + 1}`, 1200, 900, 200), await fakePhoto(`Sau ${i + 1}`, 900, 1200, 20)];
      if (alive) setPhotos(out);
    })();
    return () => {
      alive = false;
    };
  }, [withPhotos, n]);

  const view = useMemo(() => {
    if (!base || !q) return null;
    const b = base[kind];
    const state = (q.get("state") ?? "DISPUTED") as DealState;
    const deadline = state === "DISPUTED" ? new Date(Date.now() + (passed ? -60_000 : 5 * 3600_000 + 20 * 60_000)).toISOString() : null;
    const hasSeal = q.get("ai") !== "0";
    const dep = Number(q.get("dep") ?? 6_000_000);
    const title = long ? "Đặng Thị Mỹ Duyên — Phòng trên đường Nguyễn Hữu Phước, ngõ 12 ".repeat(3) : b.terms.room.title;
    const vl = Number(q.get("vl") ?? 0);
    const vt = Number(q.get("vt") ?? (hasSeal ? 1 : 0));
    const proposed = Number(q.get("d") ?? 1_120_000);
    const counter = Number(q.get("c") ?? 480_000);
    const aiVnd = 640_000;
    const deal: DealView = {
      ...b,
      terms: { ...b.terms, room: { ...b.terms.room, title } },
      onchain: {
        ...b.onchain,
        state,
        deadline,
        canPoke: passed && state === "DISPUTED",
        hasAiSeal: hasSeal,
        deposit: tok(dep),
        reserveFee: tok(300_000),
        proposedAmount: tok(proposed),
        counterAmount: tok(counter),
        aiAmount: hasSeal ? tok(aiVnd) : "0",
        votesLandlord: vl,
        votesTenant: vt,
        yieldGross: q.get("yield") === "1" ? tok(200_000) : "0",
        disputeKind: kind === "mismatch" ? "MISMATCH" : "DEDUCTION",
      },
    };
    const evidence: DisputeEvidence[] =
      q.get("empty") === "1"
        ? []
        : Array.from({ length: n }, (_, i) => ({
            positionId: `p${i + 1}`,
            name: NAMES[i % NAMES.length],
            beforeUrl: withPhotos ? (photos[i]?.[0] ?? null) : null,
            afterUrl: withPhotos ? (photos[i]?.[1] ?? null) : null,
            ...(kind === "deduction"
              ? {
                  aiVerdict: VERDICTS[i % VERDICTS.length],
                  aiDescription: i % 2 === 0 ? "Vết ố mới ở góc dưới, không có trong ảnh nhận phòng." : null,
                  aiAmount: i % 3 === 0 ? tok(320_000) : "0",
                }
              : {}),
          }));
    const dispute: DisputeView = {
      dealId: deal.dealId,
      kind: kind === "mismatch" ? "MISMATCH" : "DEDUCTION",
      state,
      deadline,
      votes: { landlord: vl, tenant: vt },
      hasAiSeal: hasSeal,
      priceList: deal.terms.priceList,
      evidence,
      ...(kind === "deduction"
        ? { landlordAmount: tok(proposed), tenantAmount: tok(counter), aiAmount: hasSeal ? tok(aiVnd) : "0" }
        : {
            aiVerdict: (hasSeal ? "MISMATCH" : "UNCLEAR") as ListingVerdict,
            aiReasons: hasSeal ? ["Cửa sổ trong ảnh thực tế nhỏ hơn ảnh đăng tin.", "Sàn có vết thấm không thấy lúc đăng."] : [],
          }),
    };
    return { deal, dispute };
  }, [base, q, kind, n, photos, withPhotos, long, passed]);

  if (!q || !view) return null;
  const note = (s: string) => setLog((l) => [...l.slice(-4), s]);

  return (
    <>
      <JuryVoteView
        deal={view.deal}
        dispute={view.dispute}
        back="/dev/ui"
        rate={RATE}
        access={(q.get("access") ?? "juror") as JuryAccess}
        tx={txFrom(q.get("tx") ?? "idle")}
        onSign={(s: Side) => note(`ký ${s}`)}
        onLogin={() => note("đăng nhập")}
        onRecheck={() => note("kiểm tra lại")}
        onExpire={() => note("hết hạn")}
      />
      <p className="sr-only" role="log" data-testid="preview-log">
        {log.join(" | ")}
      </p>
    </>
  );
}
