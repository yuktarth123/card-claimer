-- Putting an existing card up for auction previously left it fully
-- claimable from the storefront at the same time -- a buyer could claim it
-- via the normal checkout flow while it was also being bid on, letting the
-- same physical unit sell twice. Reserve one unit of stock the moment an
-- auction is created from an existing card, and release it back if the
-- auction ends without ever selling (cancelled, deleted, or force-ended
-- with no bids). A successful auction win keeps the unit permanently
-- reserved/gone, same as any other completed sale.

CREATE OR REPLACE FUNCTION public.reserve_card_for_auction(_card_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  card_row public.cards;
BEGIN
  SELECT * INTO card_row FROM public.cards WHERE id = _card_id FOR UPDATE;
  IF card_row.id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF card_row.quantity_available < 1 THEN
    RAISE EXCEPTION 'No stock left on this listing to auction';
  END IF;
  UPDATE public.cards SET quantity_available = quantity_available - 1 WHERE id = _card_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_card_from_auction(_card_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.cards
  SET quantity_available = LEAST(quantity_available + 1, quantity_total)
  WHERE id = _card_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_card_for_auction(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_card_from_auction(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_card_for_auction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_card_from_auction(uuid) TO authenticated;
