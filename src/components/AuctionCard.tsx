import { useEffect, useState } from "react";
import { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Gavel, Loader2, Trophy, Clock, ImageOff } from "lucide-react";
import { CURRENCY } from "@/config";
import { cn } from "@/lib/utils";
import { effectiveAuctionStatus, nextMinBid, formatCountdown } from "@/lib/auction";

type AuctionItem = Database["public"]["Tables"]["auction_items"]["Row"];

interface Props {
  item: AuctionItem;
  sessionId: string;
  buyerName: string;
  buyerPhone: string;
}

export function AuctionCard({ item, sessionId, buyerName, buyerPhone }: Props) {
  const [now, setNow] = useState(Date.now());
  const [customAmount, setCustomAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const status = effectiveAuctionStatus(item, now);
  const minBid = nextMinBid(item);
  const isMine = !!item.current_bid_session_id && item.current_bid_session_id === sessionId;

  const submitBid = async (amount: number) => {
    if (!buyerName) return;
    if (amount < minBid) {
      toast.error(`Minimum bid is ${CURRENCY}${minBid.toFixed(0)}`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("place_bid", {
      _auction_item_id: item.id,
      _session_id: sessionId,
      _buyer_name: buyerName,
      _buyer_phone: buyerPhone || null,
      _amount: amount,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Couldn't place bid");
    } else {
      toast.success(`Bid placed: ${CURRENCY}${amount.toFixed(0)}!`);
      setCustomAmount("");
    }
  };

  const statusBadge = {
    scheduled: <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-secondary-foreground">UPCOMING</span>,
    live: <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success text-success-foreground animate-pulse">● LIVE</span>,
    ended: <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">ENDED</span>,
    cancelled: <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/20 text-destructive">CANCELLED</span>,
  }[status];

  return (
    <Card className="gradient-card-bg border-border overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-muted flex items-center justify-center">
        {item.video_url ? (
          // preload="none" + controls -- video only starts fetching once the
          // buyer taps play, instead of every card in the grid streaming its
          // clip automatically. That autoplay was eating into Supabase's
          // monthly egress quota for no reason on cards nobody was watching.
          <video
            src={item.video_url}
            poster={item.photo_url ?? undefined}
            className="w-full h-full object-cover"
            controls
            muted
            playsInline
            preload="none"
          />
        ) : item.photo_url ? (
          <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <ImageOff className="w-8 h-8 text-muted-foreground" />
        )}
        <div className="absolute top-2 left-2">{statusBadge}</div>
        {status !== "ended" && status !== "cancelled" && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-background/80 backdrop-blur text-xs font-semibold">
            <Clock className="w-3 h-3" />
            {status === "scheduled" ? `Starts in ${formatCountdown(new Date(item.start_time).getTime() - now)}` : formatCountdown(new Date(item.end_time).getTime() - now)}
          </div>
        )}
      </div>

      <CardContent className="p-3 flex-1 flex flex-col gap-2">
        <div>
          <p className="font-bold truncate">{item.title}</p>
          {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-2.5 space-y-0.5">
          {status === "ended" ? (
            item.winner_name ? (
              <p className="text-sm flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="font-semibold">{item.winner_name}</span> won for{" "}
                <span className="font-bold">{CURRENCY}{Number(item.winner_amount).toFixed(0)}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No bids — unsold</p>
            )
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{item.current_bid != null ? "Current bid" : "Starting bid"}</p>
              <p className="text-xl font-black text-primary">
                {CURRENCY}{Number(item.current_bid ?? item.starting_price).toFixed(0)}
              </p>
              {item.current_bid_name && (
                <p className={cn("text-xs font-semibold", isMine ? "text-success" : "text-foreground")}>
                  {isMine ? "You're winning! 🎉" : `${item.current_bid_name} is winning`}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">{item.bid_count} bid{item.bid_count === 1 ? "" : "s"}</p>
            </>
          )}
        </div>

        {status === "live" && (
          <div className="space-y-1.5 mt-auto pt-1">
            <Button
              size="sm"
              className="w-full gradient-gold text-primary-foreground font-bold"
              disabled={submitting || !buyerName}
              onClick={() => submitBid(minBid)}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5 mr-1.5" />}
              Bid {CURRENCY}{minBid.toFixed(0)}
            </Button>
            <div className="flex gap-1.5">
              <Input
                type="number"
                inputMode="decimal"
                placeholder={`Custom (min ${CURRENCY}${minBid.toFixed(0)})`}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="h-9 text-sm"
                min={minBid}
                disabled={submitting || !buyerName}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={submitting || !buyerName || !customAmount}
                onClick={() => submitBid(Number(customAmount))}
              >
                Bid
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
