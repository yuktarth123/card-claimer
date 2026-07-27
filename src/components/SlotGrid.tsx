import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCY } from "@/config";
import type { Database } from "@/integrations/supabase/types";

type BreakSlotClaim = Database["public"]["Tables"]["break_slot_claims"]["Row"];

interface Props {
  totalSlots: number;
  pricePerSlot: number;
  claims: BreakSlotClaim[];
  mySessionId: string;
  selectedSlots: Set<number>;
  onToggleSlot: (slot: number) => void;
  disabled?: boolean;
}

export function SlotGrid({ totalSlots, pricePerSlot, claims, mySessionId, selectedSlots, onToggleSlot, disabled }: Props) {
  const claimBySlot = new Map<number, BreakSlotClaim>();
  for (const c of claims) claimBySlot.set(c.slot_number, c);

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-2">
      {Array.from({ length: totalSlots }, (_, i) => i + 1).map((slot) => {
        const claim = claimBySlot.get(slot);
        const isMine = claim?.buyer_session_id === mySessionId;
        const isTaken = Boolean(claim) && !isMine;
        const isSelected = selectedSlots.has(slot);

        return (
          <button
            key={slot}
            type="button"
            disabled={disabled || Boolean(claim)}
            onClick={() => onToggleSlot(slot)}
            title={claim ? `Slot ${slot} — claimed by ${claim.buyer_name}` : `Slot ${slot} — ${CURRENCY}${pricePerSlot.toFixed(0)}`}
            className={cn(
              "aspect-square rounded-lg border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all overflow-hidden",
              isMine && "bg-success text-success-foreground border-success shadow-claim",
              isTaken && "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-70",
              !claim && isSelected && "bg-primary text-primary-foreground border-primary shadow-glow scale-105",
              !claim && !isSelected && "bg-card border-border hover:border-primary hover:text-primary"
            )}
          >
            <span>{slot}</span>
            {isMine && <Check className="w-3 h-3 shrink-0" />}
            {isTaken && <span className="truncate max-w-full text-[8px] px-0.5 leading-none">{claim!.buyer_name}</span>}
          </button>
        );
      })}
    </div>
  );
}
