import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingBag, MessageCircle, X, AlertTriangle, Truck } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { CURRENCY, SELLER_NAME, SELLER_WHATSAPP, CLAIM_DURATION_MINUTES, FREE_SHIPPING_THRESHOLD } from "@/config";
import { addMinutes, isPast } from "date-fns";
import { useMemo } from "react";
import ClaimCountdown from "./ClaimCountdown";
import { supabase } from "@/integrations/supabase/client";
import { useBuyer } from "@/hooks/useBuyer";

type Card = Database["public"]["Tables"]["cards"]["Row"];

interface Props {
  myCards: Card[];
  buyerName: string;
  onUnclaim: (card: Card) => void;
}

export function CheckoutSheet({ myCards, buyerName, onUnclaim }: Props) {
  const { sessionId } = useBuyer();
  const total = myCards.reduce((s, c) => s + Number(c.price), 0);

  const message = `Hi ${SELLER_NAME}! I'm ${buyerName}.\n\nI've claimed ${myCards.length} card${myCards.length === 1 ? "" : "s"}:\n${myCards
    .map((c, i) => {
      const imageUrl = c.photo_url || c.tcg_image_url;
      return `${i + 1}. ${c.name}${c.card_set ? ` (${c.card_set})` : ""} — ${CURRENCY}${Number(c.price).toFixed(0)}${c.condition ? ` (${c.condition})` : ''}${imageUrl ? `\n${imageUrl}` : ''}`;
    })
    .join("\n")}\n\nTotal: ${CURRENCY}${total.toFixed(0)}\n\n${total >= FREE_SHIPPING_THRESHOLD ? "Good news! Your order qualifies for FREE shipping!" : `Add ${CURRENCY}${FREE_SHIPPING_THRESHOLD - total} more for FREE shipping!`}\n\nPlease share payment details. 🙏`;

  const waLink = `https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent(message)}`;

  const hasExpiredCards = useMemo(() => {
    return myCards.some(card => {
      if (!card.claimed_at) return false;
      const claimedDate = new Date(card.claimed_at);
      const expiryDate = addMinutes(claimedDate, CLAIM_DURATION_MINUTES);
      return isPast(expiryDate);
    });
  }, [myCards]);

  const handleFinalize = async () => {
    // Haptic on mobile
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([15, 30, 15]);
    }
    // Lock the cards in so they can't be taken back by others
    await supabase.rpc("finalize_claims", { _session_id: sessionId });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          disabled={myCards.length === 0}
          className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] pb-[env(safe-area-inset-bottom)] active:scale-[0.99] transition-transform disabled:cursor-not-allowed"
          aria-label="Open cart"
        >
          <div className="container flex items-center gap-3 py-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
                <ShoppingBag className="w-5 h-5 text-primary-foreground" />
              </div>
              {myCards.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-black rounded-full min-w-5 h-5 px-1 flex items-center justify-center shadow-md animate-claim-pop">
                  {myCards.length}
                </span>
              )}
            </div>
            <div className="flex-1 text-left min-w-0">
              {myCards.length === 0 ? (
                <>
                  <p className="text-sm font-semibold">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground">Tap any card to claim it</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {myCards.length} card{myCards.length === 1 ? "" : "s"} claimed
                  </p>
                  <p className="text-lg font-black text-primary leading-tight">
                    {CURRENCY}{total.toFixed(0)}
                  </p>
                </>
              )}
            </div>
            <div
              className={
                myCards.length === 0
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
          <SheetDescription>
            {buyerName ? `Claiming as ${buyerName}` : "Cards you've claimed in this sale"}
            <p className="text-xs text-muted-foreground mt-1">
              <AlertTriangle className="inline-block w-3 h-3 mr-1 text-primary" />
              Cards must be purchased within {CLAIM_DURATION_MINUTES} minutes of claiming.
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Truck className="inline-block w-3 h-3 text-secondary" />
              Free shipping for orders above {CURRENCY}{FREE_SHIPPING_THRESHOLD}!
            </p>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 my-4 space-y-2">
          {myCards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No claims yet. Tap any available card to claim it!</p>
            </div>
          ) : (
            myCards.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border border-border">
                {(c.tcg_image_url || c.photo_url) && (
                  <img src={c.tcg_image_url || c.photo_url!} alt={c.name} className="w-12 h-16 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.card_set} {c.condition ? `(${c.condition})` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-primary">{CURRENCY}{Number(c.price).toFixed(0)}</p>
                    {c.claimed_at && (
                      <ClaimCountdown claimedAt={c.claimed_at} onExpired={() => onUnclaim(c)} className="text-[10px] px-1.5 py-0.5" />
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => onUnclaim(c)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <SheetFooter className="border-t border-border pt-4 flex-col gap-3 sm:flex-col">
          <div className="flex justify-between items-center w-full">
            <span className="text-muted-foreground">Total</span>
            <span className="text-2xl font-black text-primary">{CURRENCY}{total.toFixed(0)}</span>
          </div>
          {total < FREE_SHIPPING_THRESHOLD && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 justify-center">
              <Truck className="w-4 h-4 text-secondary" />
              Add {CURRENCY}{FREE_SHIPPING_THRESHOLD - total} more for FREE shipping!
            </p>
          )}
          {total >= FREE_SHIPPING_THRESHOLD && (
            <p className="text-sm text-success flex items-center gap-1 justify-center">
              <Truck className="w-4 h-4" />
              Your order qualifies for FREE shipping!
            </p>
          )}
          {hasExpiredCards && (
            <p className="text-sm text-destructive flex items-center gap-1 justify-center">
              <AlertTriangle className="w-4 h-4" /> Some claimed cards have expired. Please unclaim them.
            </p>
          )}
          <Button
            asChild
            disabled={myCards.length === 0 || hasExpiredCards}
            className="w-full h-12 bg-success hover:bg-success/90 text-success-foreground font-bold text-base"
          >
            <a href={waLink} target="_blank" rel="noopener noreferrer" onClick={handleFinalize}>
              <MessageCircle className="w-5 h-5 mr-2" />
              Finalize via WhatsApp
            </a>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}