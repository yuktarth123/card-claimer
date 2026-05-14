
DROP FUNCTION IF EXISTS public.get_monthly_leaderboard();

CREATE FUNCTION public.get_monthly_leaderboard()
 RETURNS TABLE(buyer_name text, xp numeric, purchases bigint)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH grouped AS (
    SELECT
      COALESCE(NULLIF(TRIM(buyer_name), ''), 'Anonymous Trainer') AS buyer_name,
      COALESCE(NULLIF(TRIM(buyer_phone), ''), buyer_session_id, gen_random_uuid()::text) AS identity_key,
      final_price
    FROM public.transactions
    WHERE transaction_date >= date_trunc('month', now())
      AND transaction_date < date_trunc('month', now()) + interval '1 month'
  )
  SELECT
    buyer_name,
    SUM(final_price)::numeric AS xp,
    COUNT(*)::bigint AS purchases
  FROM grouped
  GROUP BY buyer_name, identity_key
  ORDER BY xp DESC, purchases DESC
  LIMIT 100;
$function$;

GRANT EXECUTE ON FUNCTION public.get_monthly_leaderboard() TO anon, authenticated;
