
-- Sales table
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sales" ON public.sales FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sales" ON public.sales FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sales" ON public.sales FOR UPDATE USING (true) WITH CHECK (true);

-- Only one active sale at a time (ended_at IS NULL)
CREATE UNIQUE INDEX sales_one_active_idx ON public.sales ((1)) WHERE ended_at IS NULL;

-- Add sale_id to transactions
ALTER TABLE public.transactions ADD COLUMN sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;
CREATE INDEX transactions_sale_id_idx ON public.transactions(sale_id);

-- Helper: get currently active sale id
CREATE OR REPLACE FUNCTION public.get_active_sale_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.sales WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1;
$$;

-- Start a new sale (ends the current active one first)
CREATE OR REPLACE FUNCTION public.start_sale(_name text)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- End the active sale
CREATE OR REPLACE FUNCTION public.end_active_sale()
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ended public.sales;
BEGIN
  UPDATE public.sales SET ended_at = now()
  WHERE ended_at IS NULL
  RETURNING * INTO ended;
  RETURN ended;
END;
$$;

-- List sales
CREATE OR REPLACE FUNCTION public.list_sales()
RETURNS TABLE(id uuid, name text, started_at timestamptz, ended_at timestamptz, transaction_count bigint, total_xp numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.started_at, s.ended_at,
    COUNT(t.id)::bigint AS transaction_count,
    COALESCE(SUM(t.final_price), 0)::numeric AS total_xp
  FROM public.sales s
  LEFT JOIN public.transactions t ON t.sale_id = s.id
  GROUP BY s.id
  ORDER BY s.started_at DESC;
$$;

-- Per-sale leaderboard
CREATE OR REPLACE FUNCTION public.get_sale_leaderboard(_sale_id uuid)
RETURNS TABLE(buyer_name text, xp numeric, purchases bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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
  FROM grouped
  GROUP BY buyer_name, identity_key
  ORDER BY xp DESC, purchases DESC
  LIMIT 100;
$$;

-- Update finalize_claims to attach active sale
CREATE OR REPLACE FUNCTION public.finalize_claims(_session_id text)
RETURNS SETOF public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_sale uuid;
BEGIN
  active_sale := public.get_active_sale_id();

  UPDATE public.cards
  SET status = 'checked_out'
  WHERE buyer_session_id = _session_id AND status = 'claimed';

  INSERT INTO public.transactions (buyer_name, buyer_phone, buyer_session_id, card_name, final_price, original_card_id, sale_id)
  SELECT c.claimed_by, c.buyer_phone, c.buyer_session_id, c.name, COALESCE(c.sale_price, c.price), c.id, active_sale
  FROM public.cards c
  WHERE c.buyer_session_id = _session_id AND c.status = 'checked_out'
    AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.original_card_id = c.id);

  RETURN QUERY SELECT * FROM public.cards WHERE buyer_session_id = _session_id AND status = 'checked_out';
END;
$$;

-- Update mark_card_as_sold to attach active sale
CREATE OR REPLACE FUNCTION public.mark_card_as_sold(_card_id uuid, _buyer_name text, _final_price numeric, _buyer_phone text DEFAULT NULL::text)
RETURNS public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_card public.cards;
  final_phone text;
  active_sale uuid;
BEGIN
  active_sale := public.get_active_sale_id();
  SELECT COALESCE(_buyer_phone, buyer_phone) INTO final_phone FROM public.cards WHERE id = _card_id;

  UPDATE public.cards
  SET status = 'checked_out',
      claimed_by = _buyer_name,
      claimed_at = NOW(),
      buyer_phone = final_phone,
      buyer_session_id = NULL
  WHERE id = _card_id
  RETURNING * INTO updated_card;

  INSERT INTO public.transactions (buyer_name, buyer_phone, final_price, card_name, original_card_id, transaction_date, sale_id)
  VALUES (_buyer_name, final_phone, _final_price, updated_card.name, _card_id, NOW(), active_sale);

  RETURN updated_card;
END;
$$;
