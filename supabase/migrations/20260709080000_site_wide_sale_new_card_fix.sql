-- Fixes a real bug: previously a card added (or a discount % changed) while
-- a site-wide sale was already active never got its pre_sale_price backed
-- up, so ending the sale wiped that card's price to NULL instead of
-- restoring it. This trigger backs up any card the moment it's inserted
-- while a site-wide sale is running, so apply_site_wide_sale never has to
-- guess whether a row is "new".
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

-- Only back up on the inactive -> active transition; cards added while
-- already active are backed up individually by the trigger above.
CREATE OR REPLACE FUNCTION public.apply_site_wide_sale(_percent numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _percent IS NULL OR _percent <= 0 OR _percent >= 100 THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 100';
  END IF;

  UPDATE public.cards
  SET pre_sale_price = sale_price
  WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = 1 AND site_wide_sale_active = true);

  UPDATE public.cards SET sale_price = ROUND(price * (1 - _percent / 100.0));

  UPDATE public.app_settings SET site_wide_sale_active = true, site_wide_sale_percent = _percent WHERE id = 1;
END;
$$;
