-- Groups line items placed in the same checkout action into one "order" --
-- finalize_claims batches every claim a buyer checks out at once under a
-- single order_id; mark_claim_as_sold gives each manually-closed sale its
-- own order_id (one item each, since those are closed one at a time).
-- photo_url is a snapshot of the product photo at time of sale, so order
-- history keeps its image even after the listing itself is edited/deleted.
ALTER TABLE public.transactions ADD COLUMN order_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.transactions ADD COLUMN photo_url text;
CREATE INDEX transactions_order_id_idx ON public.transactions (order_id);

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
