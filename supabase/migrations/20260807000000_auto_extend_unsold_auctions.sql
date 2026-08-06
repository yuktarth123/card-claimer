-- If an auction's timer runs out with zero bids, give it another 24 hours
-- instead of ending it unsold -- repeats indefinitely until either someone
-- bids or the admin steps in (Cancel, or Delete). "End Now" in the admin
-- panel bypasses this entirely: it sets status='ended' directly rather
-- than just nudging end_time, so it isn't undone by the extension below.
CREATE OR REPLACE FUNCTION public.sync_auction_statuses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.auction_items
  SET status = 'live'
  WHERE status = 'scheduled' AND start_time <= now() AND end_time > now();

  UPDATE public.auction_items
  SET end_time = end_time + interval '24 hours'
  WHERE status IN ('scheduled', 'live') AND end_time <= now() AND bid_count = 0;

  UPDATE public.auction_items
  SET status = 'ended',
      winner_session_id = current_bid_session_id,
      winner_name = current_bid_name,
      winner_amount = current_bid
  WHERE status IN ('scheduled', 'live') AND end_time <= now();
END;
$$;
