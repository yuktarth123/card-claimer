import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CURRENCY, CLAIM_DURATION_MINUTES, ITEM_TYPES, PREORDER_MIN_DAYS, PREORDER_MAX_DAYS } from "@/config";
import type { Database } from "@/integrations/supabase/types";
import { Sparkles, Check, Minus, Plus, Truck, History, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import ClaimCountdown from "./ClaimCountdown";
import { addDays, addMinutes, format, isPast } from "date-fns";
import React, { useState, useMemo, useRef, useEffect } from "react";
import MediaCarouselDialog from "./MediaCarouselDialog";
import { toast } from "sonner";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];

interface Props {
  card: Card;
  myClaims: Claim[];
  onClaim: (card: Card, quantity: number) => void;
  onUnclaim: (claim: Claim, toastId?: string | number) => void;
  disabled?: boolean;
  isSaleLive: boolean;
}

export function CardTile({ card, myClaims, onClaim, onUnclaim, disabled, isSaleLive }: Props) {
  const [pickQuantity, setPickQuantity] = useState(1);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [initialMediaIndex, setInitialMediaIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  // Only autoplay this thumbnail's video while it's actually on screen, so a
  // grid of many listings doesn't try to stream every video at once.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [card.video_url]);

  // Same idea for the photo slideshow -- only cycle while the card is
  // actually visible, so an entire grid of listings isn't ticking timers
  // for cards the buyer hasn't scrolled to.
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const myTotalClaimed = myClaims.reduce((sum, c) => sum + c.quantity, 0);
  const soldOut = card.quantity_available <= 0;
  const isClaimButtonDisabled = disabled || !isSaleLive || soldOut;

  const allMediaUrls = useMemo(() => {
    const urls: string[] = [];
    if (card.video_url) urls.push(card.video_url);
    if (card.photo_url) urls.push(card.photo_url);
    if (card.photo_urls) urls.push(...card.photo_urls);
    return urls.filter(Boolean);
  }, [card.video_url, card.photo_url, card.photo_urls]);

  // Photos only (no video) -- what the thumbnail auto-cycles through when
  // there's more than one and no video is taking over the display.
  const photoOnlyUrls = useMemo(() => {
    const urls: string[] = [];
    if (card.photo_url) urls.push(card.photo_url);
    if (card.photo_urls) urls.push(...card.photo_urls);
    return urls.filter(Boolean);
  }, [card.photo_url, card.photo_urls]);

  const hasSlideshow = !card.video_url && photoOnlyUrls.length > 1;

  useEffect(() => {
    if (!hasSlideshow || !isInView) return;
    const interval = setInterval(() => {
      setSlideIndex((i) => (i + 1) % photoOnlyUrls.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [hasSlideshow, isInView, photoOnlyUrls.length]);

  const handleMediaClick = (clickedUrl: string) => {
    const index = allMediaUrls.indexOf(clickedUrl);
    if (index !== -1) {
      setInitialMediaIndex(index);
      setIsCarouselOpen(true);
    }
  };

  const currentDisplayMediaUrl = card.video_url || (hasSlideshow ? photoOnlyUrls[slideIndex] : card.photo_url);

  const originalPrice = Number(card.price);
  const salePrice = card.sale_price !== null ? Number(card.sale_price) : null;
  const isOnSale = salePrice !== null && salePrice < originalPrice;
  const displayPrice = isOnSale ? salePrice : originalPrice;

  const discountPercentage = useMemo(() => {
    if (isOnSale && originalPrice > 0) {
      return Math.round(((originalPrice - salePrice!) / originalPrice) * 100);
    }
    return 0;
  }, [originalPrice, salePrice, isOnSale]);

  const maxPickable = Math.max(1, card.quantity_available);

  const arrivalWindow = useMemo(() => {
    if (!card.is_preorder) return null;
    const published = new Date(card.created_at);
    const start = addDays(published, PREORDER_MIN_DAYS);
    const end = addDays(published, PREORDER_MAX_DAYS);
    return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
  }, [card.is_preorder, card.created_at]);

  const handleClaimClick = () => {
    const qty = Math.min(pickQuantity, card.quantity_available);
    if (qty <= 0) return;
    onClaim(card, qty);
    setPickQuantity(1);
  };

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-2xl gradient-card-bg border border-border shadow-card-pop animate-fade-in transition-all",
          soldOut && myTotalClaimed === 0 && "opacity-60 grayscale",
          myTotalClaimed > 0 && "ring-2 ring-success shadow-claim"
        )}
      >
        <div
          ref={imageContainerRef}
          className="aspect-[3/4] w-full overflow-hidden bg-muted relative cursor-pointer"
          onClick={() => currentDisplayMediaUrl && handleMediaClick(currentDisplayMediaUrl)}
        >
          {currentDisplayMediaUrl ? (
            card.video_url ? (
              <video
                ref={videoRef}
                src={card.video_url}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loop
                muted
                playsInline
                preload="metadata"
              />
            ) : hasSlideshow ? (
              photoOnlyUrls.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={card.name}
                  loading="lazy"
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-700 ease-in-out group-hover:scale-105",
                    i === slideIndex ? "opacity-100" : "opacity-0"
                  )}
                />
              ))
            ) : (
              <img
                src={currentDisplayMediaUrl}
                alt={card.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Sparkles className="w-10 h-10" />
            </div>
          )}
          {hasSlideshow && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
              {photoOnlyUrls.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    i === slideIndex ? "bg-white" : "bg-white/40"
                  )}
                />
              ))}
            </div>
          )}
          <div className="absolute top-2 right-2 max-w-[calc(50%-10px)] flex flex-col items-end gap-1">
            {card.is_preorder && (
              <Badge className="max-w-full bg-secondary text-secondary-foreground border-0 shadow-md">
                <Truck className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Pre-Order</span>
              </Badge>
            )}
            {card.condition && (
              <Badge className="max-w-full min-w-0 bg-card text-foreground border border-border shadow-md">
                <span className="truncate">{card.condition}</span>
              </Badge>
            )}
            {isOnSale && (
              <Badge className="max-w-full bg-accent text-accent-foreground border-0 shadow-md">
                <span className="truncate">-{discountPercentage}%</span>
              </Badge>
            )}
            <Badge className={cn("max-w-full border-0 shadow-md", soldOut ? "bg-destructive text-destructive-foreground" : "bg-success/90 text-success-foreground")}>
              <span className="truncate">{soldOut ? "Out of stock" : `${card.quantity_available} left`}</span>
            </Badge>
          </div>
          {(myTotalClaimed > 0 || card.is_vintage || (card.language && card.language !== "English")) && (
            <div className="absolute top-2 left-2 max-w-[calc(50%-10px)] flex flex-col items-start gap-1">
              {card.is_vintage && (
                <Badge className="max-w-full border-0 shadow-md font-bold bg-amber-900 text-amber-100">
                  <History className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">Vintage</span>
                </Badge>
              )}
              {card.language && card.language !== "English" && (
                <Badge className="max-w-full bg-card text-foreground border border-border shadow-md">
                  <span className="truncate">{card.language}</span>
                </Badge>
              )}
              {myTotalClaimed > 0 && (
                <div className="max-w-full bg-success text-success-foreground px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-claim-pop shadow-claim">
                  <Check className="w-3 h-3 shrink-0" /> <span className="truncate">{myTotalClaimed} yours</span>
                </div>
              )}
            </div>
          )}
          {allMediaUrls.length > 1 && (
            <div className="absolute bottom-2 right-2">
              <div className="shrink-0 bg-black/60 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                <Images className="w-3 h-3" /> {allMediaUrls.length}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 space-y-2">
          <div>
            <h3 className="font-bold leading-tight truncate">{card.name}</h3>
            {card.item_type !== "card" && (
              <p className="text-xs font-semibold text-secondary-foreground truncate">
                {ITEM_TYPES.find((t) => t.value === card.item_type)?.label ?? card.item_type}
              </p>
            )}
            {(card.card_set || card.card_number || card.rarity || card.category) && (
              <p className="text-xs text-muted-foreground truncate">
                {[card.card_set, card.card_number && `#${card.card_number}`, card.rarity, card.category].filter(Boolean).join(" • ")}
              </p>
            )}
            {arrivalWindow && (
              <p className="text-xs font-semibold text-secondary flex items-center gap-1 mt-0.5">
                <Truck className="w-3 h-3" /> Arrives {arrivalWindow}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1">
              {isOnSale && (
                <span className="text-xs text-muted-foreground line-through">
                  {CURRENCY}{originalPrice.toFixed(0)}
                </span>
              )}
              <span className="font-display font-bold text-lg text-primary tabular-nums">
                {CURRENCY}{displayPrice.toFixed(0)}
              </span>
            </div>
          </div>

          {!soldOut && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center border border-border rounded-lg shrink-0">
                <button
                  className="w-6 h-7 flex items-center justify-center text-muted-foreground disabled:opacity-40"
                  onClick={() => setPickQuantity((q) => Math.max(1, q - 1))}
                  disabled={isClaimButtonDisabled || pickQuantity <= 1}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-5 text-center text-sm font-semibold">{Math.min(pickQuantity, maxPickable)}</span>
                <button
                  className="w-6 h-7 flex items-center justify-center text-muted-foreground disabled:opacity-40"
                  onClick={() => setPickQuantity((q) => Math.min(maxPickable, q + 1))}
                  disabled={isClaimButtonDisabled || pickQuantity >= maxPickable}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <Button
                size="sm"
                onClick={handleClaimClick}
                disabled={isClaimButtonDisabled}
                className={cn(
                  "flex-1 min-w-0 px-1.5 text-xs sm:text-sm text-primary-foreground font-bold",
                  isClaimButtonDisabled ? "bg-muted-foreground/50 cursor-not-allowed" : "gradient-gold hover:opacity-90 shadow-glow animate-pulse-glow"
                )}
              >
                <span className="truncate">{isSaleLive ? (card.is_preorder ? "Order" : "Claim") : "Coming Soon"}</span>
              </Button>
            </div>
          )}

          {myClaims.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/60">
              {myClaims.map((claim) => (
                <div key={claim.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{claim.quantity} unit{claim.quantity === 1 ? "" : "s"}</p>
                    {claim.status === "claimed" && (
                      <ClaimCountdown
                        claimedAt={claim.claimed_at}
                        onExpired={() => {
                          const toastId = toast.warning("Claim expired", { description: `${card.name} was released.` });
                          onUnclaim(claim, toastId);
                        }}
                        className="text-[10px] px-1.5 py-0.5"
                      />
                    )}
                    {claim.status === "checked_out" && (
                      <span className="text-[10px] text-success font-semibold">✓ Checked out</span>
                    )}
                  </div>
                  {claim.status === "claimed" && (
                    <Button size="sm" variant="outline" onClick={() => onUnclaim(claim)}>
                      Unclaim
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {allMediaUrls.length > 0 && (
        <MediaCarouselDialog
          open={isCarouselOpen}
          onOpenChange={setIsCarouselOpen}
          mediaUrls={allMediaUrls}
          initialIndex={initialMediaIndex}
        />
      )}
    </>
  );
}
