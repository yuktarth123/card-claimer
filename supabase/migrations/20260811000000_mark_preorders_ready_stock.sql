-- Bulk "shipment arrived" action: flips every pre-order listing to ready
-- stock in one click. Deliberately leaves quantity_total/quantity_available
-- untouched -- what physically arrives rarely matches what was originally
-- listed 1:1, so the admin re-checks and enters real stock counts per item
-- by hand afterward via the existing edit flow.
CREATE OR REPLACE FUNCTION public.mark_all_preorders_ready_stock()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.cards SET is_preorder = false WHERE is_preorder = true;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_all_preorders_ready_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_preorders_ready_stock() TO authenticated;
