-- Notify the previous highest bidder (if any, and if it isn't the same
-- person re-bidding on themselves) that they've been outbid, via the same
-- Web Push infra as notify-auction-winner. Fire-and-forget: net.http_post
-- is async, so a slow/failed push never blocks or fails the bid itself.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.place_bid(
  _auction_item_id uuid, _session_id text, _buyer_name text, _buyer_phone text, _amount numeric
)
RETURNS public.auction_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  item public.auction_items;
  min_amount numeric;
  prev_session_id text;
BEGIN
  IF _buyer_name IS NULL OR TRIM(_buyer_name) = '' THEN
    RAISE EXCEPTION 'Name is required to bid';
  END IF;
  IF _session_id IS NULL OR TRIM(_session_id) = '' THEN
    RAISE EXCEPTION 'Missing session';
  END IF;
  IF _amount IS NULL OR _amount < 100 THEN
    RAISE EXCEPTION 'Minimum bid is ₹100';
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

  min_amount := COALESCE(item.current_bid + item.bid_increment, item.starting_price);
  IF _amount < min_amount THEN
    RAISE EXCEPTION 'Bid must be at least %', min_amount;
  END IF;

  prev_session_id := item.current_bid_session_id;

  INSERT INTO public.auction_bids (auction_item_id, buyer_name, buyer_phone, buyer_session_id, amount)
  VALUES (_auction_item_id, TRIM(_buyer_name), _buyer_phone, _session_id, _amount);

  UPDATE public.auction_items
  SET current_bid = _amount,
      current_bid_name = TRIM(_buyer_name),
      current_bid_session_id = _session_id,
      bid_count = bid_count + 1,
      end_time = end_time + interval '15 seconds'
  WHERE id = _auction_item_id
  RETURNING * INTO item;

  IF prev_session_id IS NOT NULL AND prev_session_id <> _session_id THEN
    PERFORM net.http_post(
      url := 'https://govervcxumkbpmnnotpr.supabase.co/functions/v1/notify-outbid',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvdmVydmN4dW1rYnBtbm5vdHByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NjM0ODMsImV4cCI6MjA4NTMzOTQ4M30.Gc-S3zX5kvHqeOrjYehJH3f6lNqUpu2Y0zB2DO-3t1I'
      ),
      body := jsonb_build_object(
        'outbid_session_id', prev_session_id,
        'new_amount', item.current_bid,
        'title', item.title
      )
    );
  END IF;

  RETURN item;
END;
$$;
