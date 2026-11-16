"use client";
// Chụp ảnh bằng camera TRONG APP (AGENTS.md: không cho chọn ảnh từ thư viện).
// Đường chính: getUserMedia (camera sau) → vẽ khung hình ra canvas → JPEG. Cần HTTPS hoặc localhost.
// Dự phòng: <input type="file" accept="image/*" capture="environment"> khi getUserMedia không dùng được
// (trình duyệt chặn, HTTP trên mạng LAN, từ chối quyền). Input này mở thẳng app camera, không có thư viện ảnh.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Layers, RefreshCw, SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface CapturedPhoto {
  blob: Blob;
  /** ISO 8601 UTC, gửi kèm POST /uploads (capturedAt). */
  capturedAt: string;
  width: number;
  height: number;
  source: "getUserMedia" | "input-capture";
}

type CamState = "starting" | "live" | "fallback";

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
  const [cam, setCam] = useState<CamState>("starting");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState(0); // tăng để mở lại camera sau khi bị từ chối
  const [ghost, setGhost] = useState(true);
  const showGhost = !!overlayUrl && ghost && cam === "live";

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setCam("starting");
      stop();
      if (!navigator.mediaDevices?.getUserMedia) {
        setReason(
          window.isSecureContext
            ? "Trình duyệt không hỗ trợ camera trực tiếp."
            : "Trang chưa chạy HTTPS nên trình duyệt chặn camera trực tiếp.",
        );
        setCam("fallback");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setCam("live");
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException).name;
        setReason(
          name === "NotAllowedError"
            ? "Bạn chưa cho phép dùng camera. Bấm biểu tượng ổ khóa trên thanh địa chỉ để bật lại."
            : name === "NotFoundError"
              ? "Không tìm thấy camera."
              : "Không mở được camera trực tiếp.",
        );
        setCam("fallback");
      }
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, attempt, stop]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture({
          blob,
          capturedAt: new Date().toISOString(),
          width: canvas.width,
          height: canvas.height,
          source: "getUserMedia",
        });
      },
      "image/jpeg",
      0.85, // API nhận tối đa 5 MB/ảnh (docs/api-contract.md > POST /uploads)
    );
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onCapture({
        blob: file,
        capturedAt: new Date().toISOString(),
        width: img.naturalWidth,
        height: img.naturalHeight,
        source: "input-capture",
      });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
        {/* playsInline + muted: bắt buộc trên iOS Safari để video không bật toàn màn hình */}
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
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
        {cam === "starting" && (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Đang mở camera…</p>
        )}
        {cam === "fallback" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/90">
            <div className="space-y-2">
              <Camera className="mx-auto size-8" />
              <p>{reason}</p>
              <p className="text-white/70">Bấm nút bên dưới để mở app camera của máy.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {cam === "live" ? (
          <>
            <Button size="lg" className="h-14 flex-1 text-base" onClick={snap}>
              <Camera /> Chụp
            </Button>
            {overlayUrl && (
              <Button
                size="lg"
                variant="secondary"
                className={cn("h-14", ghost && "ring-2 ring-primary/40")}
                aria-label={ghost ? "Ẩn ảnh mờ lúc nhận phòng" : "Hiện ảnh mờ lúc nhận phòng"}
                aria-pressed={ghost}
                onClick={() => setGhost((g) => !g)}
              >
                <Layers />
              </Button>
            )}
            <Button
              size="lg"
              variant="secondary"
              className="h-14"
              aria-label="Đổi camera trước/sau"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            >
              <SwitchCamera />
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="h-14 flex-1 text-base" onClick={() => inputRef.current?.click()}>
              <Camera /> Mở camera máy
            </Button>
            {cam === "fallback" && (
              <Button
                size="lg"
                variant="secondary"
                className="h-14"
                aria-label="Thử lại camera trực tiếp"
                onClick={() => setAttempt((n) => n + 1)}
              >
                <RefreshCw />
              </Button>
            )}
          </>
        )}
      </div>

      {/* capture="environment": mở thẳng camera sau, không có thư viện ảnh */}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
    </div>
  );
}
