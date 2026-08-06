import { Database } from "@/integrations/supabase/types";

type AuctionItem = Database["public"]["Tables"]["auction_items"]["Row"];

export type EffectiveAuctionStatus = "scheduled" | "live" | "ended" | "cancelled";

/** The stored `status` column only flips on a poll (sync_auction_statuses)
 * or the next bid, so it can lag behind the clock by up to that poll
 * interval. Compute what it *should* be right now from start_time/end_time
 * so countdowns and bid buttons react instantly instead of waiting. The
 * stored column stays authoritative for winner_name/winner_amount, which
 * only the DB can set. */
export function effectiveAuctionStatus(
  item: Pick<AuctionItem, "status" | "start_time" | "end_time" | "bid_count">,
  now: number = Date.now()
): EffectiveAuctionStatus {
  if (item.status === "cancelled") return "cancelled";
  if (item.status === "ended") return "ended";
  const start = new Date(item.start_time).getTime();
  const end = new Date(item.end_time).getTime();
  if (now < start) return "scheduled";
  // Zero-bid auctions get auto-extended by 24h server-side instead of
  // ending (see sync_auction_statuses) -- treat it as still live right up
  // until that actually happens, instead of flashing "ended / unsold" for
  // the few seconds until the next poll catches up.
  if (now >= end) return item.bid_count > 0 ? "ended" : "live";
  return "live";
}

/** Minimum amount the next bid must meet -- mirrors place_bid's own check
 * server-side, so the UI can show/validate it without a round trip. */
export function nextMinBid(
  item: Pick<AuctionItem, "current_bid" | "starting_price" | "bid_increment">
): number {
  return item.current_bid != null
    ? Number(item.current_bid) + Number(item.bid_increment)
    : Number(item.starting_price);
}

/** e.g. "2d 4h", "1h 05m 30s", "05m 30s" -- used for both the countdown to
 * an auction's start and its end. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}
