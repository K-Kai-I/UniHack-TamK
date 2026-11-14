"use client";
// Ô nhập dùng chung cho form Đăng phòng: nhãn + lỗi, ô tiền VND, ô chụp ảnh bằng camera trong app.
import { useId, useState } from "react";
import { Camera, ImagePlus, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CameraCapture, type CapturedPhoto } from "@/components/camera-capture";
import { formatToken, parseVndInput, vndToAmount } from "@/lib/client/money";
import type { PhotoDraft } from "@/lib/client/listing-form";
import { cn } from "@/lib/utils";

/** Input cao 48px (shadcn mặc định 32px quá nhỏ cho ngón tay). */
export const inputClass = "h-12 text-base";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-base">
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Ô nhập VND: tự thêm dấu chấm ngăn nghìn, dưới ô hiện quy đổi ra mUSDC (số sẽ ghi lên chuỗi). */
export function MoneyInput({
  value,
  onChange,
  vndPerToken,
  placeholder,
  id,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  vndPerToken: number;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
}) {
  const n = parseVndInput(value);
  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={invalid}
          className={cn(inputClass, "pr-10 tabular-nums")}
          value={n === null ? value.replace(/[^\d]/g, "") : new Intl.NumberFormat("vi-VN").format(n)}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-muted-foreground">
          ₫
        </span>
      </div>
      {n !== null && n > 0n && (
        <p className="text-xs text-muted-foreground tabular-nums">≈ {formatToken(vndToAmount(n, vndPerToken))} trên chuỗi</p>
      )}
    </div>
  );
}

/**
 * Ô ảnh: chưa có thì hiện nút chụp; có rồi thì hiện ảnh + chạm để chụp lại.
 * Chụp trong hộp thoại bằng CameraCapture (AGENTS.md: chỉ camera, không chọn từ thư viện).
 */
export function PhotoSlot({
  photo,
  onChange,
  label,
  className,
  invalid,
}: {
  photo: PhotoDraft | null;
  onChange: (p: PhotoDraft) => void;
  label: string;
  className?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  function handle(c: CapturedPhoto) {
    if (photo) URL.revokeObjectURL(photo.previewUrl); // ảnh cũ bị thay: giải phóng bộ nhớ
    onChange({ blob: c.blob, capturedAt: c.capturedAt, previewUrl: URL.createObjectURL(c.blob) });
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={photo ? `Chụp lại: ${label}` : `Chụp ảnh: ${label}`}
        className={cn(
          "group relative grid place-items-center overflow-hidden rounded-xl bg-secondary text-primary ring-1 ring-foreground/10 transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          invalid && "ring-2 ring-destructive",
          className,
        )}
      >
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt={label} className="size-full object-cover" />
            <span className="absolute right-1.5 bottom-1.5 grid size-8 place-items-center rounded-full bg-black/60 text-white">
              <RefreshCw className="size-4" />
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-xs font-medium">
            <ImagePlus className="size-6" />
            Chụp ảnh
          </span>
        )}
      </button>

      {/* Chỉ mount camera khi mở hộp thoại, đóng là tắt camera. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-labelledby={titleId} className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle id={titleId} className="flex items-center gap-2">
              <Camera className="size-4" /> {label}
            </DialogTitle>
            <DialogDescription>Chụp ngay trong app. Không chọn ảnh từ thư viện.</DialogDescription>
          </DialogHeader>
          {open && <CameraCapture onCapture={handle} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
