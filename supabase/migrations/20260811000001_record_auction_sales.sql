-- Winning an auction only ever set auction_items.winner_* -- it never
-- created a transactions row, so auction wins never showed up in Sales
-- History and there was no way to track those orders alongside regular
-- checkouts. Admin now gets an explicit "Record Sale" action (used once a
-- winner has actually paid) that inserts into transactions the same way
-- mark_claim_as_sold does for manually-closed card sales.
ALTER TABLE public.transactions ADD COLUMN auction_item_id uuid REFERENCES public.auction_items(id) ON DELETE SET NULL;
CREATE INDEX transactions_auction_item_id_idx ON public.transactions (auction_item_id);

CREATE OR REPLACE FUNCTION public.finalize_auction_sale(_auction_item_id uuid)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  item public.auction_items;
  winner_phone text;
  active_sale uuid;
  new_txn public.transactions;
BEGIN
  SELECT * INTO item FROM public.auction_items WHERE id = _auction_item_id FOR UPDATE;
  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;
  IF item.status <> 'ended' OR item.winner_name IS NULL OR item.winner_amount IS NULL THEN
    RAISE EXCEPTION 'This auction has no confirmed winner yet';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE auction_item_id = _auction_item_id) THEN
    RAISE EXCEPTION 'This auction sale is already recorded';
  END IF;

  -- Winner phone deliberately never lives on auction_items (public SELECT)
  -- -- only in auction_bids, which is authenticated-only. Same posture as
  -- AuctionManager's getWinnerPhone lookup.
  SELECT buyer_phone INTO winner_phone FROM public.auction_bids
  WHERE auction_item_id = _auction_item_id AND buyer_session_id = item.winner_session_id
  ORDER BY created_at DESC LIMIT 1;

  active_sale := public.get_active_sale_id();

  INSERT INTO public.transactions (
    buyer_name, buyer_phone, buyer_session_id, card_name, final_price, quantity,
    original_card_id, sale_id, order_id, photo_url, auction_item_id
  )
  VALUES (
    item.winner_name, winner_phone, item.winner_session_id, item.title, item.winner_amount, 1,
    item.source_card_id, active_sale, gen_random_uuid(), item.photo_url, item.id
  )
  RETURNING * INTO new_txn;

  RETURN new_txn;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_auction_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_auction_sale(uuid) TO authenticated;

-- Lets admin undo a mistaken "Record Sale" click.
CREATE OR REPLACE FUNCTION public.unrecord_auction_sale(_auction_item_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.transactions WHERE auction_item_id = _auction_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unrecord_auction_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unrecord_auction_sale(uuid) TO authenticated;
