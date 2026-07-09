-- ============================================================================
-- Full schema for a brand-new, empty Supabase project backing the Yanks TCG
-- Pokemon card live-sale app. Run this once, top to bottom, against a fresh
-- project. It supersedes every earlier migration in this folder -- those
-- were written against the old shared project and are kept only as history.
--
-- Security posture from day one:
--   - Public (anon) can SELECT cards/app_settings (storefront browsing) and
--     call the buyer-facing RPCs (claim, unclaim, checkout, leaderboards).
--   - Every write to cards/claims/sales/app_settings/transactions and every
--     admin-only RPC requires an authenticated session -- i.e. a logged-in
--     /admin user. Create that one admin account via Supabase Dashboard ->
--     Authentication -> Users -> Add user (email/password, "Auto Confirm
--     User" on) -- there is no public sign-up screen.
-- ============================================================================

-- --- Tables ----------------------------------------------------------------

CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  card_set text,
  card_number text,
  rarity text,
  tcg_image_url text,
  category text,
  item_type text NOT NULL DEFAULT 'card' CHECK (item_type IN ('card', 'sealed_product', 'accessory')),
  condition text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  sale_price numeric(10,2),
  pre_sale_price numeric(10,2),
  is_preorder boolean NOT NULL DEFAULT false,
  is_vintage boolean NOT NULL DEFAULT false,
  quantity_total integer NOT NULL DEFAULT 1 CHECK (quantity_total >= 0),
  quantity_available integer NOT NULL DEFAULT 1 CHECK (quantity_available >= 0),
  photo_url text,
  photo_urls text[] NOT NULL DEFAULT '{}',
  video_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sale_price_less_than_price CHECK (sale_price IS NULL OR sale_price <= price),
  CONSTRAINT chk_available_within_total CHECK (quantity_available <= quantity_total)
);

COMMENT ON COLUMN public.cards.category IS 'Free-text merchandising tag, e.g. a themed collection -- not a fixed enum';
COMMENT ON COLUMN public.cards.item_type IS 'Single card / sealed product (box, pack, ETB, tin) / accessory';
COMMENT ON COLUMN public.cards.quantity_total IS 'Total units originally listed';
COMMENT ON COLUMN public.cards.quantity_available IS 'Units currently unclaimed (denormalized stock counter)';
COMMENT ON COLUMN public.cards.photo_urls IS 'Additional gallery images beyond the primary photo_url cover image';

CREATE INDEX cards_sale_price_idx ON public.cards (sale_price);
CREATE INDEX cards_category_idx ON public.cards (category);

CREATE TABLE public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  buyer_name text NOT NULL,
  buyer_phone text,
  buyer_session_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'checked_out')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX claims_card_id_idx ON public.claims(card_id);
CREATE INDEX claims_session_idx ON public.claims(buyer_session_id);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  prize_text text,
  prize_image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sales_one_active_idx ON public.sales ((1)) WHERE ended_at IS NULL;

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_name text,
  buyer_phone text,
  buyer_session_id text,
  card_name text,
  final_price numeric(10,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  original_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  claim_id uuid REFERENCES public.claims(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  order_id uuid NOT NULL DEFAULT gen_random_uuid(),
  photo_url text,
  transaction_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.transactions.order_id IS 'Groups line items placed in the same checkout action into one order';
COMMENT ON COLUMN public.transactions.photo_url IS 'Snapshot of the product photo at time of sale, independent of the listing';

CREATE INDEX transactions_sale_id_idx ON public.transactions(sale_id);
CREATE INDEX transactions_order_id_idx ON public.transactions(order_id);

CREATE TABLE public.app_settings (
  id integer PRIMARY KEY,
  sale_start_time timestamptz,
  prize_rank_1_text text,
  prize_rank_1_image_url text,
  prize_rank_2_text text,
  prize_rank_2_image_url text,
  prize_rank_3_text text,
  prize_rank_3_image_url text,
  monthly_leaderboard_enabled boolean NOT NULL DEFAULT true,
  site_wide_sale_active boolean NOT NULL DEFAULT false,
  site_wide_sale_percent numeric
);

INSERT INTO public.app_settings (id) VALUES (1);

-- --- Row Level Security ------------------------------------------------------

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view cards" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert cards" ON public.cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update cards" ON public.cards FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete cards" ON public.cards FOR DELETE TO authenticated USING (true);

-- No public SELECT/INSERT here on purpose: buyers reach claims only through
-- claim_units/release_claim/finalize_claims/get_my_claims below, all
-- SECURITY DEFINER and unaffected by these policies. This is what keeps
-- buyer phone numbers from being readable via a raw REST call.
CREATE POLICY "Authenticated can view claims" ON public.claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can update claims" ON public.claims FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete claims" ON public.claims FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can write sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can write transactions" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Public can view app_settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated can write app_settings" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- Realtime ----------------------------------------------------------------

ALTER TABLE public.cards REPLICA IDENTITY FULL;
ALTER TABLE public.claims REPLICA IDENTITY FULL;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- --- Storage -----------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public) VALUES
  ('card-images', 'card-images', true),
  ('card-videos', 'card-videos', true),
  ('prize-images', 'prize-images', true);

CREATE POLICY "Public read card images" ON storage.objects FOR SELECT USING (bucket_id = 'card-images');
CREATE POLICY "Public read card videos" ON storage.objects FOR SELECT USING (bucket_id = 'card-videos');
CREATE POLICY "Public read prize images" ON storage.objects FOR SELECT USING (bucket_id = 'prize-images');

CREATE POLICY "Authenticated can upload card images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'card-images');
CREATE POLICY "Authenticated can delete card images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'card-images');
CREATE POLICY "Authenticated can upload card videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'card-videos');
CREATE POLICY "Authenticated can delete card videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'card-videos');
CREATE POLICY "Authenticated can upload prize images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'prize-images');
CREATE POLICY "Authenticated can delete prize images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'prize-images');

-- --- Functions ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_sale_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.sales WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1;
$$;

-- Matches CLAIM_DURATION_MINUTES in src/config.ts -- keep these in sync.
CREATE OR REPLACE FUNCTION public.release_expired_claims()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.cards c
  SET quantity_available = quantity_available + expired.total_qty
  FROM (
    SELECT card_id, SUM(quantity) AS total_qty
    FROM public.claims
    WHERE status = 'claimed' AND claimed_at < now() - interval '10 minutes'
    GROUP BY card_id
  ) expired
  WHERE c.id = expired.card_id;

  DELETE FROM public.claims
  WHERE status = 'claimed' AND claimed_at < now() - interval '10 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_units(
  _card_id UUID, _buyer_name TEXT, _session_id TEXT, _quantity INTEGER, _buyer_phone TEXT DEFAULT NULL
)
RETURNS public.claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  card_row public.cards;
  new_claim public.claims;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  PERFORM public.release_expired_claims();

  SELECT * INTO card_row FROM public.cards WHERE id = _card_id FOR UPDATE;
  IF card_row.id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF card_row.quantity_available < _quantity THEN
    RAISE EXCEPTION 'Only % left in stock', card_row.quantity_available;
  END IF;

  UPDATE public.cards SET quantity_available = quantity_available - _quantity WHERE id = _card_id;

  INSERT INTO public.claims (card_id, buyer_name, buyer_phone, buyer_session_id, quantity, unit_price, status, claimed_at)
  VALUES (_card_id, _buyer_name, _buyer_phone, _session_id, _quantity, COALESCE(card_row.sale_price, card_row.price), 'claimed', now())
  RETURNING * INTO new_claim;

  RETURN new_claim;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_claim(_claim_id UUID, _session_id TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claim_row public.claims;
BEGIN
  SELECT * INTO claim_row FROM public.claims
  WHERE id = _claim_id AND buyer_session_id = _session_id AND status = 'claimed'
  FOR UPDATE;

  IF claim_row.id IS NULL THEN
    RAISE EXCEPTION 'Claim not found or not yours';
  END IF;

  UPDATE public.cards SET quantity_available = quantity_available + claim_row.quantity WHERE id = claim_row.card_id;
  DELETE FROM public.claims WHERE id = _claim_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_claim(_claim_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claim_row public.claims;
BEGIN
  SELECT * INTO claim_row FROM public.claims WHERE id = _claim_id FOR UPDATE;
  IF claim_row.id IS NULL THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  UPDATE public.cards SET quantity_available = quantity_available + claim_row.quantity WHERE id = claim_row.card_id;
  DELETE FROM public.transactions WHERE claim_id = _claim_id;
  DELETE FROM public.claims WHERE id = _claim_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_claims(_session_id TEXT)
RETURNS SETOF public.claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  active_sale uuid;
  _order_id uuid := gen_random_uuid();
BEGIN
  active_sale := public.get_active_sale_id();

  UPDATE public.claims SET status = 'checked_out'
  WHERE buyer_session_id = _session_id AND status = 'claimed';

  INSERT INTO public.transactions (buyer_name, buyer_phone, buyer_session_id, card_name, final_price, quantity, original_card_id, claim_id, sale_id, order_id, photo_url)
  SELECT cl.buyer_name, cl.buyer_phone, cl.buyer_session_id, c.name, cl.quantity * cl.unit_price, cl.quantity, cl.card_id, cl.id, active_sale, _order_id, c.photo_url
  FROM public.claims cl
  JOIN public.cards c ON c.id = cl.card_id
  WHERE cl.buyer_session_id = _session_id AND cl.status = 'checked_out'
    AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.claim_id = cl.id);

  RETURN QUERY SELECT * FROM public.claims WHERE buyer_session_id = _session_id AND status = 'checked_out';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_claim_as_sold(_claim_id UUID, _buyer_name TEXT, _final_price NUMERIC, _buyer_phone TEXT DEFAULT NULL)
RETURNS public.claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claim_row public.claims;
  card_row public.cards;
  active_sale uuid;
  _order_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO claim_row FROM public.claims WHERE id = _claim_id FOR UPDATE;
  IF claim_row.id IS NULL THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  active_sale := public.get_active_sale_id();

  UPDATE public.claims
  SET status = 'checked_out', buyer_name = _buyer_name, buyer_phone = COALESCE(_buyer_phone, buyer_phone)
  WHERE id = _claim_id
  RETURNING * INTO claim_row;

  SELECT * INTO card_row FROM public.cards WHERE id = claim_row.card_id;

  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE claim_id = _claim_id) THEN
    INSERT INTO public.transactions (buyer_name, buyer_phone, card_name, final_price, quantity, original_card_id, claim_id, transaction_date, sale_id, order_id, photo_url)
    VALUES (_buyer_name, claim_row.buyer_phone, card_row.name, _final_price, claim_row.quantity, claim_row.card_id, _claim_id, now(), active_sale, _order_id, card_row.photo_url);
  END IF;

  RETURN claim_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_claims(_session_id text)
RETURNS SETOF public.claims
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.claims WHERE buyer_session_id = _session_id;
$$;

CREATE OR REPLACE FUNCTION public.start_sale(_name text)
RETURNS public.sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_sale public.sales;
BEGIN
  UPDATE public.sales SET ended_at = now() WHERE ended_at IS NULL;
  INSERT INTO public.sales (name) VALUES (COALESCE(NULLIF(TRIM(_name), ''), 'Untitled Sale'))
  RETURNING * INTO new_sale;
  RETURN new_sale;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_active_sale()
RETURNS public.sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ended public.sales;
BEGIN
  UPDATE public.sales SET ended_at = now() WHERE ended_at IS NULL RETURNING * INTO ended;
  RETURN ended;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_sales()
RETURNS TABLE(id uuid, name text, started_at timestamptz, ended_at timestamptz, transaction_count bigint, total_xp numeric, prize_text text, prize_image_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name, s.started_at, s.ended_at,
    COUNT(t.id)::bigint AS transaction_count,
    COALESCE(SUM(t.final_price), 0)::numeric AS total_xp,
    s.prize_text, s.prize_image_url
  FROM public.sales s
  LEFT JOIN public.transactions t ON t.sale_id = s.id
  GROUP BY s.id
  ORDER BY s.started_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.update_sale_prize(_sale_id uuid, _prize_text text, _prize_image_url text)
RETURNS public.sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated public.sales;
BEGIN
  UPDATE public.sales SET prize_text = _prize_text, prize_image_url = _prize_image_url
  WHERE id = _sale_id
  RETURNING * INTO updated;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_leaderboard()
RETURNS TABLE(buyer_name text, xp numeric, purchases bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH grouped AS (
    SELECT
      COALESCE(NULLIF(TRIM(buyer_name), ''), 'Anonymous Trainer') AS buyer_name,
      COALESCE(NULLIF(TRIM(buyer_phone), ''), buyer_session_id, gen_random_uuid()::text) AS identity_key,
      final_price
    FROM public.transactions
    WHERE transaction_date >= date_trunc('month', now())
      AND transaction_date < date_trunc('month', now()) + interval '1 month'
  )
  SELECT buyer_name, SUM(final_price)::numeric AS xp, COUNT(*)::bigint AS purchases
  FROM grouped GROUP BY buyer_name, identity_key ORDER BY xp DESC, purchases DESC LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.get_sale_leaderboard(_sale_id uuid)
RETURNS TABLE(buyer_name text, xp numeric, purchases bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH grouped AS (
    SELECT
      COALESCE(NULLIF(TRIM(buyer_name), ''), 'Anonymous Trainer') AS buyer_name,
      COALESCE(NULLIF(TRIM(buyer_phone), ''), buyer_session_id, gen_random_uuid()::text) AS identity_key,
      final_price
    FROM public.transactions
    WHERE sale_id = _sale_id
  )
  SELECT buyer_name, SUM(final_price)::numeric AS xp, COUNT(*)::bigint AS purchases
  FROM grouped GROUP BY buyer_name, identity_key ORDER BY xp DESC, purchases DESC LIMIT 100;
$$;

-- Fixes a real bug: a card added (or a discount % changed) while a
-- site-wide sale is already active never got its pre_sale_price backed up,
-- so ending the sale would wipe that card's price to NULL instead of
-- restoring it. This trigger backs up any card the moment it's inserted
-- while a site-wide sale is running, so apply_site_wide_sale below never
-- has to guess whether a row is "new".
CREATE OR REPLACE FUNCTION public.handle_new_card_during_site_wide_sale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  settings_row public.app_settings;
BEGIN
  SELECT * INTO settings_row FROM public.app_settings WHERE id = 1;
  IF settings_row.site_wide_sale_active THEN
    NEW.pre_sale_price := NEW.sale_price;
    NEW.sale_price := ROUND(NEW.price * (1 - settings_row.site_wide_sale_percent / 100.0));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_new_card_site_wide_sale
BEFORE INSERT ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.handle_new_card_during_site_wide_sale();

CREATE OR REPLACE FUNCTION public.apply_site_wide_sale(_percent numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _percent IS NULL OR _percent <= 0 OR _percent >= 100 THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 100';
  END IF;

  -- Only back up on the inactive -> active transition; cards added while
  -- already active are backed up individually by the trigger above.
  UPDATE public.cards
  SET pre_sale_price = sale_price
  WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = 1 AND site_wide_sale_active = true);

  UPDATE public.cards SET sale_price = ROUND(price * (1 - _percent / 100.0));

  UPDATE public.app_settings SET site_wide_sale_active = true, site_wide_sale_percent = _percent WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_site_wide_sale()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.cards SET sale_price = pre_sale_price, pre_sale_price = NULL;
  UPDATE public.app_settings SET site_wide_sale_active = false, site_wide_sale_percent = NULL WHERE id = 1;
END;
$$;

-- --- Grants ------------------------------------------------------------------

-- Buyer-facing / public: usable without logging in.
GRANT EXECUTE ON FUNCTION public.release_expired_claims() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_units(uuid, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_claim(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_claims(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_claims(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_sales() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_leaderboard(uuid) TO anon, authenticated;

-- Admin-only: requires a logged-in /admin session.
GRANT EXECUTE ON FUNCTION public.admin_release_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_claim_as_sold(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_sale(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_active_sale() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_sale_prize(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_site_wide_sale(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_site_wide_sale() TO authenticated;
