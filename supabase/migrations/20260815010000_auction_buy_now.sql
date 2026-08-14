-- Buy Now: lets a buyer instantly win a live, card-linked auction at that
-- card's current sale price, skipping the timer. Only available for
-- auctions created from an existing storefront card (source_card_id set) --
-- "New Item" auctions have no sale_price to anchor a price to. Also locked
-- out once bidding has already reached/passed that price, so nobody can
-- undercut an existing higher bidder.
--
-- Mirrors place_bid's guard checks (name/session required, blocked-bidder
-- check) and, like admin's "End Now", ends the auction immediately with a
-- winner recorded -- the admin still reaches out to the winner on WhatsApp
-- via the existing flow, same as any other auction win.

ALTER TABLE public.auction_items ADD COLUMN ended_via_buy_now boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.auction_items.ended_via_buy_now IS
  'True while the auction is sitting on an unpaid Buy Now purchase -- lets admin_resume_bidding tell those apart from a normal timer/bid-driven end and from an already-resumed one.';

CREATE OR REPLACE FUNCTION public.buy_now_auction(
  _auction_item_id uuid, _session_id text, _buyer_name text, _buyer_phone text
)
RETURNS public.auction_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  item public.auction_items;
  card_row public.cards;
  buy_now_price numeric;
BEGIN
  IF _buyer_name IS NULL OR TRIM(_buyer_name) = '' THEN
    RAISE EXCEPTION 'Name is required to buy now';
  END IF;
  IF _session_id IS NULL OR TRIM(_session_id) = '' THEN
    RAISE EXCEPTION 'Missing session';
  END IF;
  IF _buyer_phone IS NOT NULL AND EXISTS (SELECT 1 FROM public.blocked_bidders WHERE phone = _buyer_phone) THEN
    RAISE EXCEPTION 'This phone number is blocked from bidding — contact the seller.';
  END IF;

  PERFORM public.sync_auction_statuses();

  SELECT * INTO item FROM public.auction_items WHERE id = _auction_item_id FOR UPDATE;
  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;
  IF item.status <> 'live' THEN
    RAISE EXCEPTION 'This auction is not live';
  END IF;
  IF item.source_card_id IS NULL THEN
    RAISE EXCEPTION 'Buy Now is not available for this item';
  END IF;

  SELECT * INTO card_row FROM public.cards WHERE id = item.source_card_id;
  IF card_row.id IS NULL THEN
    RAISE EXCEPTION 'Buy Now is not available for this item';
  END IF;
  buy_now_price := COALESCE(card_row.sale_price, card_row.price);

  IF item.current_bid IS NOT NULL AND item.current_bid >= buy_now_price THEN
    RAISE EXCEPTION 'Buy Now is no longer available — bidding has already reached this price';
  END IF;

  INSERT INTO public.auction_bids (auction_item_id, buyer_name, buyer_phone, buyer_session_id, amount)
  VALUES (_auction_item_id, TRIM(_buyer_name), _buyer_phone, _session_id, buy_now_price);

  UPDATE public.auction_items
  SET status = 'ended',
      end_time = now(),
      ended_via_buy_now = true,
      current_bid = buy_now_price,
      current_bid_name = TRIM(_buyer_name),
      current_bid_session_id = _session_id,
      bid_count = bid_count + 1,
      winner_session_id = _session_id,
      winner_name = TRIM(_buyer_name),
      winner_amount = buy_now_price
  WHERE id = _auction_item_id
  RETURNING * INTO item;

  RETURN item;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_now_auction(uuid, text, text, text) TO anon, authenticated;

-- Admin-only: the Buy Now buyer didn't pay up. Rather than wiping the
-- auction back to starting_price (like banWinnerAndRerun does for a
-- non-paying *bid* winner), this restores whatever bid was winning right
-- before the buy-now purchase -- that bid is always the second-most-recent
-- auction_bids row for this item, since a buy-now can only fire while the
-- auction is live and immediately ends it, so nothing else could have been
-- bid after it. Falls back to a clean "no bids yet" state if the buy-now
-- was the very first action on this item.
CREATE OR REPLACE FUNCTION public.admin_resume_bidding(_auction_item_id uuid)
RETURNS public.auction_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  item public.auction_items;
  prev_bid public.auction_bids;
  duration_ms bigint;
BEGIN
  SELECT * INTO item FROM public.auction_items WHERE id = _auction_item_id FOR UPDATE;
  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;
  IF NOT item.ended_via_buy_now THEN
    RAISE EXCEPTION 'This auction was not ended via Buy Now';
  END IF;

  SELECT * INTO prev_bid FROM public.auction_bids
  WHERE auction_item_id = _auction_item_id
  ORDER BY created_at DESC
  OFFSET 1 LIMIT 1;

  -- Same duration it originally ran for, starting now -- matches
  -- banWinnerAndRerun's floor so a short auction doesn't resume for only
  -- a few leftover seconds.
  duration_ms := GREATEST(EXTRACT(EPOCH FROM (item.end_time - item.start_time)) * 1000, 60 * 60 * 1000);

  UPDATE public.auction_items
  SET status = 'live',
      end_time = now() + (duration_ms || ' milliseconds')::interval,
      ended_via_buy_now = false,
      current_bid = prev_bid.amount,
      current_bid_name = prev_bid.buyer_name,
      current_bid_session_id = prev_bid.buyer_session_id,
      bid_count = GREATEST(bid_count - 1, 0),
      winner_session_id = NULL,
      winner_name = NULL,
      winner_amount = NULL
  WHERE id = _auction_item_id
  RETURNING * INTO item;

  RETURN item;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_resume_bidding(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_resume_bidding(uuid) TO authenticated;
