-- Bidding / auctions feature: admin can put any number of items (existing
-- cards or brand-new ones) up for timed auction. Buyers bid ₹100 increments
-- (or a custom amount) using the same anonymous name+phone identity as
-- claiming; highest bid when the timer ends wins.
--
-- Privacy posture matches claims: buyer_phone never lives on a
-- publicly-readable row. auction_items (public SELECT) only ever exposes
-- the winning bidder's *name*, never their phone -- phone numbers stay in
-- auction_bids, which is authenticated-only, same as claims.

-- --- Tables ------------------------------------------------------------------

CREATE TABLE public.auction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  photo_url text,
  photo_urls text[] NOT NULL DEFAULT '{}',
  video_url text,
  starting_price numeric(10,2) NOT NULL DEFAULT 100,
  bid_increment numeric(10,2) NOT NULL DEFAULT 100,
  current_bid numeric(10,2),
  current_bid_name text,
  current_bid_session_id text,
  bid_count integer NOT NULL DEFAULT 0,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  winner_session_id text,
  winner_name text,
  winner_amount numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_auction_end_after_start CHECK (end_time > start_time),
  -- ₹100 is a hard floor, not just a default -- admin can raise the starting
  -- price or increment for a given auction but never go below it, so no
  -- custom bid can ever undercut ₹100 regardless of per-auction settings.
  CONSTRAINT chk_starting_price_floor CHECK (starting_price >= 100),
  CONSTRAINT chk_bid_increment_floor CHECK (bid_increment >= 100)
);

CREATE INDEX auction_items_status_idx ON public.auction_items(status);

CREATE TABLE public.auction_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_item_id uuid NOT NULL REFERENCES public.auction_items(id) ON DELETE CASCADE,
  buyer_name text NOT NULL,
  buyer_phone text,
  buyer_session_id text NOT NULL,
  amount numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auction_bids_item_idx ON public.auction_bids(auction_item_id);
CREATE INDEX auction_bids_session_idx ON public.auction_bids(buyer_session_id);

-- Winners who don't pay get their phone added here by the admin; place_bid
-- checks it so they can't just re-enter a new name and keep bidding.
CREATE TABLE public.blocked_bidders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  reason text,
  blocked_at timestamptz NOT NULL DEFAULT now()
);

-- --- Row Level Security --------------------------------------------------------

ALTER TABLE public.auction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_bidders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view auction items" ON public.auction_items FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert auction items" ON public.auction_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update auction items" ON public.auction_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete auction items" ON public.auction_items FOR DELETE TO authenticated USING (true);

-- No public SELECT/INSERT here on purpose, same reasoning as claims: buyers
-- reach auction_bids only through place_bid/get_my_bids below, both
-- SECURITY DEFINER. Keeps buyer_phone out of a raw REST call.
CREATE POLICY "Authenticated can view bids" ON public.auction_bids FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can manage blocked bidders" ON public.blocked_bidders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- Realtime ------------------------------------------------------------------

ALTER TABLE public.auction_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_items;

-- --- Functions -------------------------------------------------------------

-- Flips scheduled -> live and live -> ended based on start_time/end_time.
-- Polled from the client (like release_expired_claims) and also run inline
-- at the top of place_bid, so a bid can never sneak in on a technically-
-- expired auction just because nobody has polled yet.
CREATE OR REPLACE FUNCTION public.sync_auction_statuses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.auction_items
  SET status = 'live'
  WHERE status = 'scheduled' AND start_time <= now() AND end_time > now();

  UPDATE public.auction_items
  SET status = 'ended',
      winner_session_id = current_bid_session_id,
      winner_name = current_bid_name,
      winner_amount = current_bid
  WHERE status IN ('scheduled', 'live') AND end_time <= now();
END;
$$;

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
      bid_count = bid_count + 1
  WHERE id = _auction_item_id
  RETURNING * INTO item;

  RETURN item;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_bids(_session_id text)
RETURNS SETOF public.auction_bids
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.auction_bids WHERE buyer_session_id = _session_id ORDER BY created_at DESC;
$$;

-- --- Grants ------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.sync_auction_statuses() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_bid(uuid, text, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_bids(text) TO anon, authenticated;
