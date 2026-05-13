import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CURRENCY, CLAIM_DURATION_MINUTES } from "@/config";
import type { Database } from "@/integrations/supabase/types";
import { Sparkles, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import ClaimCountdown from "./ClaimCountdown";
import { addMinutes, isPast } from "date-fns";
import React, { useState, useMemo } from "react";
import MediaCarouselDialog from "./MediaCarouselDialog";

type Card = Database["public"]["Tables"]["cards"]["Row"];

interface Props {
  card: Card;
  isMine: boolean;
  onClaim: (card: Card) => void;
  onUnclaim: (card: Card) => void;
  disabled?: boolean;
  isSaleLive: boolean;
}

export function CardTile({ card, isMine, onClaim, onUnclaim, disabled, isSaleLive }: Props) {
  const claimed = card.status !== "available";
  const soldOut = card.status === "checked_out";
  const isClaimButtonDisabled = disabled || !isSaleLive;

  const claimedAtDate = card.claimed_at ? new Date(card.claimed_at) : null;
  const isClaimExpired = claimedAtDate ? isPast(addMinutes(claimedAtDate, CLAIM_DURATION_MINUTES)) : false;

  const handleUnclaimOnExpire = () => {
    if (isMine && isClaimExpired) {
      onUnclaim(card);
    }
  };

  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [initialMediaIndex, setInitialMediaIndex] = useState(0);

  const allMediaUrls = useMemo(() => {
    const urls: string[] = [];
    if (card.video_url) urls.push(card.video_url);
    if (card.photo_url) urls.push(card.photo_url);
    if (card.tcg_image_url && !urls.includes(card.tcg_image_url)) urls.push(card.tcg_image_url);
    return urls.filter(Boolean);
  }, [card.video_url, card.photo_url, card.tcg_image_url]);

  const handleMediaClick = (clickedUrl: string) => {
    const index = allMediaUrls.indexOf(clickedUrl);
    if (index !== -1) {
      setInitialMediaIndex(index);
      setIsCarouselOpen(true);
    }
  };

  const currentDisplayMediaUrl = card.video_url || card.photo_url || card.tcg_image_url;

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-2xl gradient-card-bg border border-border shadow-card-pop animate-fade-in transition-all",
          claimed && !isMine && "opacity-60 grayscale",
          isMine && "ring-2 ring-success shadow-claim",
          isMine && isClaimExpired && "ring-2 ring-destructive shadow-none opacity-80"
        )}
      >
        <div
          className="aspect-[3/4] w-full overflow-hidden bg-muted relative cursor-pointer"
          onClick={() => currentDisplayMediaUrl && handleMediaClick(currentDisplayMediaUrl)}
        >
          {currentDisplayMediaUrl ? (
            card.video_url ? (
              <video
                src={card.video_url}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                autoPlay
                loop
                muted
                playsInline
              />
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
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
            {card.condition && (
              <Badge className="bg-card text-foreground border border-border shadow-md">
                {card.condition}
              </Badge>
            )}
            {card.rarity && (
              <Badge className="gradient-gold text-primary-foreground border-0 shadow-md">
                {card.rarity}
              </Badge>
            )}
          </div>
          {claimed && !isMine && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-claim-pop">
              <div className="text-center px-4">
                <Lock className="w-7 h-7 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{soldOut ? "Sold to" : "Claimed by"}</p>
                <p className="font-bold text-foreground truncate max-w-[140px]">{card.claimed_by}</p>
              </div>
            </div>
          )}
          {isMine && (
            <>
              <div className="absolute top-2 left-2">
                <div className="bg-success text-success-foreground px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-claim-pop shadow-claim">
                  <Check className="w-3 h-3" /> Yours
                </div>
              </div>
              {card.claimed_at && (
                <div className="absolute bottom-2 left-2">
                  <ClaimCountdown claimedAt={card.claimed_at} onExpired={handleUnclaimOnExpire} className="text-[10px] px-1.5 py-0.5" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-3 space-y-2">
          <div>
            <h3 className="font-bold leading-tight truncate">{card.name}</h3>
            {card.card_set && (
              <p className="text-xs text-muted-foreground truncate">{card.card_set}</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-black text-lg text-primary">
              {CURRENCY}{Number(card.price).toFixed(0)}
            </span>
            {isMine ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUnclaim(card)}
                disabled={disabled || isClaimExpired}
              >
                {isClaimExpired ? "Expired" : "Unclaim"}
              </Button>
            ) : claimed ? (
              <Button size="sm" disabled variant="secondary">
                {soldOut ? "Sold" : "Claimed"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onClaim(card)}
                disabled={isClaimButtonDisabled}
                className={cn(
                  "text-primary-foreground font-bold",
                  isClaimButtonDisabled ? "bg-muted-foreground/50 cursor-not-allowed" : "gradient-gold hover:opacity-90 shadow-glow animate-pulse-glow"
                )}
              >
                {isSaleLive ? "Claim" : "Coming Soon"}
              </Button>
            )}
          </div>
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