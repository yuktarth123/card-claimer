
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS prize_text text,
  ADD COLUMN IF NOT EXISTS prize_image_url text;

DROP FUNCTION IF EXISTS public.list_sales();

CREATE FUNCTION public.list_sales()
 RETURNS TABLE(id uuid, name text, started_at timestamp with time zone, ended_at timestamp with time zone, transaction_count bigint, total_xp numeric, prize_text text, prize_image_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.started_at, s.ended_at,
    COUNT(t.id)::bigint AS transaction_count,
    COALESCE(SUM(t.final_price), 0)::numeric AS total_xp,
    s.prize_text, s.prize_image_url
  FROM public.sales s
  LEFT JOIN public.transactions t ON t.sale_id = s.id
  GROUP BY s.id
  ORDER BY s.started_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.update_sale_prize(_sale_id uuid, _prize_text text, _prize_image_url text)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated public.sales;
BEGIN
  UPDATE public.sales
  SET prize_text = _prize_text,
      prize_image_url = _prize_image_url
  WHERE id = _sale_id
  RETURNING * INTO updated;
  RETURN updated;
END;
$function$;
