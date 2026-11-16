"use client";
// Phần hành động ở cuối màn Báo cáo AI (docs/user-flow.md GĐ6):
//  - ProposePanel  (chủ trọ, CHECKED_OUT): proposeDeduction(id, amount, seal.aiAmount, seal.reportHash, seal.signature).
//    Mức trừ điền sẵn bằng aiAmount. AI lỗi (nhánh H) thì gửi chữ ký rỗng: contract bỏ qua con dấu.
//  - RespondPanel  (người thuê, PROPOSED): acceptProposal(id) hoặc disputeProposal(id, counterAmount).
// Mọi số tiền là bigint (AGENTS.md luật 8). Người dùng nhập VND chỉ để dễ đọc; số gửi lên chuỗi đổi bằng
// vndToAmount (làm tròn xuống). Khi chủ trọ không sửa ô, gửi ĐÚNG seal.aiAmount, không đi qua VND.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Gavel, Info, Loader2, Scale } from "lucide-react";
import { zeroHash } from "viem";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { BottomBar, InfoBox, Row, Rows } from "@/components/deal-bits";
import { Field, MoneyInput } from "@/components/listing-fields";
import { TxStatus } from "@/components/tx-status";
import { addresses, escrowAbi } from "@/lib/chain";
import type { DamageAiResponse } from "@/lib/client/ai-report-api";
import { deductionAiSide } from "@/lib/client/deal-actions";
import type { DealView } from "@/lib/client/deals-data";
import { amountToVnd, formatToken, formatVnd, parseVndInput, vndToAmount } from "@/lib/client/money";
import { useCountdown } from "@/lib/client/use-countdown";
import { useTx } from "@/lib/client/use-tx";
import { useVndRate } from "@/lib/client/use-vnd-rate";
import type { Amount } from "@/lib/types";

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
  const vnd = (a: Amount | bigint) => formatVnd(amountToVnd(a, rate));
  const tx = useTx();
  const qc = useQueryClient();
  const router = useRouter();
  const { passed } = useCountdown(deal.onchain.deadline);

  const seal = ai?.status === "done" ? ai.seal : null;
  // Chỉ chờ khi AI còn đang chạy. Không lấy được kết quả AI (API lỗi) thì vẫn cho đề xuất không con dấu (nhánh H),
  // nếu không chủ trọ kẹt tới hạn và bị poke hoàn đủ cọc.
  const waitingAi = aiLoading || ai?.status === "processing";
  const C = BigInt(deal.onchain.deposit);

  // touched = false: ô hiện aiAmount quy ra VND và số gửi lên chuỗi là đúng seal.aiAmount.
  const [touched, setTouched] = useState(false);
  const [text, setText] = useState("");
  const shownText = touched ? text : seal ? amountToVnd(seal.aiAmount, rate).toString() : "";
  const typed = parseVndInput(shownText);
  const amount: bigint | null = !touched && seal ? BigInt(seal.aiAmount) : typed === null ? null : BigInt(vndToAmount(typed, rate));

  const tooBig = amount !== null && amount > C;
  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";
  const done = tx.state.phase === "success";
  const differsFromAi = seal && amount !== null && amount !== BigInt(seal.aiAmount);

  async function submit() {
    if (amount === null || tooBig) return;
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "proposeDeduction",
      // Không có con dấu: aiAmount 0, reportHash 0, chữ ký rỗng "0x" → contract không kiểm tra con dấu.
      args: seal
        ? [BigInt(deal.dealId), amount, BigInt(seal.aiAmount), seal.reportHash, seal.signature]
        : [BigInt(deal.dealId), amount, 0n, zeroHash, "0x"],
    });
    if (!receipt) return;
    await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
    // Mức trừ 0: contract chia tiền ngay trong cùng giao dịch → sang thẳng biên nhận.
    if (amount === 0n) router.push(back.replace(/(\/deals\/\d+)/, "$1/receipt"));
  }

  return (
    <>
      <section aria-labelledby="propose" className="space-y-4">
        <h2 id="propose" className="text-lg font-bold">
          Đề xuất của bạn
        </h2>
        <Field
          label="Mức trừ (VND)"
          htmlFor="propose-amount"
          hint={seal ? "Điền sẵn bằng con số AI đã ký. Nhập 0 nếu hoàn đủ cọc." : "Nhập 0 nếu hoàn đủ cọc."}
          error={tooBig ? `Không được trừ quá tiền cọc (${vnd(C)}).` : undefined}
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

        {amount !== null && !tooBig && (
          <Rows>
            <Row label="Người thuê nhận lại" value={vnd(C - amount)} tone="success" strong />
            <Row label="Bạn nhận" value={vnd(amount)} sub={formatToken(amount)} />
          </Rows>
        )}

        {amount === 0n && (
          <InfoBox icon={<Info className="size-5" />} title="Mức trừ 0: chia tiền ngay">
            Người thuê nhận lại đủ cọc trong cùng giao dịch. Không có bước chờ trả lời.
          </InfoBox>
        )}
        {amount !== null && amount > 0n && !tooBig && (
          <InfoBox icon={<Scale className="size-5" />} title="Người thuê sẽ trả lời">
            Người thuê đồng ý hoặc kháng nghị trước hạn. Im lặng tới hạn thì chia theo con số của bạn.
            {differsFromAi && (
              <span className="mt-1 block">
                Con số này khác AI ({vnd(seal.aiAmount)}). Nếu có kháng nghị, phiếu AI về bên có con số gần con số AI
                hơn.
              </span>
            )}
          </InfoBox>
        )}
        {!seal && !waitingAi && (
          <p className="text-sm text-muted-foreground">Không có con dấu AI: đề xuất vẫn hợp lệ, nhưng tranh chấp sẽ không có phiếu AI.</p>
        )}
      </section>

      <BottomBar>
        {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText="Đã gửi đề xuất" />}
        {done ? (
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={back}>Về hợp đồng</Link>
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={busy || passed || waitingAi || amount === null || tooBig}
            onClick={submit}
          >
            {busy && <Loader2 className="animate-spin" />}
            {passed
              ? "Đã quá hạn đề xuất"
              : waitingAi
                ? "Đợi AI so xong…"
                : amount === null
                  ? "Nhập mức trừ"
                  : tx.state.phase === "error"
                    ? "Thử lại"
                    : amount === 0n
                      ? "Ký: hoàn đủ cọc"
                      : `Ký đề xuất trừ ${vnd(amount)}`}
          </Button>
        )}
      </BottomBar>
    </>
  );
}

// ------------------------------------------------------------------ người thuê trả lời

export function RespondPanel({ deal, back }: { deal: DealView; back: string }) {
  const rate = useVndRate();
  const vnd = (a: Amount | bigint) => formatVnd(amountToVnd(a, rate));
  const tx = useTx();
  const qc = useQueryClient();
  const router = useRouter();
  const { passed } = useCountdown(deal.onchain.deadline);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const { onchain } = deal;
  const C = BigInt(onchain.deposit);
  const D = BigInt(onchain.proposedAmount);
  const AI = BigInt(onchain.aiAmount);
  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";

  async function accept() {
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "acceptProposal",
      args: [BigInt(deal.dealId)],
    });
    if (!receipt) return;
    await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
    router.push(back.replace(/(\/deals\/\d+)/, "$1/receipt"));
  }

  return (
    <>
      <section aria-labelledby="respond" className="space-y-4">
        <h2 id="respond" className="text-lg font-bold">
          Chủ trọ đề xuất
        </h2>
        <Rows>
          <Row label="Mức trừ" value={vnd(D)} strong tone="destructive" />
          {onchain.hasAiSeal && <Row label="AI tính (có con dấu)" value={vnd(AI)} />}
          <Row
            label="Bạn nhận lại nếu đồng ý"
            value={vnd(C - D)}
            tone="success"
            sub={onchain.yieldGross !== "0" ? "chưa tính phần lãi" : undefined}
          />
        </Rows>
        {onchain.hasAiSeal && D > AI && (
          <InfoBox icon={<Scale className="size-5" />} tone="warning" title={`Cao hơn AI ${vnd(D - AI)}`}>
            Bạn có thể kháng nghị với con số của mình. Phiếu AI về bên có con số gần {vnd(AI)} hơn.
          </InfoBox>
        )}
        {onchain.hasAiSeal && D <= AI && (
          <InfoBox icon={<Scale className="size-5" />} title="Không cao hơn con số AI">
            Nếu kháng nghị, phiếu AI nhiều khả năng về phía chủ trọ.
          </InfoBox>
        )}
        <p className="text-sm text-muted-foreground">
          Im lặng tới hạn thì coi như đồng ý. Đồng ý ngay thì tiền về ví bạn trong vài giây.
        </p>
      </section>

      <BottomBar>
        {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText="Đã đồng ý, tiền đã chia" />}
        <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={accept}>
          {busy && <Loader2 className="animate-spin" />}
          {tx.state.phase === "error" ? "Thử lại" : `Đồng ý, nhận lại ${vnd(C - D)}`}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12 w-full text-base"
          disabled={busy || passed}
          onClick={() => setDisputeOpen(true)}
        >
          <Gavel /> {passed ? "Đã quá hạn kháng nghị" : "Kháng nghị"}
        </Button>
      </BottomBar>

      <DisputeDrawer deal={deal} open={disputeOpen} onClose={() => setDisputeOpen(false)} back={back} />
    </>
  );
}

/** Người thuê nhập con số mình chấp nhận (nhỏ hơn đề xuất) rồi ký disputeProposal. */
function DisputeDrawer({ deal, open, onClose, back }: { deal: DealView; open: boolean; onClose: () => void; back: string }) {
  const rate = useVndRate();
  const vnd = (a: Amount | bigint) => formatVnd(amountToVnd(a, rate));
  const tx = useTx();
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { onchain } = deal;
  const D = BigInt(onchain.proposedAmount);
  const AI = BigInt(onchain.aiAmount);
  const typed = parseVndInput(text);
  const counter = typed === null ? null : BigInt(vndToAmount(typed, rate));
  const tooBig = counter !== null && counter >= D; // contract: counterAmount < proposedAmount
  const busy = tx.state.phase === "signing" || tx.state.phase === "pending";
  const done = tx.state.phase === "success";

  // Cùng quy tắc với bảng điểm bồi thẩm (deductionAiSide), để hai màn không lệch nhau.
  const aiSide = onchain.hasAiSeal && counter !== null && !tooBig ? deductionAiSide(D, counter, AI) : null;

  async function submit() {
    if (counter === null || tooBig) return;
    const receipt = await tx.run({
      address: addresses.escrow,
      abi: escrowAbi,
      functionName: "disputeProposal",
      args: [BigInt(deal.dealId), counter],
    });
    if (receipt) await qc.invalidateQueries({ queryKey: ["deal-view", deal.dealId] });
  }

  function change(next: boolean) {
    if (next || busy) return; // đang ký/chờ chuỗi: không cho đóng để khỏi mất dấu giao dịch
    onClose();
    if (!done) tx.reset();
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md space-y-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-xl font-extrabold text-primary">Kháng nghị</DrawerTitle>
            <DrawerDescription>
              Nhập mức trừ bạn chấp nhận, nhỏ hơn {vnd(D)}. Bồi thẩm chọn một trong hai con số; bên nào đủ 2 phiếu thì
              thắng.
            </DrawerDescription>
          </DrawerHeader>

          {!done && (
            <Field
              label="Mức trừ bạn chấp nhận"
              htmlFor="counter-amount"
              hint="Nhập 0 nếu bạn cho rằng không có hư hỏng."
              error={tooBig ? `Phải nhỏ hơn mức chủ trọ đề xuất (${vnd(D)}).` : undefined}
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
          )}

          {aiSide && !done && (
            <p className="rounded-xl bg-secondary/60 p-3 text-sm">
              Phiếu AI sẽ về{" "}
              <strong className={aiSide === "tenant" ? "text-success" : "text-destructive"}>
                {aiSide === "tenant" ? "phía bạn" : "phía chủ trọ"}
              </strong>
              , vì con số {aiSide === "tenant" ? "của bạn" : "của chủ trọ"} gần {vnd(AI)} hơn.
            </p>
          )}
          {!onchain.hasAiSeal && !done && (
            <p className="text-sm text-muted-foreground">
              Đề xuất này không có con dấu AI. Hết hạn mà chưa bên nào đủ phiếu thì lấy trung bình hai con số.
            </p>
          )}

          {tx.state.phase !== "idle" && <TxStatus state={tx.state} doneText="Đã gửi kháng nghị" />}

          {done ? (
            <Button asChild size="lg" className="h-14 w-full text-base">
              <Link href={back}>Về hợp đồng</Link>
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-14 w-full text-base"
              disabled={busy || counter === null || tooBig}
              onClick={submit}
            >
              {busy && <Loader2 className="animate-spin" />}
              {tx.state.phase === "error" ? "Thử lại" : "Ký gửi kháng nghị"}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
