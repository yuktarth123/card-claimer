-- ============================================================================
-- Lightweight, self-hosted visitor analytics -- no third-party tracker, no
-- cookies banner needed. One row per browser-tab session (not per pageview):
-- inserted once on load, then "touched" every ~20s while the tab is visible
-- so last_seen_at - created_at gives a session duration on read, without
-- needing a reliable unload/beacon event (those are flaky in practice).
--
-- Privacy: no name/email/phone/IP is captured. `visitor_id` is a random
-- token the client generates and stores in localStorage -- it identifies
-- "this browser has been here before" for returning-visitor stats, not a
-- real person.
-- ============================================================================

CREATE TABLE public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  entry_path text NOT NULL,
  device_type text NOT NULL, -- 'mobile' | 'tablet' | 'desktop'
  browser text,
  browser_version text,
  os text,
  referrer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.site_visits IS 'One row per browser-tab session. Duration = last_seen_at - created_at.';
COMMENT ON COLUMN public.site_visits.visitor_id IS 'Random token in localStorage, persists across sessions on the same browser -- not tied to a real identity.';

CREATE INDEX site_visits_created_at_idx ON public.site_visits (created_at);
CREATE INDEX site_visits_visitor_id_idx ON public.site_visits (visitor_id);

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Public can log a visit and keep it alive, but not read the raw table --
-- that stays admin-only (below) so visit data isn't exposed over the anon
-- REST API. Column-level grant restricts the heartbeat UPDATE to touching
-- last_seen_at only, even though the RLS policy itself has no per-row
-- ownership check to enforce (nothing sensitive rides on this data either
-- way -- worst case is a bumped timestamp on someone else's row).
CREATE POLICY "Public can log visits" ON public.site_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can heartbeat visits" ON public.site_visits FOR UPDATE USING (true) WITH CHECK (true);
REVOKE UPDATE ON public.site_visits FROM anon, authenticated;
GRANT UPDATE (last_seen_at) ON public.site_visits TO anon, authenticated;

CREATE POLICY "Authenticated can view visits" ON public.site_visits FOR SELECT TO authenticated USING (true);

-- --- Aggregate stats, admin-only -------------------------------------------

CREATE OR REPLACE FUNCTION public.get_visitor_overview(_days integer DEFAULT 30)
RETURNS TABLE(total_visits bigint, unique_visitors bigint, avg_duration_seconds numeric, visits_today bigint, visits_last_7_days bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_visits,
    COUNT(DISTINCT visitor_id)::bigint AS unique_visitors,
    COALESCE(AVG(EXTRACT(EPOCH FROM (last_seen_at - created_at))), 0)::numeric AS avg_duration_seconds,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::bigint AS visits_today,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::bigint AS visits_last_7_days
  FROM public.site_visits
  WHERE created_at >= now() - (_days || ' days')::interval;
$$;

CREATE OR REPLACE FUNCTION public.get_device_breakdown(_days integer DEFAULT 30)
RETURNS TABLE(device_type text, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT device_type, COUNT(*)::bigint AS visits
  FROM public.site_visits
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY device_type
  ORDER BY visits DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_browser_breakdown(_days integer DEFAULT 30)
RETURNS TABLE(browser text, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(browser, ''), 'Unknown') AS browser, COUNT(*)::bigint AS visits
  FROM public.site_visits
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY 1
  ORDER BY visits DESC
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_os_breakdown(_days integer DEFAULT 30)
RETURNS TABLE(os text, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(os, ''), 'Unknown') AS os, COUNT(*)::bigint AS visits
  FROM public.site_visits
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY 1
  ORDER BY visits DESC
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_visits(_days integer DEFAULT 30)
RETURNS TABLE(visit_date date, visits bigint, unique_visitors bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT date_trunc('day', created_at)::date AS visit_date, COUNT(*)::bigint AS visits, COUNT(DISTINCT visitor_id)::bigint AS unique_visitors
  FROM public.site_visits
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_top_entry_pages(_days integer DEFAULT 30)
RETURNS TABLE(entry_path text, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT entry_path, COUNT(*)::bigint AS visits
  FROM public.site_visits
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY entry_path
  ORDER BY visits DESC
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_referrer_breakdown(_days integer DEFAULT 30)
RETURNS TABLE(referrer text, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(referrer, ''), 'Direct') AS referrer, COUNT(*)::bigint AS visits
  FROM public.site_visits
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY 1
  ORDER BY visits DESC
  LIMIT 10;
$$;

-- Postgres grants EXECUTE to the PUBLIC pseudo-role by default when a
-- function is created, and anon inherits access through that PUBLIC grant
-- regardless of what's revoked from the anon role specifically -- revoking
-- only from anon (as the admin RPCs elsewhere in this project do) leaves
-- the PUBLIC grant standing and the function still callable by anon.
-- Revoke from both so aggregate traffic data isn't readable without an
-- admin session.
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

ALTER TABLE public.site_visits REPLICA IDENTITY FULL;
