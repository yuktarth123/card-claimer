
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS pre_sale_price numeric;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS site_wide_sale_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS site_wide_sale_percent numeric;

CREATE OR REPLACE FUNCTION public.apply_site_wide_sale(_percent numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _percent IS NULL OR _percent <= 0 OR _percent >= 100 THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 100';
  END IF;

  -- Back up original sale_price only the first time the site-wide sale starts
  UPDATE public.cards
  SET pre_sale_price = sale_price
  WHERE pre_sale_price IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.app_settings WHERE id = 1 AND site_wide_sale_active = true
    );

  -- Apply the discount to every card
  UPDATE public.cards
  SET sale_price = ROUND(price * (1 - _percent / 100.0));

  UPDATE public.app_settings
  SET site_wide_sale_active = true,
      site_wide_sale_percent = _percent
  WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_site_wide_sale()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cards
  SET sale_price = pre_sale_price,
      pre_sale_price = NULL;

  UPDATE public.app_settings
  SET site_wide_sale_active = false,
      site_wide_sale_percent = NULL
  WHERE id = 1;
END;
$$;
