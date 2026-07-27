import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingBag, MessageCircle, X, AlertTriangle } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { CURRENCY, SELLER_NAME, SELLER_WHATSAPP, CLAIM_DURATION_MINUTES } from "@/config";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBuyer } from "@/hooks/useBuyer";
import ClaimCountdown from "./ClaimCountdown";
import { toast } from "sonner";

type BoxBreak = Database["public"]["Tables"]["box_breaks"]["Row"];
type BreakSlotClaim = Database["public"]["Tables"]["break_slot_claims"]["Row"];

interface Props {
  breakRow: BoxBreak;
  myClaims: BreakSlotClaim[];
  buyerName: string;
  onUnclaim: (claim: BreakSlotClaim, toastId?: string | number) => void;
  onFinalized?: () => void;
}

export function BreakCheckoutSheet({ breakRow, myClaims, buyerName, onUnclaim, onFinalized }: Props) {
  const { sessionId } = useBuyer();

  const sortedSlots = useMemo(() => [...myClaims].sort((a, b) => a.slot_number - b.slot_number), [myClaims]);
  const total = myClaims.length * Number(breakRow.price_per_slot);

  const message = `Hi ${SELLER_NAME}! I'm ${buyerName}.\n\nI'd like to claim ${myClaims.length} slot${myClaims.length === 1 ? "" : "s"} in "${breakRow.title}":\nSlots: ${sortedSlots.map((c) => c.slot_number).join(", ")}\n\nTotal: ${CURRENCY}${total.toFixed(0)}\n\nPlease share payment details. 🙏`;

  const waLink = `https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent(message)}`;

  const hasExpiredClaims = useMemo(() => {
    const now = Date.now();
    return myClaims.some((c) => now - new Date(c.claimed_at).getTime() > CLAIM_DURATION_MINUTES * 60 * 1000);
  }, [myClaims]);

  const handleFinalize = async () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([15, 30, 15]);
    }
    await supabase.rpc("finalize_break_slot_claims", { _break_id: breakRow.id, _session_id: sessionId });
    onFinalized?.();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          disabled={myClaims.length === 0}
          className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] pb-[env(safe-area-inset-bottom)] active:scale-[0.99] transition-transform disabled:cursor-not-allowed"
          aria-label="Open slot cart"
        >
          <div className="container flex items-center gap-3 py-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
                <ShoppingBag className="w-5 h-5 text-primary-foreground" />
              </div>
              {myClaims.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-black rounded-full min-w-5 h-5 px-1 flex items-center justify-center shadow-md animate-claim-pop">
                  {myClaims.length}
                </span>
              )}
            </div>
            <div className="flex-1 text-left min-w-0">
              {myClaims.length === 0 ? (
                <>
                  <p className="text-sm font-semibold">No slots picked yet</p>
                  <p className="text-xs text-muted-foreground">Tap a slot number to claim it</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {myClaims.length} slot{myClaims.length === 1 ? "" : "s"} claimed
                  </p>
                  <p className="font-display text-lg font-bold text-primary leading-tight tabular-nums">
                    {CURRENCY}{total.toFixed(0)}
                  </p>
                </>
              )}
            </div>
            <div
              className={
                myClaims.length === 0
                  ? "px-4 h-11 rounded-xl bg-muted text-muted-foreground font-bold flex items-center gap-1.5 text-sm opacity-60"
                  : "px-4 h-11 rounded-xl bg-success text-success-foreground font-bold flex items-center gap-1.5 text-sm shadow-claim"
              }
            >
              <MessageCircle className="w-4 h-4" />
              Checkout
            </div>
          </div>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Your Slots</SheetTitle>
          <SheetDescription asChild>
            <div>
              {buyerName ? `Claiming as ${buyerName}` : "Slots you've claimed in this break"}
              <span className="block text-xs text-muted-foreground mt-1">
                <AlertTriangle className="inline-block w-3 h-3 mr-1 text-primary" />
                Claims must be purchased within {CLAIM_DURATION_MINUTES} minutes.
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 my-4 space-y-2">
          {myClaims.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No slots yet. Tap any open slot to claim it!</p>
            </div>
          ) : (
            sortedSlots.map((claim) => (
              <div key={claim.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border border-border">
                <div className="w-12 h-12 shrink-0 rounded-lg gradient-gold flex items-center justify-center font-display font-bold text-lg text-primary-foreground">
                  {claim.slot_number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">Slot {claim.slot_number}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-primary">{CURRENCY}{Number(breakRow.price_per_slot).toFixed(0)}</p>
                    {claim.status === "claimed" && (
                      <ClaimCountdown
                        claimedAt={claim.claimed_at}
                        onExpired={() => {
                          toast.warning("Claim expired", { description: `Slot ${claim.slot_number} was released.` });
                          onUnclaim(claim);
                        }}
                        className="text-[10px] px-1.5 py-0.5"
                      />
                    )}
                    {claim.status === "checked_out" && (
                      <span className="text-[10px] text-success font-semibold">✓ Checked out</span>
                    )}
                  </div>
                </div>
                {claim.status === "claimed" && (
                  <Button size="icon" variant="ghost" onClick={() => onUnclaim(claim)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <SheetFooter className="border-t border-border pt-4 flex-col gap-3 sm:flex-col">
          {myClaims.length > 0 && (
            <div className="w-full flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="font-display text-2xl font-bold text-primary tabular-nums">{CURRENCY}{total.toFixed(0)}</span>
            </div>
          )}
          {hasExpiredClaims && (
            <p className="text-sm text-destructive flex items-center gap-1 justify-center">
              <AlertTriangle className="w-4 h-4" /> Some claims have expired. Please unclaim them.
            </p>
          )}
          {myClaims.length > 0 && (
            <Button
              asChild
              disabled={hasExpiredClaims}
              className="w-full h-12 bg-success hover:bg-success/90 text-success-foreground font-bold text-base"
            >
              <a href={waLink} target="_blank" rel="noopener noreferrer" onClick={handleFinalize}>
                <MessageCircle className="w-5 h-5 mr-2" />
                Finalize via WhatsApp
              </a>
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
