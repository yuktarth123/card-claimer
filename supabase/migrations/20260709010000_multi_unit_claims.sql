-- ============================================================================
-- Move from "1 unique card row = 1 claim" to "1 listing = N units in stock,
-- multiple buyers can claim units of the same listing". This is what lets a
-- single listing (e.g. a booster box, or several copies of the same card)
-- be claimed by more than one buyer at once, instead of needing a duplicate
-- row per copy.
--
-- Existing in-flight claims (status = 'claimed'/'checked_out' on `cards`)
-- are migrated into the new `claims` table below before the old per-row
-- claim columns are dropped, so nothing in progress is lost.
-- ============================================================================

-- 1. Stock columns on cards.
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS quantity_total integer NOT NULL DEFAULT 1 CHECK (quantity_total >= 0),
  ADD COLUMN IF NOT EXISTS quantity_available integer NOT NULL DEFAULT 1 CHECK (quantity_available >= 0);

UPDATE public.cards
SET quantity_available = CASE WHEN status = 'available' THEN 1 ELSE 0 END;

-- 2. Per-claim table: one row per "buyer claims N units of this listing".
CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_session_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'checked_out')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_card_id_idx ON public.claims(card_id);
CREATE INDEX IF NOT EXISTS claims_session_idx ON public.claims(buyer_session_id);

-- 3. Backfill: carry any card currently mid-claim over into its own claims row.
INSERT INTO public.claims (card_id, buyer_name, buyer_phone, buyer_session_id, quantity, unit_price, status, claimed_at)
SELECT id, claimed_by, buyer_phone, buyer_session_id, 1, COALESCE(sale_price, price), status, COALESCE(claimed_at, now())
FROM public.cards
WHERE status IN ('claimed', 'checked_out') AND buyer_session_id IS NOT NULL;

-- RLS is restricted to authenticated reads from day one (this table holds
-- buyer phone numbers); buyers get their own claims back only through the
-- get_my_claims() RPC below, which is SECURITY DEFINER and scoped to their
-- session id.
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view claims" ON public.claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can update claims" ON public.claims FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete claims" ON public.claims FOR DELETE TO authenticated USING (true);

ALTER TABLE public.claims REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;

-- 4. Transactions gain quantity + a link back to the specific claim (a card can
--    now generate many transactions, so original_card_id is no longer unique).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS claim_id uuid REFERENCES public.claims(id) ON DELETE SET NULL;

-- 5. Drop the old single-claim functions; per-row claim columns on cards go
--    away now that claims live in their own table.
DROP FUNCTION IF EXISTS public.claim_card(uuid, text, text);
DROP FUNCTION IF EXISTS public.claim_card(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.unclaim_card(uuid, text);
DROP FUNCTION IF EXISTS public.mark_card_as_sold(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.mark_card_as_sold(uuid, text, numeric, text);
DROP FUNCTION IF EXISTS public.finalize_claims(text);

ALTER TABLE public.cards
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS claimed_by,
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS buyer_session_id,
  DROP COLUMN IF EXISTS buyer_phone;

-- 6. Opportunistic cleanup of stale claims (buyer claimed but never checked
--    out within CLAIM_DURATION_MINUTES). Called at the start of claim_units
--    and can also be polled from the client.
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

-- 7. Atomically claim N units of a listing.
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

-- 8. Buyer releases their own still-pending claim.
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

-- 9. Admin force-release (works on pending OR already-sold claims, e.g. a
--    buyer backed out after payment). Also removes any linked transaction.
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

-- 10. Buyer taps "Finalize via WhatsApp" -> lock in all their pending claims.
CREATE OR REPLACE FUNCTION public.finalize_claims(_session_id TEXT)
RETURNS SETOF public.claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  active_sale uuid;
BEGIN
  active_sale := public.get_active_sale_id();

  UPDATE public.claims SET status = 'checked_out'
  WHERE buyer_session_id = _session_id AND status = 'claimed';

  INSERT INTO public.transactions (buyer_name, buyer_phone, buyer_session_id, card_name, final_price, quantity, original_card_id, claim_id, sale_id)
  SELECT cl.buyer_name, cl.buyer_phone, cl.buyer_session_id, c.name, cl.quantity * cl.unit_price, cl.quantity, cl.card_id, cl.id, active_sale
  FROM public.claims cl
  JOIN public.cards c ON c.id = cl.card_id
  WHERE cl.buyer_session_id = _session_id AND cl.status = 'checked_out'
    AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.claim_id = cl.id);

  RETURN QUERY SELECT * FROM public.claims WHERE buyer_session_id = _session_id AND status = 'checked_out';
END;
$$;

-- 11. Admin manually marks a specific claim as sold (e.g. cash/in-person sale).
CREATE OR REPLACE FUNCTION public.mark_claim_as_sold(_claim_id UUID, _buyer_name TEXT, _final_price NUMERIC, _buyer_phone TEXT DEFAULT NULL)
RETURNS public.claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claim_row public.claims;
  card_row public.cards;
  active_sale uuid;
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
    INSERT INTO public.transactions (buyer_name, buyer_phone, card_name, final_price, quantity, original_card_id, claim_id, transaction_date, sale_id)
    VALUES (_buyer_name, claim_row.buyer_phone, card_row.name, _final_price, claim_row.quantity, claim_row.card_id, _claim_id, now(), active_sale);
  END IF;

  RETURN claim_row;
END;
$$;

-- 12. Buyer reads back their own pending/checked-out claims by session id.
CREATE OR REPLACE FUNCTION public.get_my_claims(_session_id text)
RETURNS SETOF public.claims
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.claims WHERE buyer_session_id = _session_id;
$$;

GRANT EXECUTE ON FUNCTION public.release_expired_claims() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_units(uuid, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_claim(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_claims(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_claims(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_claim_as_sold(uuid, text, numeric, text) TO authenticated;
