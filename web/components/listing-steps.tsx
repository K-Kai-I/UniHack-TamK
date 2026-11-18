"use client";
// 6 bước của form Đăng phòng. Mỗi bước nhận `draft`, `set` (vá một phần) và `errors` từ listing-wizard.
import { useState } from "react";
import { Info, Plus, Trash2, X } from "lucide-react";
import { formatUnits } from "viem";
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
import { formatVnd, parseVndInput, vndToAmount } from "@/lib/client/money";

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
      <Field label="Giá thuê mỗi tháng" htmlFor="rent" error={errors.rentVnd} hint="Giá thuê chỉ để tham khảo. App không thu tiền thuê hằng tháng.">
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
                    "min-h-11 rounded-full border px-4 text-sm font-medium transition " +
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
            aria-label="Tiện nghi khác"
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
          <Button type="button" variant="secondary" className="size-12 shrink-0" onClick={addCustom} aria-label="Thêm tiện nghi">
            <Plus />
          </Button>
        </div>
      </Field>

      <Field
        id="photos"
        label={`Ảnh phòng (${draft.photos.length}/${MAX_LISTING_PHOTOS})`}
        hint="Chụp trực tiếp bằng camera trong app. Người thuê sẽ thấy các ảnh này, và AI dùng chúng để so khi có tranh chấp “phòng sai mô tả”."
        error={errors.photos}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {draft.photos.map((p, i) => (
            <li key={p.id} className="relative aspect-square">
              <PhotoSlot
                id={`photo-slot-${i}`}
                photo={p}
                label={`Ảnh phòng ${i + 1}`}
                className="size-full"
                onChange={(np) => set({ photos: draft.photos.map((x, j) => (j === i ? np : x)) })}
              />
              <button
                type="button"
                aria-label={`Xóa ảnh phòng ${i + 1}`}
                className="absolute top-1 left-1 grid size-11 place-items-center rounded-full bg-black/60 text-white"
                onClick={() => {
                  URL.revokeObjectURL(p.previewUrl);
                  set({ photos: draft.photos.filter((_, j) => j !== i) });
                  focusField(i < draft.photos.length - 1 ? `photo-slot-${i}` : "photo-add");
                }}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
          {draft.photos.length < MAX_LISTING_PHOTOS && (
            <li className="aspect-square">
              <PhotoSlot
                id="photo-add"
                photo={null}
                label="Ảnh phòng mới"
                className="size-full border-2 border-dashed border-primary/30"
                invalid={!!errors.photos}
                describedBy="photos-hint photos-error"
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
        hint="Người thuê gửi cọc vào két. Tiền chỉ chia theo điều kiện hợp đồng."
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
        hint="Là một phần trong tiền cọc, không thu thêm. Nếu người thuê không gửi ảnh nhận phòng tới hạn, bạn nhận phần này; phần cọc còn lại trả người thuê. Có thể nhập 0."
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
          "flex items-start gap-3 rounded-2xl p-4 ring-1 ring-foreground/10 " + (vaultReady ? "bg-card" : "bg-muted")
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
              : "Chưa mở tính năng sinh lãi."}
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
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Hai ngày này là một phần của điều khoản khi đăng phòng. Hãy kiểm tra kỹ trước khi ký.
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
        <p data-field-error tabIndex={-1} role="alert" className="text-sm font-medium text-destructive">
          {errors.positions}
        </p>
      )}
      <ul className="space-y-4">
        {draft.positions.map((p, i) => {
          const err = errors[`positions.${p.key}`];
          return (
            <li key={p.key} className="min-w-0 space-y-4 rounded-2xl border border-border p-4">
              <h2 className="font-semibold">Vị trí {i + 1}</h2>
              <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <PhotoSlot
                  photo={p.photo}
                  label={`Ảnh ví dụ: ${p.name || `vị trí ${i + 1}`}`}
                  className="aspect-[4/3] w-full sm:aspect-square"
                  invalid={!!err && !!p.name.trim() && !!p.instruction.trim() && !p.photo}
                  describedBy={err ? `position-${p.key}-error` : undefined}
                  onChange={(np) => patch(p.key, { photo: np })}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Field label="Tên vị trí" htmlFor={`position-${p.key}`}>
                    <Input id={`position-${p.key}`} className={inputClass} placeholder="Tường đầu giường" maxLength={60}
                      value={p.name} aria-invalid={!!err && !p.name.trim()} aria-describedby={err ? `position-${p.key}-error` : undefined}
                      onChange={e => patch(p.key, { name: e.target.value })} />
                  </Field>
                  <Field label="Cách đứng chụp" htmlFor={`instruction-${p.key}`}>
                    <Input id={`instruction-${p.key}`} className={inputClass} placeholder="Đứng ở cửa, chụp ngang" maxLength={120}
                      value={p.instruction} aria-invalid={!!err && !!p.name.trim() && !p.instruction.trim()} aria-describedby={err ? `position-${p.key}-error` : undefined}
                      onChange={e => patch(p.key, { instruction: e.target.value })} />
                  </Field>
                </div>
              </div>
              {err && (
                <p id={`position-${p.key}-error`} role="alert" className="text-sm font-medium text-destructive">{err}</p>
              )}
              {draft.positions.length > MIN_POSITIONS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 text-destructive"
                  aria-label={`Xóa vị trí ${i + 1}: ${p.name || "chưa đặt tên"}`}
                  onClick={() => {
                    set({ positions: draft.positions.filter(x => x.key !== p.key) });
                    focusField(`position-${draft.positions[i + 1]?.key ?? draft.positions[i - 1]?.key}`);
                  }}
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
          onClick={() => {
            const key = newKey();
            set({ positions: [...draft.positions, { key, name: "", instruction: "", photo: null }] });
            focusField(`position-${key}`);
          }}
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
        <p data-field-error tabIndex={-1} role="alert" className="text-sm font-medium text-destructive">
          {errors.prices}
        </p>
      )}
      <ul className="space-y-4">
        {draft.prices.map((it, i) => {
          const err = errors[`prices.${it.key}`];
          return (
            <li key={it.key} className="min-w-0 space-y-4 rounded-2xl border border-border p-4">
              <h2 className="font-semibold">Hạng mục {i + 1}</h2>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Field label="Tên hạng mục" htmlFor={`item-${it.key}`}>
                  <Input id={`item-${it.key}`} className={inputClass} placeholder="Sơn lại 1 mảng tường" maxLength={80}
                    value={it.item} aria-invalid={!!err && !it.item.trim()} aria-describedby={err ? `price-${it.key}-error` : undefined}
                    onChange={e => patch(it.key, { item: e.target.value })} />
                </Field>
                <Field label="Đơn vị" htmlFor={`unit-${it.key}`}>
                  <Input id={`unit-${it.key}`} className={inputClass} placeholder="mảng" maxLength={20}
                    value={it.unit} aria-invalid={!!err && !!it.item.trim() && !it.unit.trim()} aria-describedby={err ? `price-${it.key}-error` : undefined}
                    onChange={e => patch(it.key, { unit: e.target.value })} />
                </Field>
              </div>
              <Field label="Đơn giá" htmlFor={`amount-${it.key}`}>
                <MoneyInput id={`amount-${it.key}`} value={it.priceVnd} vndPerToken={vndPerToken} placeholder="400.000"
                  invalid={!!err && !!it.item.trim() && !!it.unit.trim()}
                  aria-describedby={err ? `price-${it.key}-error` : undefined}
                  onChange={v => patch(it.key, { priceVnd: v })} />
              </Field>
              {err && (
                <p id={`price-${it.key}-error`} role="alert" className="text-sm font-medium text-destructive">{err}</p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-destructive"
                aria-label={`Xóa hạng mục ${i + 1}: ${it.item || "chưa đặt tên"}`}
                onClick={() => {
                  set({ prices: draft.prices.filter(x => x.key !== it.key) });
                  focusField(draft.prices.length === 1 ? "add-price" : `item-${draft.prices[i + 1]?.key ?? draft.prices[i - 1]?.key}`);
                }}
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
          id="add-price"
          onClick={() => {
            const key = newKey();
            set({ prices: [...draft.prices, { key, item: "", unit: "", priceVnd: "" }] });
            focusField(`item-${key}`);
          }}
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
  // Số mUSDC thực sự ghi lên chuỗi (làm tròn xuống, 6 số lẻ), cùng công thức với buildListingBody.
  const token = (s: string) => `${formatUnits(BigInt(vndToAmount(vnd(s), vndPerToken)), 6)} mUSDC`;
  const Section = ({ id, title, children }: { id: Parameters<typeof goto>[0]; title: string; children: React.ReactNode }) => (
    <section className="space-y-3 py-6 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <h2 className="pt-2 font-bold">{title}</h2>
        <Button type="button" variant="ghost" className="min-h-11 shrink-0" aria-label={`Sửa ${title.toLowerCase()}`} onClick={() => goto(id)}>Sửa</Button>
      </div>
      {children}
    </section>
  );
  return <div className="divide-y divide-border [overflow-wrap:anywhere]">
    <Section id="info" title="Thông tin phòng">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {draft.photos.map((p, i) => <li key={p.id}><ReviewPhoto url={p.previewUrl} label={`Ảnh phòng ${i + 1}`} /></li>)}
      </ul>
      <p className="font-semibold">{draft.title}</p>
      <p className="text-sm text-muted-foreground">{draft.address}</p>
      <p className="text-sm">Thuê {formatVnd(vnd(draft.rentVnd))}/tháng</p>
      {draft.amenities.length > 0 && <p className="text-sm text-muted-foreground">{draft.amenities.join(", ")}</p>}
    </Section>
    <Section id="money" title="Tiền cọc và phí giữ chỗ">
      <dl className="space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>Tiền cọc người thuê gửi</dt><dd className="font-bold tabular-nums">{formatVnd(vnd(draft.depositVnd))}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>Phí giữ chỗ (nằm trong cọc)</dt><dd className="font-bold tabular-nums">{formatVnd(vnd(draft.reserveVnd))}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">Nếu người thuê không gửi ảnh nhận phòng tới hạn, bạn nhận phí giữ chỗ; phần cọc còn lại trả người thuê. Phí này không thu thêm.</p>
      <details className="text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-3">Xem quy đổi tiền test sẽ ghi vào hợp đồng</summary>
        <dl className="space-y-2 pb-2 tabular-nums">
          <div className="flex flex-wrap justify-between gap-2"><dt>Tiền cọc</dt><dd>{token(draft.depositVnd)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>Phí giữ chỗ</dt><dd>{token(draft.reserveVnd)}</dd></div>
        </dl>
      </details>
      <p className="text-sm">Cọc sinh lãi: {draft.yieldEnabled ? "bật" : "tắt"}</p>
    </Section>
    <Section id="dates" title="Ngày nhận và hết hạn thuê">
      <dl className="space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>Dọn vào</dt><dd className="font-semibold tabular-nums">{draft.moveIn ? formatDate(dateToIso(draft.moveIn)) : "Chưa chọn"}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>Hết hạn thuê</dt><dd className="font-semibold tabular-nums">{draft.leaseEnd ? formatDate(dateToIso(draft.leaseEnd)) : "Chưa chọn"}</dd></div>
      </dl>
    </Section>
    <Section id="positions" title={`${draft.positions.length} vị trí chụp`}>
      <ul className="grid gap-5 sm:grid-cols-2">
        {draft.positions.map((p, i) => <li key={p.key} className="min-w-0 space-y-2">
          <ReviewPhoto url={p.photo?.previewUrl} label={`Ảnh ví dụ vị trí ${i + 1}: ${p.name}`} />
          <p className="text-sm font-semibold">{i + 1}. {p.name}</p>
          <p className="text-sm text-muted-foreground">{p.instruction}</p>
        </li>)}
      </ul>
    </Section>
    <Section id="prices" title="Bảng giá sửa chữa">
      <ul className="divide-y text-sm">
        {draft.prices.map(it => <li key={it.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
          <span className="min-w-0 flex-1">{it.item} <span className="text-muted-foreground">/ {it.unit}</span></span>
          <b className="tabular-nums">{formatVnd(vnd(it.priceVnd))}</b>
        </li>)}
      </ul>
    </Section>
    <p className="py-6 text-sm text-muted-foreground">Bấm “Đăng phòng” sẽ ký một giao dịch. Sau khi có người cọc, bạn không sửa được ảnh, giá và điều khoản.</p>
  </div>;
}

function ReviewPhoto({ url, label }: { url?: string; label: string }) {
  return url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Xem ảnh đầy đủ: ${label}`} className="block overflow-hidden rounded-xl border border-border bg-muted">
    <div className="relative aspect-[4/3]"><RoomCover url={url} alt={label} fit="contain" className="absolute inset-0" /></div>
    <span className="block px-3 py-3 text-xs text-primary">Xem ảnh đầy đủ</span>
  </a> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Chưa có ảnh ví dụ</p>;
}

function focusField(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
