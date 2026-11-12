import { Badge } from "@/components/ui/badge";
import { DEAL_STATUS, TONE_CLASS } from "@/lib/client/deal-status";
import type { DealState } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DealStatusBadge({ state, className }: { state: DealState; className?: string }) {
  const { label, tone } = DEAL_STATUS[state];
  return (
    <Badge variant="outline" className={cn("font-semibold", TONE_CLASS[tone], className)}>
      {label}
    </Badge>
  );
}
