"use client";
// Chụp ảnh bằng camera TRONG APP (AGENTS.md: không cho chọn ảnh từ thư viện).
// Đường chính: getUserMedia (camera sau) → vẽ khung hình ra canvas → JPEG. Cần HTTPS hoặc localhost.
// Dự phòng chỉ trên màn cảm ứng (điện thoại/máy tính bảng): <input type="file" accept="image/*" capture="environment">
// mở thẳng app camera của máy. Trên máy tính, `capture` bị bỏ qua và input sẽ mở hộp chọn file (= thư viện ảnh),
// nên máy tính KHÔNG có đường dự phòng này: chỉ giải thích và hướng dẫn dùng điện thoại có camera.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Layers, RefreshCw, SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SAMPLE_SIZE, checkFrame, frameMessage, toLuma, type FrameCheck } from "@/lib/client/photo-quality";

export interface CapturedPhoto {
  blob: Blob;
  /** ISO 8601 UTC, gửi kèm POST /uploads (capturedAt). */
  capturedAt: string;
  width: number;
  height: number;
  source: "getUserMedia" | "input-capture";
}

/** Vì sao camera trong app không dùng được. Mỗi loại có lời giải thích và cách xử lý riêng. */
type Problem = "denied" | "no-camera" | "busy" | "insecure" | "unsupported" | "failed" | "ended";
type CamState = { kind: "starting" } | { kind: "live" } | { kind: "problem"; why: Problem };

const PROBLEMS: Record<Problem, { title: string; body: string; retry: boolean }> = {
  denied: {
    title: "Chưa cho phép dùng camera",
    body: "Hãy bật quyền Camera cho trang này trong cài đặt trình duyệt (biểu tượng ổ khóa cạnh địa chỉ), rồi bấm Thử lại.",
    retry: true,
  },
  "no-camera": {
    title: "Không tìm thấy camera",
    body: "Máy này chưa có camera hoặc camera đang tắt. Hãy mở trang này trên điện thoại có camera.",
    retry: true,
  },
  busy: {
    title: "Camera đang bận",
    body: "App khác đang dùng camera. Đóng app đó rồi bấm Thử lại.",
    retry: true,
  },
  insecure: {
    title: "Trang chưa dùng HTTPS",
    body: "Trình duyệt chặn camera trên trang không có HTTPS. Hãy mở lại bằng địa chỉ bắt đầu bằng https://.",
    retry: false,
  },
  unsupported: {
    title: "Trình duyệt không hỗ trợ camera",
    body: "Hãy dùng Chrome hoặc Safari bản mới, tốt nhất trên điện thoại.",
    retry: false,
  },
  failed: {
    title: "Không mở được camera",
    body: "Bấm Thử lại. Nếu vẫn lỗi, hãy mở trang này trên thiết bị khác có camera.",
    retry: true,
  },
  ended: {
    title: "Camera bị ngắt giữa chừng",
    body: "Thiết bị camera bị rút hoặc app khác chiếm mất. Bấm Thử lại.",
    retry: true,
  },
};

/** API nhận tối đa 5 MB/ảnh (docs/api-contract.md > POST /uploads). Chừa lề cho phần bao multipart. */
const MAX_BYTES = 4.5 * 1024 * 1024;
/** Ảnh từ input dự phòng phải mới chụp: ảnh cũ trong thư viện bị từ chối. */
const FRESH_MS = 10 * 60 * 1000;

/** Nén dần cho tới khi vừa giới hạn: giảm chất lượng trước, rồi giảm kích thước. */
async function encodeJpeg(src: CanvasImageSource, w: number, h: number): Promise<{ blob: Blob; w: number; h: number } | null> {
  for (const [scale, quality] of [[1, 0.85], [1, 0.7], [0.75, 0.7], [0.5, 0.7]] as const) {
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext("2d")?.drawImage(src, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return { blob, w: cw, h: ch };
    if (!blob) return null;
  }
  return null;
}

function classify(e: unknown): Problem {
  switch ((e as DOMException)?.name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "no-camera";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    default:
      return "failed";
  }
}

export function CameraCapture({
  onCapture,
  overlayUrl,
}: {
  onCapture: (p: CapturedPhoto) => void;
  /** Ảnh cũ cùng vị trí (P2 "lớp ảnh mờ"): vẽ mờ đè lên khung để chụp đúng góc cũ. Chỉ để canh góc:
   *  snap() chỉ vẽ khung hình video ra canvas nên lớp mờ KHÔNG nằm trong ảnh chụp. */
  overlayUrl?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cam, setCam] = useState<CamState>({ kind: "starting" });
  const camRef = useRef(cam);
  camRef.current = cam;
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [attempt, setAttempt] = useState(0); // tăng để mở lại camera sau khi bị từ chối/ngắt
  const [ghost, setGhost] = useState(true);
  const [cameraCount, setCameraCount] = useState(0);
  const [touch, setTouch] = useState(false); // màn cảm ứng chính: mới có app camera của máy để dự phòng
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [quality, setQuality] = useState<FrameCheck | null>(null);
  const live = cam.kind === "live";
  const showGhost = !!overlayUrl && ghost && live;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setCam({ kind: "starting" });
      setNotice("");
      stop();
      if (!navigator.mediaDevices?.getUserMedia) {
        setCam({ kind: "problem", why: window.isSecureContext ? "unsupported" : "insecure" });
        return;
      }
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        } catch (e) {
          // Máy không đáp ứng được ràng buộc (độ phân giải, hướng camera): thử lại với yêu cầu tối thiểu.
          if ((e as DOMException).name !== "OverconstrainedError") throw e;
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // Camera bị rút hoặc app khác chiếm giữa chừng: báo thay vì để khung đen đứng im.
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (!cancelled && streamRef.current === stream) {
            stop();
            setCam({ kind: "problem", why: "ended" });
          }
        });
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setCam({ kind: "live" });
        // Nhãn thiết bị chỉ có sau khi được cấp quyền; ở đây chỉ cần đếm để biết có đổi camera được không.
        navigator.mediaDevices
          .enumerateDevices()
          .then((d) => !cancelled && setCameraCount(d.filter((x) => x.kind === "videoinput").length))
          .catch(() => {});
      } catch (e) {
        if (!cancelled) setCam({ kind: "problem", why: classify(e) });
      }
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, attempt, stop]);

  // Quay lại tab hoặc app sau khi đã mở camera: tắt camera lúc ẩn (riêng tư, tiết kiệm pin), bật lại khi hiện.
  useEffect(() => {
    let wasLive = false;
    function onVisibility() {
      if (document.hidden) {
        wasLive = camRef.current.kind === "live";
        if (wasLive) stop();
      } else if (wasLive) {
        wasLive = false;
        retry();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stop, retry]);

  // Người dùng bật quyền trong cài đặt trình duyệt: tự mở lại, không bắt bấm Thử lại.
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let gone = false;
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((s) => {
        if (gone) return;
        status = s;
        s.onchange = () => {
          const c = camRef.current;
          if (s.state === "granted" && c.kind === "problem" && c.why === "denied") retry();
        };
      })
      .catch(() => {}); // Safari/Firefox chưa hỗ trợ truy vấn quyền camera
    return () => {
      gone = true;
      if (status) status.onchange = null;
    };
  }, [retry]);

  // Khung xanh/đỏ: mỗi ~0,5 giây đo một khung hình thu nhỏ (quá tối, quá chói, máy rung). Chỉ để nhắc,
  // không khóa nút Chụp: phòng có thể tối thật, AI sẽ trả UNCLEAR và còn bước kháng nghị.
  useEffect(() => {
    if (!live) {
      setQuality(null);
      return;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let prev: Uint8Array | null = null;
    let last: FrameCheck | null = null;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const scale = SAMPLE_SIZE / Math.max(v.videoWidth, v.videoHeight);
      const w = Math.max(1, Math.round(v.videoWidth * scale));
      const h = Math.max(1, Math.round(v.videoHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        prev = null;
      }
      ctx.drawImage(v, 0, 0, w, h);
      const luma = toLuma(ctx.getImageData(0, 0, w, h).data);
      const now = checkFrame(luma, prev);
      prev = luma;
      // Chỉ báo lỗi khi 2 lần đo liền nhau cùng thấy, để khung không nhấp nháy.
      const issues = now.issues.filter((i) => last?.issues.includes(i));
      last = now;
      setQuality({ ok: issues.length === 0, issues });
    }, 500);
    return () => window.clearInterval(id);
  }, [live]);

  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const out = await encodeJpeg(v, v.videoWidth, v.videoHeight);
      if (!out) {
        setNotice("Không lưu được ảnh. Bấm Chụp lại.");
        return;
      }
      onCapture({
        blob: out.blob,
        capturedAt: new Date().toISOString(),
        width: out.w,
        height: out.h,
        source: "getUserMedia",
      });
    } finally {
      setSaving(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Hộp chọn file của một số trình duyệt vẫn cho lấy ảnh cũ: chỉ nhận ảnh vừa chụp.
    if (Date.now() - file.lastModified > FRESH_MS) {
      setNotice("Ảnh này không phải ảnh vừa chụp. Hãy chụp ảnh mới.");
      return;
    }
    setNotice("");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      try {
        if (file.size <= MAX_BYTES) {
          onCapture({ blob: file, capturedAt: new Date().toISOString(), width: w, height: h, source: "input-capture" });
          return;
        }
        // Ảnh từ app camera của máy thường lớn hơn giới hạn 5 MB của API: nén lại.
        const out = await encodeJpeg(img, w, h);
        if (!out) setNotice("Ảnh quá lớn, không nén được. Hãy chụp lại.");
        else
          onCapture({
            blob: out.blob,
            capturedAt: new Date().toISOString(),
            width: out.w,
            height: out.h,
            source: "input-capture",
          });
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setNotice("Không đọc được ảnh này. Hãy chụp lại.");
    };
    img.src = url;
  }

  const problem = cam.kind === "problem" ? PROBLEMS[cam.why] : null;

  return (
    <div className="space-y-3">
      {/* Khung 3:4 nhưng không cao quá 70% màn hình, để nút Chụp luôn nằm trong tầm nhìn khi xoay ngang. */}
      <div
        className={cn(
          "relative mx-auto aspect-[3/4] w-full max-w-[min(100%,calc(70dvh*0.75))] overflow-hidden rounded-2xl",
          problem ? "bg-muted text-foreground ring-1 ring-foreground/10" : "bg-black",
          live && quality && "ring-4 transition-shadow",
          live && quality && (quality.ok ? "ring-success" : "ring-destructive"),
        )}
      >
        {/* playsInline + muted: bắt buộc trên iOS Safari để video không bật toàn màn hình */}
        <video
          ref={videoRef}
          playsInline
          muted
          disablePictureInPicture
          aria-label="Khung nhìn camera"
          className={cn("size-full object-cover", !live && "invisible")}
        />
        {showGhost && (
          // Cùng object-cover và cùng khung 3:4 với video, nên ảnh cũ trùng khít vị trí trên màn hình.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={overlayUrl!}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-35"
          />
        )}
        {showGhost && (
          <p className="pointer-events-none absolute inset-x-3 top-3 rounded-full bg-black/55 px-3 py-1 text-center text-xs text-white">
            Canh cho khớp ảnh mờ lúc nhận phòng
          </p>
        )}
        {live && quality && (
          // Kèm biểu tượng và chữ, không chỉ dựa vào màu (người mù màu xanh–đỏ vẫn đọc được).
          <p
            className={cn(
              "pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-center text-sm font-medium text-white",
              quality.ok ? "bg-success/90" : "bg-destructive/90",
            )}
          >
            {quality.ok ? (
              <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            ) : (
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
            )}
            {frameMessage(quality)}
          </p>
        )}
        {cam.kind === "starting" && (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Đang mở camera…</p>
        )}
        {problem && (
          <div role="alert" className="absolute inset-0 grid place-items-center overflow-y-auto p-5 text-center">
            <div className="max-w-xs space-y-2">
              <Camera aria-hidden className="mx-auto size-8 text-muted-foreground" />
              <p className="text-base font-semibold text-balance">{problem.title}</p>
              <p className="text-sm text-foreground/80">{problem.body}</p>
              <p className="text-sm text-muted-foreground">
                {touch
                  ? "Bạn cũng có thể mở app camera của máy để chụp."
                  : "Ảnh phải chụp trực tiếp trong app, không chọn từ thư viện."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Báo trạng thái cho trình đọc màn hình; lỗi đã có role="alert" ở khung trên */}
      <p role="status" className="sr-only">
        {cam.kind === "starting" ? "Đang mở camera" : live ? "Camera đã sẵn sàng" : ""}
      </p>
      {notice && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {notice}
        </p>
      )}

      {live || cam.kind === "starting" ? (
        <div className="space-y-2">
          <Button size="lg" className="h-14 w-full text-base" onClick={snap} disabled={!live || saving}>
            <Camera aria-hidden /> {saving ? "Đang lưu ảnh…" : live ? "Chụp" : "Đang mở camera…"}
          </Button>
          {live && (overlayUrl || cameraCount > 1) && (
            <div className="flex gap-2">
              {overlayUrl && (
                <Button
                  variant="secondary"
                  className={cn("flex-1", ghost && "ring-2 ring-primary/40")}
                  aria-pressed={ghost}
                  onClick={() => setGhost((g) => !g)}
                >
                  <Layers aria-hidden /> Ảnh mờ lúc nhận phòng
                </Button>
              )}
              {cameraCount > 1 && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                >
                  <SwitchCamera aria-hidden /> Đổi camera
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {touch && (
            <Button size="lg" className="h-14 flex-1 text-base" onClick={() => inputRef.current?.click()}>
              <Camera aria-hidden /> Mở app camera của máy
            </Button>
          )}
          {problem?.retry && (
            <Button
              size="lg"
              variant={touch ? "secondary" : "default"}
              className="h-14 flex-1 text-base"
              onClick={retry}
            >
              <RefreshCw aria-hidden /> Thử lại camera
            </Button>
          )}
        </div>
      )}

      {/* capture="environment": mở thẳng camera sau, không có thư viện ảnh. Chỉ dùng được khi `touch` (xem đầu file). */}
      {touch && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={onFile}
        />
      )}
    </div>
  );
}
