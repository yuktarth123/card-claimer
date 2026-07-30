import { Button } from "@/components/ui/button";
import { CardTile } from "@/components/CardTile";
import { Database } from "@/integrations/supabase/types";
import type { LucideIcon } from "lucide-react";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];

interface Props {
  cards: Card[];
  visible: Card[];
  loading: boolean;
  myClaimsByCard: Record<string, Claim[]>;
  onClaim: (card: Card, quantity: number) => void;
  onUnclaim: (claim: Claim, toastId?: string | number) => void;
  buyerName: string;
  isSaleLive: boolean;
  emptyIcon: LucideIcon;
  emptyMessage: string;
  noMatchMessage: string;
  onClearFilters: () => void;
}

// The loading-skeleton / empty-state / grid block shared by every
// single-category listing page (Singles, Slabs, Sealed, Accessories).
export function CategoryGrid({
  cards,
  visible,
  loading,
  myClaimsByCard,
  onClaim,
  onUnclaim,
  buyerName,
  isSaleLive,
  emptyIcon: EmptyIcon,
  emptyMessage,
  noMatchMessage,
  onClearFilters,
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <EmptyIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
        {cards.length === 0 ? (
          <p className="text-lg">{emptyMessage}</p>
        ) : (
          <>
            <p className="text-lg">{noMatchMessage}</p>
            <Button variant="outline" size="sm" onClick={onClearFilters} className="mt-3">
              Clear filters
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {visible.map((c) => (
        <CardTile
          key={c.id}
          card={c}
          myClaims={myClaimsByCard[c.id] || []}
          onClaim={onClaim}
          onUnclaim={onUnclaim}
          disabled={!buyerName && isSaleLive}
          isSaleLive={isSaleLive}
        />
      ))}
    </div>
  );
}
