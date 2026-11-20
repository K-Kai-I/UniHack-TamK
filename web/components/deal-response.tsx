"use client";
// Phần hành động ở cuối màn Báo cáo AI (docs/user-flow.md GĐ6):
//  - ProposePanel  (chủ trọ, CHECKED_OUT): proposeDeduction(id, amount, seal.aiAmount, seal.reportHash, seal.signature).
//    Mức trừ điền sẵn bằng aiAmount. AI lỗi (nhánh H) thì gửi chữ ký rỗng: contract bỏ qua con dấu.
//  - RespondPanel  (người thuê, PROPOSED): acceptProposal(id) hoặc disputeProposal(id, counterAmount).
// Mọi số tiền là bigint (AGENTS.md luật 8). Người dùng nhập VND chỉ để dễ đọc; số gửi lên chuỗi đổi bằng
// vndToAmount (làm tròn xuống). Khi chủ trọ không sửa ô, gửi ĐÚNG seal.aiAmount, không đi qua VND.
//
// Tách hai lớp: ProposePanel/RespondPanel giữ hook ví + giao dịch (đúng chữ ký cũ), còn ProposeView/RespondView/
// DisputeView chỉ trình bày và giữ nội dung đang nhập, để /dev/response xem thử bằng dữ liệu giả.
// Số "nhận lại" luôn là DỰ KIẾN: tiền chỉ chuyển khi giao dịch ký xong (không nói như đã nhận).
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Gavel,
  Info,
  Loader2,
  Scale,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { zeroHash } from "viem";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ActionArea } from "@/components/action-area";
import { InfoBox, NoteQuote, Row, Rows } from "@/components/deal-bits";
import { Field, MoneyInput } from "@/components/listing-fields";
import { SuccessScreen } from "@/components/success-screen";
import { TxStatus } from "@/components/tx-status";
import { usePrivy } from "@privy-io/react-auth";
import { ApiClientError } from "@/lib/client/api";
import { saveNote } from "@/lib/client/notes-api";
import { addresses, escrowAbi } from "@/lib/chain";
import type { DamageAiResponse } from "@/lib/client/ai-report-api";
import { deductionAiSide } from "@/lib/client/deal-actions";
import type { DealView } from "@/lib/client/deals-data";
import {
  amountToVnd,
  formatToken,
  formatVnd,
  parseVndInput,
  vndToAmount,
} from "@/lib/client/money";
import { useCountdown } from "@/lib/client/use-countdown";
import { useTx, type TxState } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Amount } from "@/lib/types";

const isBusy = (s: TxState) => s.phase === "signing" || s.phase === "pending";

/** Ghi chú "dự kiến" dưới số tiền nhận lại: tiền chưa chuyển cho tới khi giao dịch xong. */
const ESTIMATE_NOTE = "Dự kiến. Tiền chỉ về ví khi giao dịch xong.";

function Block({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Nhắc rằng nội dung đang nhập không mất khi giao dịch lỗi. */
function KeptNote({ tx, children }: { tx: TxState; children: ReactNode }) {
  if (tx.phase !== "error") return null;
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// ------------------------------------------------------------------ chủ trọ đề xuất

export function ProposePanel({
  deal,
  ai,
  aiLoading,
  back,
}: {
  deal: DealView;
  ai: DamageAiResponse | undefined;
  /** true khi GET /ai/damage đang tải lần đầu. Tải lỗi thì false và ai = undefined: coi như không có con dấu. */
  aiLoading: boolean;
  back: string;
}) {
  const rate = useVndRate();
  const tx = useTx();
  const qc = useQueryClient();
  const router = useRouter();
  const { passed } = useCountdown(deal.onchain.deadline);

  const seal = ai?.status === "done" ? ai.seal : null;
  // Chỉ chờ khi AI còn đang chạy. Không lấy được kết quả AI (API lỗi) thì vẫn cho đề xuất không con dấu (nhánh H),
  // nếu không chủ trọ kẹt tới hạn và bị poke hoàn đủ cọc.
  const waitingAi = aiLoading || ai?.status === "processing";

  const { getAccessToken } = usePrivy();
  const [noteError, setNoteError] = useState("");

  async function submit(amount: bigint, reason: string) {
    // Lý do lưu trước khi ký (sau khi đề xuất lên chuỗi thì khóa). Lưu lỗi thì dừng, không ký.
    setNoteError("");
    if (reason.trim()) {
      try {
        await saveNote(deal.dealId, "proposal", reason.trim(), await getAccessToken());
      } catch (e) {
        setNoteError(e instanceof ApiClientError ? e.message : "Chưa lưu được lý do. Kiểm tra mạng rồi thử lại.");
        return;
      }
    }
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "proposeDeduction",
      // Không có con dấu: aiAmount 0, reportHash 0, chữ ký rỗng "0x" → contract không kiểm tra con dấu.
      args: seal
        ? [
            BigInt(deal.dealId),
            amount,
            BigInt(seal.aiAmount),
            seal.reportHash,
            seal.signature,
          ]
        : [BigInt(deal.dealId), amount, 0n, zeroHash, "0x"],
    });
    if (!receipt) return;
    await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
    // Mức trừ 0: contract chia tiền ngay trong cùng giao dịch → sang thẳng biên nhận.
    if (amount === 0n)
      router.push(back.replace(/(\/deals\/\d+)/, "$1/receipt"));
  }

  return (
    <ProposeView
      deal={deal}
      rate={rate}
      aiAmount={seal ? BigInt(seal.aiAmount) : null}
      waitingAi={waitingAi}
      passed={passed}
      tx={tx.state}
      back={back}
      onSubmit={submit}
      noteError={noteError}
    />
  );
}

export function ProposeView({
  deal,
  rate,
  aiAmount,
  waitingAi,
  passed,
  tx,
  back,
  onSubmit,
  noteError = "",
}: {
  deal: DealView;
  rate: number;
  /** Số AI đã ký; null = không có con dấu. */
  aiAmount: bigint | null;
  waitingAi: boolean;
  passed: boolean;
  tx: TxState;
  back: string;
  onSubmit: (amount: bigint, reason: string) => void;
  noteError?: string;
}) {
  const vnd = (a: Amount | bigint) => formatVnd(amountToVnd(a, rate));
  const C = BigInt(deal.onchain.deposit);
  // Lý do cho người thuê và bồi thẩm đọc (nhất là khi khác số AI). Không bắt buộc.
  const [reason, setReason] = useState("");

  // touched = false: ô hiện aiAmount quy ra VND và số gửi lên chuỗi là đúng aiAmount. Không cần dựng lại form
  // khi AI xong: số điền sẵn tự theo aiAmount, còn chữ đã gõ thì giữ nguyên.
  const [touched, setTouched] = useState(false);
  const [text, setText] = useState("");
  const shownText = touched
    ? text
    : aiAmount !== null
      ? amountToVnd(aiAmount, rate).toString()
      : "";
  const typed = parseVndInput(shownText);
  const amount: bigint | null =
    !touched && aiAmount !== null
      ? aiAmount
      : typed === null
        ? null
        : BigInt(vndToAmount(typed, rate));

  const tooBig = amount !== null && amount > C;
  const busy = isBusy(tx);
  const done = tx.phase === "success";
  const diff =
    aiAmount !== null && amount !== null && amount !== aiAmount
      ? amount - aiAmount
      : null;

  function pick(next: bigint) {
    setTouched(true);
    setText(amountToVnd(next, rate).toString());
  }

  return (
    <>
      <Block id="propose" title="Đề xuất của bạn">
        {done ? (
          <InfoBox
            icon={<CircleCheck className="size-5" />}
            tone="success"
            title={`Đã gửi đề xuất trừ ${vnd(amount ?? 0n)}`}
          >
            Người thuê đồng ý hoặc kháng nghị trước hạn. Im lặng tới hạn thì
            chia theo con số của bạn.
          </InfoBox>
        ) : (
          <fieldset
            disabled={busy}
            className="m-0 min-w-0 space-y-4 border-0 p-0"
          >
            {aiAmount !== null ? (
              <Rows>
                <Row
                  label="AI tính (có con dấu)"
                  value={vnd(aiAmount)}
                  sub="Điền sẵn vào ô bên dưới"
                />
              </Rows>
            ) : (
              !waitingAi && (
                <InfoBox
                  icon={<Info className="size-5" />}
                  title="Không có con dấu AI"
                >
                  Đề xuất vẫn hợp lệ, nhưng nếu người thuê kháng nghị thì không
                  có phiếu AI.
                </InfoBox>
              )
            )}

            <Field
              label="Mức trừ bạn đề xuất (VND)"
              htmlFor="propose-amount"
              hint={
                aiAmount !== null
                  ? "Sửa được nếu bạn thấy khác AI. Nhập 0 nếu hoàn đủ cọc."
                  : "Nhập 0 nếu hoàn đủ cọc."
              }
              error={
                tooBig ? `Không được trừ quá tiền cọc (${vnd(C)}).` : undefined
              }
            >
              <MoneyInput
                id="propose-amount"
                value={shownText}
                onChange={(v) => {
                  setTouched(true);
                  setText(v);
                }}
                vndPerToken={rate}
                placeholder="0"
                invalid={tooBig}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              {aiAmount !== null && amount !== aiAmount && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => pick(aiAmount)}
                >
                  <Sparkles /> Dùng số AI ({vnd(aiAmount)})
                </Button>
              )}
              {amount !== 0n && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => pick(0n)}
                >
                  Hoàn đủ cọc (trừ 0)
                </Button>
              )}
            </div>

            <ReasonField
              id="propose-reason"
              label="Lý do (người thuê và bồi thẩm sẽ đọc)"
              hint={diff !== null ? "Bạn đang đề xuất khác số AI: nên ghi rõ vì sao." : "Ví dụ: vết nứt gạch cạnh giường, ảnh 3 lúc trả phòng."}
              value={reason}
              onChange={setReason}
            />
            {noteError && <p role="alert" className="text-sm font-medium text-destructive">{noteError}</p>}

            {amount !== null && !tooBig && (
              <div className="space-y-2">
                <Rows>
                  <Row label="Tiền cọc" value={vnd(C)} />
                  <Row
                    label="Người thuê dự kiến nhận lại"
                    value={vnd(C - amount)}
                    tone="success"
                    strong
                  />
                  <Row
                    label="Bạn dự kiến nhận"
                    value={vnd(amount)}
                    sub={formatToken(amount)}
                  />
                </Rows>
                <p className="text-sm text-muted-foreground">
                  {ESTIMATE_NOTE}
                  {deal.onchain.yieldGross !== "0" && " Chưa tính phần lãi."}
                </p>
              </div>
            )}

            {diff !== null && !tooBig && aiAmount !== null && (
              <InfoBox
                icon={
                  diff > 0n ? (
                    <ArrowUp className="size-5" />
                  ) : (
                    <ArrowDown className="size-5" />
                  )
                }
                tone="warning"
                title={
                  diff > 0n
                    ? `Cao hơn AI ${vnd(diff)}`
                    : `Thấp hơn AI ${vnd(-diff)}`
                }
              >
                {diff > 0n ? (
                  <>
                    Bạn vẫn đề xuất được. Nếu người thuê kháng nghị, bồi thẩm
                    chọn giữa hai con số, và phiếu AI về bên có con số gần{" "}
                    {vnd(aiAmount)} hơn.
                  </>
                ) : (
                  <>
                    Bạn nhận ít hơn con số AI tính. Nếu người thuê kháng nghị
                    với số nhỏ hơn nữa thì phiếu AI về phía bạn.
                  </>
                )}
              </InfoBox>
            )}

            {amount === 0n && (
              <InfoBox
                icon={<Info className="size-5" />}
                title="Mức trừ 0: chia tiền ngay"
              >
                Người thuê nhận lại đủ cọc trong cùng giao dịch. Không có bước
                chờ trả lời.
              </InfoBox>
            )}
            {amount !== null && amount > 0n && !tooBig && (
              <InfoBox
                icon={<Scale className="size-5" />}
                title="Người thuê sẽ trả lời"
              >
                Người thuê đồng ý hoặc kháng nghị trước hạn. Im lặng tới hạn thì
                chia theo con số của bạn.
              </InfoBox>
            )}
            {aiAmount === null && waitingAi && (
              <p className="text-sm text-muted-foreground">
                AI đang so ảnh. Số điền sẵn sẽ hiện khi AI xong.
              </p>
            )}
          </fieldset>
        )}
      </Block>

      <ActionArea>
        {tx.phase !== "idle" && (
          <TxStatus state={tx} doneText="Đã gửi đề xuất" />
        )}
        <KeptNote tx={tx}>
          Số bạn đã nhập vẫn còn nguyên. Sửa rồi ký lại.
        </KeptNote>
        {done ? (
          <SuccessScreen title="Đã gửi đề xuất" text="Người thuê sẽ đồng ý hoặc kháng nghị trước hạn. Im lặng tới hạn thì chia theo con số của bạn." href={back} />
        ) : (
          <Button
            size="lg"
            className="w-full text-base"
            disabled={busy || passed || waitingAi || amount === null || tooBig}
            onClick={() => amount !== null && onSubmit(amount, reason)}
          >
            {busy && <Loader2 className="animate-spin" />}
            {passed
              ? "Đã quá hạn đề xuất"
              : waitingAi
                ? "Đợi AI so xong…"
                : amount === null
                  ? "Nhập mức trừ"
                  : tx.phase === "error"
                    ? "Thử lại"
                    : amount === 0n
                      ? "Ký: hoàn đủ cọc"
                      : `Ký đề xuất trừ ${vnd(amount)}`}
          </Button>
        )}
      </ActionArea>
    </>
  );
}

// ------------------------------------------------------------------ người thuê trả lời

export function RespondPanel({ deal, back }: { deal: DealView; back: string }) {
  const rate = useVndRate();
  const acceptTx = useTx();
  const disputeTx = useTx();
  const qc = useQueryClient();
  const router = useRouter();
  const { passed } = useCountdown(deal.onchain.deadline);
  const { getAccessToken } = usePrivy();

  async function accept() {
    const receipt = await acceptTx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "acceptProposal",
      args: [BigInt(deal.dealId)],
    });
    if (!receipt) return;
    await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
    router.push(back.replace(/(\/deals\/\d+)/, "$1/receipt"));
  }

  async function dispute(counter: bigint, reason: string) {
    if (reason.trim()) {
      // Lỗi lưu lý do ném ra để màn kháng nghị hiện; chưa ký giao dịch.
      await saveNote(deal.dealId, "dispute", reason.trim(), await getAccessToken());
    }
    const receipt = await disputeTx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "disputeProposal",
      args: [BigInt(deal.dealId), counter],
    });
    if (receipt)
      await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
  }

  return (
    <RespondView
      deal={deal}
      rate={rate}
      passed={passed}
      acceptTx={acceptTx.state}
      onAccept={accept}
      disputeTx={disputeTx.state}
      onDispute={dispute}
      onDisputeReset={disputeTx.reset}
      back={back}
    />
  );
}

export function RespondView({
  deal,
  rate,
  passed,
  acceptTx,
  onAccept,
  disputeTx,
  onDispute,
  onDisputeReset,
  back,
}: {
  deal: DealView;
  rate: number;
  passed: boolean;
  acceptTx: TxState;
  onAccept: () => void;
  disputeTx: TxState;
  onDispute: (counter: bigint, reason: string) => Promise<void> | void;
  onDisputeReset: () => void;
  back: string;
}) {
  const vnd = (a: Amount | bigint) => formatVnd(amountToVnd(a, rate));
  const [disputeOpen, setDisputeOpen] = useState(false);

  const { onchain } = deal;
  const C = BigInt(onchain.deposit);
  const D = BigInt(onchain.proposedAmount);
  const AI = BigInt(onchain.aiAmount);
  const busy = isBusy(acceptTx) || isBusy(disputeTx);
  const disputed = disputeTx.phase === "success";

  return (
    <>
      <Block id="respond" title="Chủ trọ đề xuất">
        <Rows>
          <Row label="Tiền cọc" value={vnd(C)} />
          <Row
            label="Mức trừ chủ trọ đề xuất"
            value={vnd(D)}
            strong
            tone="destructive"
          />
          {onchain.hasAiSeal && (
            <Row label="AI tính (có con dấu)" value={vnd(AI)} />
          )}
          <Row
            label="Bạn dự kiến nhận lại nếu đồng ý"
            value={vnd(C - D)}
            tone="success"
            strong
            sub={onchain.yieldGross !== "0" ? "Chưa tính phần lãi" : undefined}
          />
        </Rows>
        <NoteQuote who="chủ trọ" text={deal.notes?.proposal?.text} />
        <p className="text-sm text-muted-foreground">{ESTIMATE_NOTE}</p>

        {onchain.hasAiSeal && D > AI && (
          <InfoBox
            icon={<TriangleAlert className="size-5" />}
            tone="warning"
            title={`Cao hơn AI ${vnd(D - AI)}`}
          >
            Chủ trọ đề xuất trừ nhiều hơn con số AI đã ký. Bạn có thể kháng
            nghị; phiếu AI về bên có con số gần {vnd(AI)} hơn.
          </InfoBox>
        )}
        {onchain.hasAiSeal && D < AI && (
          <InfoBox
            icon={<Scale className="size-5" />}
            title={`Thấp hơn AI ${vnd(AI - D)}`}
          >
            Chủ trọ đề xuất trừ ít hơn con số AI. Nếu bạn kháng nghị với số nhỏ
            hơn, phiếu AI về phía chủ trọ.
          </InfoBox>
        )}
        {onchain.hasAiSeal && D === AI && (
          <InfoBox
            icon={<Scale className="size-5" />}
            title="Bằng con số AI đã ký"
          >
            Nếu bạn kháng nghị với số nhỏ hơn, phiếu AI về phía chủ trọ.
          </InfoBox>
        )}
        {!onchain.hasAiSeal && (
          <InfoBox
            icon={<Info className="size-5" />}
            title="Đề xuất này không có con dấu AI"
          >
            Nếu kháng nghị, bồi thẩm vẫn xử được nhưng không có phiếu AI.
          </InfoBox>
        )}

        <div className="space-y-2">
          <h3 className="font-semibold text-primary">Bạn có hai lựa chọn</h3>
          <ul className="space-y-2 text-sm">
            <li className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="font-semibold">Đồng ý</p>
              <p className="text-muted-foreground">
                Chia tiền ngay trong một giao dịch: bạn dự kiến nhận{" "}
                {vnd(C - D)}.
              </p>
            </li>
            <li className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="font-semibold">Kháng nghị</p>
              <p className="text-muted-foreground">
                {passed
                  ? "Đã quá hạn kháng nghị."
                  : `Nhập con số bạn chấp nhận, nhỏ hơn ${vnd(D)}. Bồi thẩm chọn một trong hai con số.`}
              </p>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Im lặng tới hạn thì coi như đồng ý: chia theo mức trừ {vnd(D)}.
          </p>
        </div>
      </Block>

      <ActionArea>
        {acceptTx.phase !== "idle" && (
          <TxStatus state={acceptTx} doneText="Đã đồng ý, tiền đã chia" />
        )}
        {disputed && (
          <TxStatus state={disputeTx} doneText="Đã gửi kháng nghị" />
        )}
        <Button
          size="lg"
          className="w-full text-base"
          disabled={busy || disputed}
          onClick={onAccept}
        >
          {isBusy(acceptTx) && <Loader2 className="animate-spin" />}
          {acceptTx.phase === "error"
            ? "Thử lại"
            : `Đồng ý, nhận lại ${vnd(C - D)}`}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full text-base"
          disabled={busy || passed || disputed}
          onClick={() => setDisputeOpen(true)}
        >
          <Gavel />{" "}
          {passed
            ? "Đã quá hạn kháng nghị"
            : disputed
              ? "Đã kháng nghị"
              : "Kháng nghị"}
        </Button>
        {disputed && (
          <SuccessScreen title="Đã gửi kháng nghị" text="Bồi thẩm sẽ xem ảnh và kết quả AI rồi bỏ phiếu. Tiền cọc vẫn nằm trong két tới khi có kết quả." href={back} />
        )}
      </ActionArea>

      <DisputeDrawer
        deal={deal}
        rate={rate}
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        tx={disputeTx}
        onSubmit={onDispute}
        onReset={onDisputeReset}
        back={back}
      />
    </>
  );
}

/** Người thuê nhập con số mình chấp nhận (nhỏ hơn đề xuất) rồi ký disputeProposal. */
function DisputeDrawer({
  deal,
  rate,
  open,
  onClose,
  tx,
  onSubmit,
  onReset,
  back,
}: {
  deal: DealView;
  rate: number;
  open: boolean;
  onClose: () => void;
  tx: TxState;
  onSubmit: (counter: bigint, reason: string) => Promise<void> | void;
  onReset: () => void;
  back: string;
}) {
  const vnd = (a: Amount | bigint) => formatVnd(amountToVnd(a, rate));
  // Giữ chữ đã gõ khi đóng/mở lại hoặc khi giao dịch lỗi: state nằm ở đây, không nằm trong DrawerContent.
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [noteError, setNoteError] = useState("");
  async function send(c: bigint) {
    setNoteError("");
    try {
      await onSubmit(c, reason);
    } catch (e) {
      setNoteError(e instanceof ApiClientError ? e.message : "Chưa lưu được lý do. Kiểm tra mạng rồi thử lại.");
    }
  }

  const { onchain } = deal;
  const C = BigInt(onchain.deposit);
  const D = BigInt(onchain.proposedAmount);
  const AI = BigInt(onchain.aiAmount);
  const typed = parseVndInput(text);
  const counter = typed === null ? null : BigInt(vndToAmount(typed, rate));
  const tooBig = counter !== null && counter >= D; // contract: counterAmount < proposedAmount
  const busy = isBusy(tx);
  const done = tx.phase === "success";

  // Cùng quy tắc với bảng điểm bồi thẩm (deductionAiSide), để hai màn không lệch nhau.
  const aiSide =
    onchain.hasAiSeal && counter !== null && !tooBig
      ? deductionAiSide(D, counter, AI)
      : null;
  const canUseAi = onchain.hasAiSeal && AI < D;

  function change(next: boolean) {
    if (next || busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onClose();
    if (!done) onReset();
  }

  function pick(next: bigint) {
    setText(amountToVnd(next, rate).toString());
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent>
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5">
          {/* Nội dung cuộn; nút ký + kết quả giao dịch ghim ở đáy để lỗi và nút Thử lại luôn thấy. */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <DrawerHeader className="px-0 text-left">
              <DrawerTitle className="text-xl font-extrabold text-primary">
                Kháng nghị
              </DrawerTitle>
              <DrawerDescription>
                Chủ trọ đề xuất trừ {vnd(D)}. Nhập mức trừ bạn chấp nhận, nhỏ
                hơn số đó. Bồi thẩm chọn một trong hai con số; bên nào đủ 2
                phiếu thì thắng.
              </DrawerDescription>
            </DrawerHeader>

            {!done && (
              <fieldset
                disabled={busy}
                className="m-0 min-w-0 space-y-4 border-0 p-0"
              >
                <Field
                  label="Mức trừ bạn chấp nhận (VND)"
                  htmlFor="counter-amount"
                  hint="Nhập 0 nếu bạn cho rằng không có hư hỏng."
                  error={
                    tooBig
                      ? `Phải nhỏ hơn mức chủ trọ đề xuất (${vnd(D)}).`
                      : undefined
                  }
                >
                  <MoneyInput
                    id="counter-amount"
                    value={text}
                    onChange={setText}
                    vndPerToken={rate}
                    placeholder="0"
                    invalid={tooBig}
                  />
                </Field>

                <div className="flex flex-wrap gap-2">
                  {canUseAi && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => pick(AI)}
                    >
                      <Sparkles /> Dùng số AI ({vnd(AI)})
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => pick(0n)}
                  >
                    Không có hư hỏng (0)
                  </Button>
                </div>

                {counter !== null && !tooBig && (
                  <Rows>
                    <Row
                      label="Nếu số của bạn thắng, dự kiến nhận"
                      value={vnd(C - counter)}
                      tone="success"
                    />
                    <Row
                      label="Nếu chủ trọ thắng, dự kiến nhận"
                      value={vnd(C - D)}
                    />
                  </Rows>
                )}

                {aiSide && (
                  <p className="rounded-xl bg-secondary/60 p-3 text-sm">
                    Phiếu AI sẽ về{" "}
                    <strong
                      className={
                        aiSide === "tenant"
                          ? "text-success"
                          : "text-destructive"
                      }
                    >
                      {aiSide === "tenant" ? "phía bạn" : "phía chủ trọ"}
                    </strong>
                    , vì con số{" "}
                    {aiSide === "tenant" ? "của bạn" : "của chủ trọ"} gần{" "}
                    {vnd(AI)} hơn.
                  </p>
                )}
                {!onchain.hasAiSeal && (
                  <p className="text-sm text-muted-foreground">
                    Đề xuất này không có con dấu AI. Hết hạn mà chưa bên nào đủ
                    phiếu thì lấy trung bình hai con số.
                  </p>
                )}
                <ReasonField
                  id="dispute-reason"
                  label="Lý do kháng nghị (chủ trọ và bồi thẩm sẽ đọc)"
                  hint="Ví dụ: vết bẩn có từ lúc nhận phòng, xem ảnh nhận phòng vị trí 2."
                  value={reason}
                  onChange={setReason}
                />
                {noteError && <p role="alert" className="text-sm font-medium text-destructive">{noteError}</p>}
                <p className="text-sm text-muted-foreground">{ESTIMATE_NOTE}</p>
              </fieldset>
            )}
          </div>

          <div className="space-y-2 border-t bg-popover pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {tx.phase !== "idle" && (
              <TxStatus state={tx} doneText="Đã gửi kháng nghị" />
            )}
            <KeptNote tx={tx}>
              Số bạn đã nhập vẫn còn nguyên. Sửa rồi ký lại.
            </KeptNote>

            {done ? (
              <Button asChild size="lg" className="w-full text-base">
                <Link href={back}>Về hợp đồng</Link>
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full text-base"
                disabled={busy || counter === null || tooBig}
                onClick={() => counter !== null && void send(counter)}
              >
                {busy && <Loader2 className="animate-spin" />}
                {tx.phase === "error" ? "Thử lại" : "Ký gửi kháng nghị"}
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Ô lý do (tối đa 500 ký tự), dùng cho đề xuất mức trừ và kháng nghị. */
function ReasonField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <textarea
        id={id}
        value={value}
        maxLength={500}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint} Không bắt buộc. {value.length}/500</p>
    </div>
  );
}
