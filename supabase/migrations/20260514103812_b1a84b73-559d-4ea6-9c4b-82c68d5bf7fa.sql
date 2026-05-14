
-- 1. Add buyer_phone columns
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS buyer_phone text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS buyer_phone text;

-- 2. Update claim_card to accept and store phone
CREATE OR REPLACE FUNCTION public.claim_card(_card_id uuid, _buyer_name text, _session_id text, _buyer_phone text DEFAULT NULL)
 RETURNS public.cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result public.cards;
BEGIN
  UPDATE public.cards
  SET status = 'claimed',
      claimed_by = _buyer_name,
      claimed_at = now(),
      buyer_session_id = _session_id,
      buyer_phone = COALESCE(_buyer_phone, buyer_phone)
  WHERE id = _card_id
    AND (
      status = 'available'
      OR (status = 'claimed' AND claimed_at < now() - interval '15 minutes')
    )
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Card already claimed or not found';
  END IF;

  RETURN result;
END;
$function$;

-- 3. Update finalize_claims to copy phone into transactions
CREATE OR REPLACE FUNCTION public.finalize_claims(_session_id text)
 RETURNS SETOF public.cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.cards
    SET status = 'checked_out'
    WHERE buyer_session_id = _session_id AND status = 'claimed';

    INSERT INTO public.transactions (buyer_name, buyer_phone, buyer_session_id, card_name, final_price, original_card_id)
    SELECT
        c.claimed_by,
        c.buyer_phone,
        c.buyer_session_id,
        c.name,
        COALESCE(c.sale_price, c.price),
        c.id
    FROM public.cards c
    WHERE c.buyer_session_id = _session_id AND c.status = 'checked_out'
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions t WHERE t.original_card_id = c.id
      );

    RETURN QUERY
    SELECT * FROM public.cards
    WHERE buyer_session_id = _session_id AND status = 'checked_out';
END;
$function$;

-- 4. Update mark_card_as_sold to accept phone (defaults to whatever's on the card)
CREATE OR REPLACE FUNCTION public.mark_card_as_sold(_card_id uuid, _buyer_name text, _final_price numeric, _buyer_phone text DEFAULT NULL)
 RETURNS public.cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    updated_card public.cards;
    final_phone text;
BEGIN
    SELECT COALESCE(_buyer_phone, buyer_phone) INTO final_phone
      FROM public.cards WHERE id = _card_id;

    UPDATE public.cards
    SET
        status = 'checked_out',
        claimed_by = _buyer_name,
        claimed_at = NOW(),
        buyer_phone = final_phone,
        buyer_session_id = NULL
    WHERE id = _card_id
    RETURNING * INTO updated_card;

    INSERT INTO public.transactions (buyer_name, buyer_phone, final_price, card_name, original_card_id, transaction_date)
    VALUES (_buyer_name, final_phone, _final_price, updated_card.name, _card_id, NOW());

    RETURN updated_card;
END;
$function$;

-- 5. Leaderboard RPC (public, security definer aggregate)
CREATE OR REPLACE FUNCTION public.get_monthly_leaderboard()
 RETURNS TABLE(buyer_name text, buyer_phone text, xp numeric, purchases bigint)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(NULLIF(TRIM(buyer_name), ''), 'Anonymous Trainer') AS buyer_name,
    buyer_phone,
    SUM(final_price)::numeric AS xp,
    COUNT(*)::bigint AS purchases
  FROM public.transactions
  WHERE transaction_date >= date_trunc('month', now())
    AND transaction_date < date_trunc('month', now()) + interval '1 month'
  GROUP BY 1, 2
  ORDER BY xp DESC, purchases DESC
  LIMIT 100;
$function$;

GRANT EXECUTE ON FUNCTION public.get_monthly_leaderboard() TO anon, authenticated;
