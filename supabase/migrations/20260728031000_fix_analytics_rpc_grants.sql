-- The REVOKE ... FROM anon statements in the previous migration didn't
-- actually lock these down -- verified live: the anon key can still call
-- all 7 analytics RPCs and read aggregate visitor data. Root cause: Postgres
-- grants EXECUTE to the PUBLIC pseudo-role by default when a function is
-- created, and anon inherits access through that PUBLIC grant regardless of
-- what's revoked from the anon role specifically -- REVOKE ... FROM anon
-- only removes a grant made directly to anon, it does nothing to a PUBLIC
-- grant. This explicitly revokes from PUBLIC too, which is what actually
-- closes the hole.

REVOKE EXECUTE ON FUNCTION public.get_visitor_overview(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_device_breakdown(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_browser_breakdown(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_os_breakdown(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_visits(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_top_entry_pages(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_referrer_breakdown(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_visitor_overview(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_device_breakdown(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_browser_breakdown(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_os_breakdown(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_visits(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_entry_pages(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referrer_breakdown(integer) TO authenticated;
