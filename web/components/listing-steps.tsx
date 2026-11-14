"use client";
// 6 bước của form Đăng phòng. Mỗi bước nhận `draft`, `set` (vá một phần) và `errors` từ listing-wizard.
import { useState } from "react";
import { Info, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputClass, MoneyInput, PhotoSlot } from "@/components/listing-fields";
import { RoomCover } from "@/components/room-cover";
import { addresses } from "@/lib/chain";
import { formatDate, monthsBetween } from "@/lib/client/date";
import {
  dateToIso,
  MAX_LISTING_PHOTOS,
  MAX_POSITIONS,
  MAX_PRICE_ITEMS,
  MIN_POSITIONS,
  newKey,
  todayInput,
  type Errors,
  type ListingDraft,
} from "@/lib/client/listing-form";
import { formatToken, formatVnd, parseVndInput, vndToAmount } from "@/lib/client/money";

export interface StepProps {
  draft: ListingDraft;
  set: (patch: Partial<ListingDraft>) => void;
  errors: Errors;
  vndPerToken: number;
}

const SUGGESTED_AMENITIES = ["Máy lạnh", "Tủ lạnh", "Máy giặt", "Gác lửng", "Ban công", "Bếp", "Gửi xe miễn phí", "Wifi"];

// ---------------------------------------------------------------------------------------------- 1. Thông tin

export function InfoStep({ draft, set, errors }: StepProps) {
  const [custom, setCustom] = useState("");
  const toggle = (a: string) =>
    set({ amenities: draft.amenities.includes(a) ? draft.amenities.filter((x) => x !== a) : [...draft.amenities, a] });
  const addCustom = () => {
    const v = custom.trim();
    if (v && !draft.amenities.includes(v)) set({ amenities: [...draft.amenities, v] });
    setCustom("");
  };
  const extra = draft.amenities.filter((a) => !SUGGESTED_AMENITIES.includes(a));

  return (
    <div className="space-y-6">
      <Field label="Tiêu đề" htmlFor="title" error={errors.title}>
        <Input
          id="title"
          className={inputClass}
          value={draft.title}
          maxLength={120}
          placeholder="Phòng 20m2 gần ĐH Bách Khoa"
          aria-invalid={!!errors.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label="Địa chỉ" htmlFor="address" error={errors.address}>
        <Input
          id="address"
          className={inputClass}
          value={draft.address}
          maxLength={200}
          placeholder="268 Lý Thường Kiệt, Quận 10, TP.HCM"
          aria-invalid={!!errors.address}
          autoComplete="street-address"
          onChange={(e) => set({ address: e.target.value })}
        />
      </Field>
      <Field label="Giá thuê mỗi tháng" htmlFor="rent" error={errors.rentVnd} hint="Chỉ để hiển thị, không đi qua smart contract.">
        <Input
          id="rent"
          className={inputClass + " tabular-nums"}
          inputMode="numeric"
          placeholder="3.000.000"
          aria-invalid={!!errors.rentVnd}
          value={
            parseVndInput(draft.rentVnd) === null
              ? draft.rentVnd
              : new Intl.NumberFormat("vi-VN").format(parseVndInput(draft.rentVnd)!)
          }
          onChange={(e) => set({ rentVnd: e.target.value.replace(/[^\d]/g, "") })}
        />
      </Field>

      <Field label="Tiện nghi đi kèm" hint="Chạm để chọn. Có thể bỏ trống.">
        <ul className="flex flex-wrap gap-2">
          {[...SUGGESTED_AMENITIES, ...extra].map((a) => {
            const on = draft.amenities.includes(a);
            return (
              <li key={a}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(a)}
                  className={
                    "h-10 rounded-full border px-4 text-sm font-medium transition " +
                    (on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary")
                  }
                >
                  {a}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2 pt-1">
          <Input
            className={inputClass}
            value={custom}
            placeholder="Thêm tiện nghi khác"
            maxLength={40}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button type="button" variant="secondary" className="h-12" onClick={addCustom} aria-label="Thêm tiện nghi">
            <Plus />
          </Button>
        </div>
      </Field>

      <Field
        label={`Ảnh phòng (${draft.photos.length}/${MAX_LISTING_PHOTOS})`}
        hint="Chụp trực tiếp bằng camera trong app. Người thuê sẽ thấy các ảnh này, và AI dùng chúng để so khi có tranh chấp “phòng sai mô tả”."
        error={errors.photos}
      >
        <ul className="grid grid-cols-3 gap-2">
          {draft.photos.map((p, i) => (
            <li key={p.previewUrl} className="relative aspect-square">
              <PhotoSlot
                photo={p}
                label={`Ảnh phòng ${i + 1}`}
                className="size-full"
                onChange={(np) => set({ photos: draft.photos.map((x, j) => (j === i ? np : x)) })}
              />
              <button
                type="button"
                aria-label={`Xóa ảnh phòng ${i + 1}`}
                className="absolute top-1 left-1 grid size-8 place-items-center rounded-full bg-black/60 text-white"
                onClick={() => {
                  URL.revokeObjectURL(p.previewUrl);
                  set({ photos: draft.photos.filter((_, j) => j !== i) });
                }}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
          {draft.photos.length < MAX_LISTING_PHOTOS && (
            <li className="aspect-square">
              <PhotoSlot
                photo={null}
                label="Ảnh phòng mới"
                className="size-full border-2 border-dashed border-primary/30"
                invalid={!!errors.photos}
                onChange={(np) => set({ photos: [...draft.photos, np] })}
              />
            </li>
          )}
        </ul>
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- 2. Tiền

export function MoneyStep({ draft, set, errors, vndPerToken }: StepProps) {
  const vaultReady = addresses.vault !== null;
  return (
    <div className="space-y-6">
      <Field
        label="Tiền cọc"
        htmlFor="deposit"
        error={errors.depositVnd}
        hint="Người thuê gửi vào smart contract. Không ai tự rút được, kể cả bạn."
      >
        <MoneyInput
          id="deposit"
          value={draft.depositVnd}
          vndPerToken={vndPerToken}
          placeholder="6.000.000"
          invalid={!!errors.depositVnd}
          onChange={(v) => set({ depositVnd: v })}
        />
      </Field>
      <Field
        label="Phí giữ chỗ"
        htmlFor="reserve"
        error={errors.reserveVnd}
        hint="Nếu người thuê cọc rồi không đến nhận phòng đúng hạn, phần này thuộc về bạn. Không lớn hơn tiền cọc."
      >
        <MoneyInput
          id="reserve"
          value={draft.reserveVnd}
          vndPerToken={vndPerToken}
          placeholder="500.000"
          invalid={!!errors.reserveVnd}
          onChange={(v) => set({ reserveVnd: v })}
        />
      </Field>

      <label
        className={
          "flex items-start gap-3 rounded-2xl p-4 ring-1 ring-foreground/10 " + (vaultReady ? "bg-card" : "bg-muted opacity-70")
        }
      >
        <input
          type="checkbox"
          className="mt-1 size-5 accent-[var(--primary)]"
          checked={draft.yieldEnabled && vaultReady}
          disabled={!vaultReady}
          onChange={(e) => set({ yieldEnabled: e.target.checked })}
        />
        <span className="space-y-0.5">
          <span className="block font-semibold">Cho phép cọc sinh lãi</span>
          <span className="block text-sm text-muted-foreground">
            {vaultReady
              ? "Người thuê được chọn gửi cọc vào kho sinh lãi trong lúc thuê."
              : "Chưa mở: kho sinh lãi (vault) chưa được triển khai."}
          </span>
        </span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- 3. Ngày

export function DatesStep({ draft, set, errors }: StepProps) {
  const months =
    draft.moveIn && draft.leaseEnd && draft.leaseEnd > draft.moveIn
      ? monthsBetween(dateToIso(draft.moveIn), dateToIso(draft.leaseEnd))
      : null;
  return (
    <div className="space-y-6">
      <Field
        label="Ngày dọn vào"
        htmlFor="movein"
        error={errors.moveIn}
        hint="Người thuê phải gửi ảnh nhận phòng trong thời gian ân hạn sau ngày này, nếu không sẽ mất phí giữ chỗ."
      >
        <Input
          id="movein"
          type="date"
          className={inputClass}
          min={todayInput()}
          value={draft.moveIn}
          aria-invalid={!!errors.moveIn}
          onChange={(e) => set({ moveIn: e.target.value })}
        />
      </Field>
      <Field label="Ngày hết hạn thuê" htmlFor="leaseend" error={errors.leaseEnd}>
        <Input
          id="leaseend"
          type="date"
          className={inputClass}
          min={draft.moveIn || todayInput()}
          value={draft.leaseEnd}
          aria-invalid={!!errors.leaseEnd}
          onChange={(e) => set({ leaseEnd: e.target.value })}
        />
      </Field>
      {months && <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-primary">Thời hạn khoảng {months} tháng.</p>}
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        Hai ngày này được ghi lên chuỗi khi đăng và không sửa được sau khi có người cọc.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- 4. Vị trí

export function PositionsStep({ draft, set, errors }: StepProps) {
  const patch = (key: string, p: Partial<ListingDraft["positions"][number]>) =>
    set({ positions: draft.positions.map((x) => (x.key === key ? { ...x, ...p } : x)) });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Chọn {MIN_POSITIONS}–{MAX_POSITIONS} chỗ trong phòng mà người thuê sẽ chụp khi nhận và khi trả phòng. Mỗi chỗ kèm
        một ảnh ví dụ để họ đứng đúng góc.
      </p>
      {errors.positions && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {errors.positions}
        </p>
      )}
      <ul className="space-y-4">
        {draft.positions.map((p, i) => {
          const err = errors[`positions.${p.key}`];
          return (
            <li key={p.key} className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start gap-3">
                <PhotoSlot
                  photo={p.photo}
                  label={`Ảnh ví dụ: ${p.name || `vị trí ${i + 1}`}`}
                  className="size-24 shrink-0"
                  invalid={!!err && !p.photo}
                  onChange={(np) => patch(p.key, { photo: np })}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    className={inputClass}
                    aria-label={`Tên vị trí ${i + 1}`}
                    placeholder="Tên vị trí"
                    maxLength={60}
                    value={p.name}
                    onChange={(e) => patch(p.key, { name: e.target.value })}
                  />
                  <Input
                    className={inputClass}
                    aria-label={`Cách chụp vị trí ${i + 1}`}
                    placeholder="Đứng ở cửa, chụp ngang"
                    maxLength={120}
                    value={p.instruction}
                    onChange={(e) => patch(p.key, { instruction: e.target.value })}
                  />
                </div>
              </div>
              {err && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {err}
                </p>
              )}
              {draft.positions.length > MIN_POSITIONS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => set({ positions: draft.positions.filter((x) => x.key !== p.key) })}
                >
                  <Trash2 /> Xóa vị trí
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {draft.positions.length < MAX_POSITIONS && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full"
          onClick={() => set({ positions: [...draft.positions, { key: newKey(), name: "", instruction: "", photo: null }] })}
        >
          <Plus /> Thêm vị trí
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- 5. Bảng giá

export function PricesStep({ draft, set, errors, vndPerToken }: StepProps) {
  const patch = (key: string, p: Partial<ListingDraft["prices"][number]>) =>
    set({ prices: draft.prices.map((x) => (x.key === key ? { ...x, ...p } : x)) });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Khi trả phòng, AI chỉ chọn hạng mục trong bảng này và số lượng; số tiền do hệ thống nhân đơn giá. Hư hỏng nằm ngoài
        bảng thì bạn tự định giá khi đề xuất.
      </p>
      {errors.prices && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {errors.prices}
        </p>
      )}
      <ul className="space-y-4">
        {draft.prices.map((it, i) => {
          const err = errors[`prices.${it.key}`];
          return (
            <li key={it.key} className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex gap-2">
                <Input
                  className={inputClass}
                  aria-label={`Hạng mục ${i + 1}`}
                  placeholder="Sơn lại 1 mảng tường"
                  maxLength={80}
                  value={it.item}
                  onChange={(e) => patch(it.key, { item: e.target.value })}
                />
                <Input
                  className={inputClass + " w-24 shrink-0"}
                  aria-label={`Đơn vị hạng mục ${i + 1}`}
                  placeholder="mảng"
                  maxLength={20}
                  value={it.unit}
                  onChange={(e) => patch(it.key, { unit: e.target.value })}
                />
              </div>
              <MoneyInput
                value={it.priceVnd}
                vndPerToken={vndPerToken}
                placeholder="Đơn giá"
                invalid={!!err}
                onChange={(v) => patch(it.key, { priceVnd: v })}
              />
              {err && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {err}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => set({ prices: draft.prices.filter((x) => x.key !== it.key) })}
              >
                <Trash2 /> Xóa dòng
              </Button>
            </li>
          );
        })}
      </ul>
      {draft.prices.length < MAX_PRICE_ITEMS && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full"
          onClick={() => set({ prices: [...draft.prices, { key: newKey(), item: "", unit: "", priceVnd: "" }] })}
        >
          <Plus /> Thêm dòng
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- 6. Xem lại

export function ReviewStep({ draft, vndPerToken, goto }: StepProps & { goto: (id: "info" | "money" | "dates" | "positions" | "prices") => void }) {
  const vnd = (s: string) => parseVndInput(s) ?? 0n;
  const tok = (s: string) => formatToken(vndToAmount(vnd(s), vndPerToken));
  const Section = ({ id, title, children }: { id: Parameters<typeof goto>[0]; title: string; children: React.ReactNode }) => (
    <section className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => goto(id)}>
          Sửa
        </Button>
      </div>
      {children}
    </section>
  );
  return (
    <div className="space-y-4">
      <Section id="info" title="Phòng">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {draft.photos.map((p) => (
            <div key={p.previewUrl} className="aspect-[4/3] h-20 shrink-0 overflow-hidden rounded-lg">
              <RoomCover url={p.previewUrl} alt="Ảnh phòng" />
            </div>
          ))}
        </div>
        <p className="font-semibold">{draft.title}</p>
        <p className="text-sm text-muted-foreground">{draft.address}</p>
        <p className="text-sm">
          Thuê {formatVnd(vnd(draft.rentVnd))}/tháng
          {draft.amenities.length > 0 && <> · {draft.amenities.join(", ")}</>}
        </p>
      </Section>
      <Section id="money" title="Tiền (khóa trên chuỗi)">
        <p className="text-sm">
          Cọc <b>{formatVnd(vnd(draft.depositVnd))}</b> <span className="text-muted-foreground">({tok(draft.depositVnd)})</span>
        </p>
        <p className="text-sm">
          Phí giữ chỗ <b>{formatVnd(vnd(draft.reserveVnd))}</b>{" "}
          <span className="text-muted-foreground">({tok(draft.reserveVnd)})</span>
        </p>
        <p className="text-sm text-muted-foreground">Cọc sinh lãi: {draft.yieldEnabled ? "bật" : "tắt"}</p>
      </Section>
      <Section id="dates" title="Ngày (khóa trên chuỗi)">
        <p className="text-sm">
          {formatDate(dateToIso(draft.moveIn))} → {formatDate(dateToIso(draft.leaseEnd))}
        </p>
      </Section>
      <Section id="positions" title={`${draft.positions.length} vị trí chụp`}>
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {draft.positions.map((p) => (
            <li key={p.key} className="w-20 shrink-0 text-center text-xs">
              <div className="mb-1 aspect-square overflow-hidden rounded-lg">
                <RoomCover url={p.photo?.previewUrl ?? null} alt={`Ảnh ví dụ: ${p.name}`} />
              </div>
              <span className="line-clamp-2">{p.name}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="prices" title="Bảng giá sửa chữa">
        <ul className="divide-y text-sm">
          {draft.prices.map((it) => (
            <li key={it.key} className="flex justify-between gap-3 py-1.5">
              <span>
                {it.item} <span className="text-muted-foreground">/ {it.unit}</span>
              </span>
              <b className="tabular-nums">{formatVnd(vnd(it.priceVnd))}</b>
            </li>
          ))}
        </ul>
      </Section>
      <p className="text-sm text-muted-foreground">
        Bấm “Đăng phòng” sẽ ký 1 giao dịch. Sau khi có người cọc, bạn không sửa được ảnh, giá và điều khoản.
      </p>
    </div>
  );
}
