-- Allow claiming if available OR if previous claim expired (>15 min old)
CREATE OR REPLACE FUNCTION public.claim_card(
  _card_id UUID,
  _buyer_name TEXT,
  _session_id TEXT
)
RETURNS public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.cards;
BEGIN
  UPDATE public.cards
  SET status = 'claimed',
      claimed_by = _buyer_name,
      claimed_at = now(),
      buyer_session_id = _session_id
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
$$;

-- Finalize a buyer's claims: lock them as checked_out so they no longer expire
CREATE OR REPLACE FUNCTION public.finalize_claims(
  _session_id TEXT
)
RETURNS SETOF public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.cards
  SET status = 'checked_out'
  WHERE buyer_session_id = _session_id AND status = 'claimed'
  RETURNING *;
END;
$$;