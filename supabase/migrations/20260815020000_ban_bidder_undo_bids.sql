-- Ban a bidder by phone and retroactively undo their currently-winning bids
-- across every live auction. Complements the existing per-ended-item
-- "Ban winner & rerun" flow (banWinnerAndRerun in AuctionManager.tsx) --
-- that one only fires post-hoc on an auction's declared winner once it has
-- already ended. This one is for a troll who is CURRENTLY winning one or
-- more live auctions (e.g. a fake inflated bid) and needs pulling out
-- immediately, everywhere, not just on whichever single item the admin
-- happened to notice.
--
-- Walks back past every consecutive bid from a banned session on each
-- affected item, not just the single most recent one -- a troll can place
-- several escalating bids in a row (e.g. bidding against themselves), so
-- the correct restore point is the most recent bid NOT placed under any
-- session this phone has ever bid from.

CREATE OR REPLACE FUNCTION public.admin_ban_and_undo_bids(_phone text, _reason text DEFAULT NULL)
RETURNS SETOF public.auction_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  banned_sessions text[];
  item public.auction_items;
  restore_bid public.auction_bids;
BEGIN
  IF _phone IS NULL OR TRIM(_phone) = '' THEN
    RAISE EXCEPTION 'Phone is required';
  END IF;

  INSERT INTO public.blocked_bidders (phone, reason, blocked_at)
  VALUES (_phone, _reason, now())
  ON CONFLICT (phone) DO UPDATE SET reason = EXCLUDED.reason, blocked_at = EXCLUDED.blocked_at;

  SELECT array_agg(DISTINCT buyer_session_id) INTO banned_sessions
  FROM public.auction_bids
  WHERE buyer_phone = _phone;

  -- Nobody ever bid under this phone (e.g. admin pre-emptively blocking a
  -- number) -- nothing to sweep, just the ban above.
  IF banned_sessions IS NULL THEN
    RETURN;
  END IF;

  FOR item IN
    SELECT * FROM public.auction_items
    WHERE status = 'live'
      AND current_bid_session_id = ANY(banned_sessions)
    FOR UPDATE
  LOOP
    SELECT * INTO restore_bid
    FROM public.auction_bids
    WHERE auction_item_id = item.id
      AND buyer_session_id <> ALL(banned_sessions)
    ORDER BY created_at DESC
    LIMIT 1;

    -- restore_bid's fields are all NULL when no legitimate bid remains --
    -- that correctly resets the item to a clean "no bids yet" state.
    UPDATE public.auction_items
    SET current_bid = restore_bid.amount,
        current_bid_name = restore_bid.buyer_name,
        current_bid_session_id = restore_bid.buyer_session_id,
        bid_count = (
          SELECT count(*) FROM public.auction_bids
          WHERE auction_item_id = item.id AND buyer_session_id <> ALL(banned_sessions)
        )
    WHERE id = item.id
    RETURNING * INTO item;

    RETURN NEXT item;
  END LOOP;
END;
$$;

-- Supabase's default privileges grant EXECUTE on every new function
-- directly to anon (not just via the PUBLIC pseudo-role), so both must be
-- revoked explicitly or anon keeps access despite the PUBLIC revoke alone.
REVOKE EXECUTE ON FUNCTION public.admin_ban_and_undo_bids(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban_and_undo_bids(text, text) TO authenticated;
