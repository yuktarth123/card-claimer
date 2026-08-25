-- Anti-sniping: every bid pushes the auction's end_time out by 15 seconds,
-- so a last-second bid always leaves time for a counter-bid instead of
-- silently winning right as the clock hits zero.
CREATE OR REPLACE FUNCTION public.place_bid(
  _auction_item_id uuid, _session_id text, _buyer_name text, _buyer_phone text, _amount numeric
)
RETURNS public.auction_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  item public.auction_items;
  min_amount numeric;
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

  RETURN item;
END;
$$;
