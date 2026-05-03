import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CURRENCY } from "@/config";
import { Database } from "@/integrations/supabase/types";
import { Sparkles, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Card = Database["public"]["Tables"]["cards"]["Row"];

interface Props {
  card: Card;
  isMine: boolean;
  onClaim: (card: Card) => void;
  onUnclaim: (card: Card) => void;
  disabled?: boolean;
}

export function CardTile({ card, isMine, onClaim, onUnclaim, disabled }: Props) {
  const claimed = card.status === "claimed";
  // Prioritize uploaded photo_url over tcg_image_url
  const img = card.photo_url || card.tcg_image_url;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl gradient-card-bg border border-border shadow-card-pop animate-fade-in transition-all",
        claimed && !isMine && "opacity-60 grayscale",
        isMine && "ring-2 ring-success shadow-claim",
      )}
    >
      <div className="aspect-[3/4] w-full overflow-hidden bg-muted relative">
        {img ? (
          <img
            src={img}
            alt={card.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Sparkles className="w-10 h-10" />
          </div>
        )}
        {card.rarity && (
          <Badge className="absolute top-2 right-2 gradient-gold text-primary-foreground border-0 shadow-md">
            {card.rarity}
          </Badge>
        )}
        {claimed && !isMine && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-claim-pop">
            <div className="text-center px-4">
              <Lock className="w-7 h-7 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Claimed by</p>
              <p className="font-bold text-foreground truncate max-w-[140px]">{card.claimed_by}</p>
            </div>
          </div>
        )}
        {isMine && (
          <div className="absolute top-2 left-2 bg-success text-success-foreground px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-claim-pop shadow-claim">
            <Check className="w-3 h-3" /> Yours
          </div>
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
              disabled={disabled}
            >
              Unclaim
            </Button>
          ) : claimed ? (
            <Button size="sm" disabled variant="secondary">
              Claimed
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onClaim(card)}
              disabled={disabled}
              className="gradient-gold text-primary-foreground hover:opacity-90 font-bold shadow-glow animate-pulse-glow"
            >
              Claim
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}