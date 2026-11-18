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
        <Wallet className="size-4 motion-safe:animate-pulse" aria-hidden="true" /> Đang tạo ví…
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được địa chỉ ví");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-sm transition-colors duration-150 hover:bg-accent"
      aria-label={`Sao chép địa chỉ ví ${shortAddress(address)}`}
    >
      <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
      {shortAddress(address)}
      {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4 text-muted-foreground" aria-hidden="true" />}
      <span className="sr-only" role="status">{copied ? "Đã sao chép" : ""}</span>
    </button>
  );
}
