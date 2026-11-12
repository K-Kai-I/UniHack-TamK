"use client";
import { useState } from "react";
import { Check, Copy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { shortAddress } from "@/lib/client/money";

/** Địa chỉ ví rút gọn + nút copy. */
export function WalletChip({ address }: { address?: string }) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">
        <Wallet className="size-4 animate-pulse" /> Đang tạo ví…
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không copy được địa chỉ");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 font-mono text-sm shadow-sm transition hover:bg-accent"
      aria-label="Copy địa chỉ ví"
    >
      <Wallet className="size-4 text-success" />
      {shortAddress(address)}
      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-muted-foreground" />}
    </button>
  );
}
