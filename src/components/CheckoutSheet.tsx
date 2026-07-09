import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingBag, MessageCircle, X, AlertTriangle, Truck } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { CURRENCY, SELLER_NAME, SELLER_WHATSAPP, CLAIM_DURATION_MINUTES, FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, PREORDER_MIN_DAYS, PREORDER_MAX_DAYS } from "@/config";
import { addDays, addMinutes, format, isPast } from "date-fns";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import ClaimCountdown from "./ClaimCountdown";
import { supabase } from "@/integrations/supabase/client";
import { useBuyer } from "@/hooks/useBuyer";
import { toast } from "sonner";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];

interface Props {
  myClaims: Claim[];
  cards: Card[];
  buyerName: string;
  onUnclaim: (claim: Claim, toastId?: string | number) => void;
  isSaleLive?: boolean;
  onFinalized?: () => void;
}

export function CheckoutSheet({ myClaims, cards, buyerName, onUnclaim, isSaleLive = true, onFinalized }: Props) {
  const { sessionId } = useBuyer();

  const cardById = useMemo(() => {
    const map: Record<string, Card> = {};
    for (const c of cards) map[c.id] = c;
    return map;
  }, [cards]);

  const totalUnits = myClaims.reduce((s, c) => s + c.quantity, 0);
  const subtotal = myClaims.reduce((s, c) => s + c.quantity * Number(c.unit_price), 0);
  const shippingFee = subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD ? SHIPPING_FEE : 0;
  const grandTotal = subtotal + shippingFee;

  const arrivalWindowFor = (card: Card) => {
    const start = addDays(new Date(card.created_at), PREORDER_MIN_DAYS);
    const end = addDays(new Date(card.created_at), PREORDER_MAX_DAYS);
    return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
  };

  const hasPreorderItems = myClaims.some((claim) => cardById[claim.card_id]?.is_preorder);

  const message = `Hi ${SELLER_NAME}! I'm ${buyerName}.\n\nI've claimed ${totalUnits} item${totalUnits === 1 ? "" : "s"}:\n${myClaims
    .map((claim, i) => {
      const card = cardById[claim.card_id];
      if (!card) return `${i + 1}. (listing unavailable) x${claim.quantity}`;
      const imageUrl = card.photo_url;
      const lineTotal = claim.quantity * Number(claim.unit_price);
      const preorderNote = card.is_preorder ? `\n   🚚 Pre-order — arrives around ${arrivalWindowFor(card)}` : '';
      return `${i + 1}. ${card.name}${card.card_set ? ` (${card.card_set})` : ""} x${claim.quantity} — ${CURRENCY}${lineTotal.toFixed(0)}${card.condition ? ` (${card.condition})` : ''}${preorderNote}${imageUrl ? `\n${imageUrl}` : ''}`;
    })
    .join("\n")}\n\nSubtotal: ${CURRENCY}${subtotal.toFixed(0)}\nShipping: ${shippingFee === 0 ? "FREE" : `${CURRENCY}${shippingFee}`}\nTotal: ${CURRENCY}${grandTotal.toFixed(0)}\n\n${shippingFee === 0 ? "Good news! Your order qualifies for FREE shipping!" : `Add ${CURRENCY}${FREE_SHIPPING_THRESHOLD - subtotal} more for FREE shipping!`}\n\nPlease share payment details. 🙏`;

  const waLink = `https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent(message)}`;

  const hasExpiredClaims = useMemo(() => {
    return myClaims.some((claim) => {
      const claimedDate = new Date(claim.claimed_at);
      const expiryDate = addMinutes(claimedDate, CLAIM_DURATION_MINUTES);
      return isPast(expiryDate);
    });
  }, [myClaims]);

  const handleFinalize = async () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([15, 30, 15]);
    }
    await supabase.rpc("finalize_claims", { _session_id: sessionId });
    onFinalized?.();
  };

  if (!isSaleLive) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          disabled={myClaims.length === 0}
          className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] pb-[env(safe-area-inset-bottom)] active:scale-[0.99] transition-transform disabled:cursor-not-allowed"
          aria-label="Open cart"
        >
          <div className="container flex items-center gap-3 py-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
                <ShoppingBag className="w-5 h-5 text-primary-foreground" />
              </div>
              {totalUnits > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-black rounded-full min-w-5 h-5 px-1 flex items-center justify-center shadow-md animate-claim-pop">
                  {totalUnits}
                </span>
              )}
            </div>
            <div className="flex-1 text-left min-w-0">
              {myClaims.length === 0 ? (
                <>
                  <p className="text-sm font-semibold">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground">Tap any listing to claim it</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {totalUnits} unit{totalUnits === 1 ? "" : "s"} claimed
                  </p>
                  <p className="font-display text-lg font-bold text-primary leading-tight tabular-nums">
                    {CURRENCY}{grandTotal.toFixed(0)}
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
          <SheetTitle>Your Claims</SheetTitle>
          <SheetDescription asChild>
            <div>
              {buyerName ? `Claiming as ${buyerName}` : "Items you've claimed in this sale"}
              <span className="block text-xs text-muted-foreground mt-1">
                <AlertTriangle className="inline-block w-3 h-3 mr-1 text-primary" />
                Claims must be purchased within {CLAIM_DURATION_MINUTES} minutes.
              </span>
              <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Truck className="inline-block w-3 h-3 text-secondary" />
                Free shipping above {CURRENCY}{FREE_SHIPPING_THRESHOLD}, otherwise {CURRENCY}{SHIPPING_FEE} shipping.
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 my-4 space-y-2">
          {myClaims.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No claims yet. Tap any listing to claim it!</p>
            </div>
          ) : (
            myClaims.map((claim) => {
              const card = cardById[claim.card_id];
              const lineTotal = claim.quantity * Number(claim.unit_price);

              return (
                <div key={claim.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border border-border">
                  {card?.photo_url && (
                    <img src={card.photo_url} alt={card.name} className="w-12 h-16 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{card?.name ?? "Listing removed"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Qty {claim.quantity} {card?.condition ? `• ${card.condition}` : ''}
                    </p>
                    {card?.is_preorder && (
                      <p className="text-xs font-semibold text-secondary flex items-center gap-1">
                        <Truck className="w-3 h-3" /> Pre-order · arrives {arrivalWindowFor(card)}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-primary">{CURRENCY}{lineTotal.toFixed(0)}</p>
                      <ClaimCountdown
                        claimedAt={claim.claimed_at}
                        onExpired={() => {
                          toast.warning("Claim expired", { description: `${card?.name ?? "Item"} was released.` });
                          onUnclaim(claim);
                        }}
                        className="text-[10px] px-1.5 py-0.5"
                      />
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => onUnclaim(claim)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <SheetFooter className="border-t border-border pt-4 flex-col gap-3 sm:flex-col">
          {myClaims.length > 0 && (
            <div className="w-full space-y-1.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-display tabular-nums">{CURRENCY}{subtotal.toFixed(0)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className={cn("font-display tabular-nums", shippingFee === 0 && "text-success")}>
                  {shippingFee === 0 ? "FREE" : `${CURRENCY}${shippingFee}`}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-border">
                <span className="font-semibold">Total</span>
                <span className="font-display text-2xl font-bold text-primary tabular-nums">{CURRENCY}{grandTotal.toFixed(0)}</span>
              </div>
            </div>
          )}
          {subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 justify-center">
              <Truck className="w-4 h-4 text-secondary" />
              Add {CURRENCY}{FREE_SHIPPING_THRESHOLD - subtotal} more to waive the {CURRENCY}{SHIPPING_FEE} shipping fee!
            </p>
          )}
          {subtotal >= FREE_SHIPPING_THRESHOLD && (
            <p className="text-sm text-success flex items-center gap-1 justify-center">
              <Truck className="w-4 h-4" />
              Your order qualifies for FREE shipping!
            </p>
          )}
          {hasPreorderItems && (
            <p className="text-sm text-secondary flex items-center gap-1 justify-center text-center">
              <Truck className="w-4 h-4 flex-shrink-0" />
              Your cart includes pre-order item{myClaims.filter((c) => cardById[c.card_id]?.is_preorder).length === 1 ? "" : "s"} — see arrival estimates above.
            </p>
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
