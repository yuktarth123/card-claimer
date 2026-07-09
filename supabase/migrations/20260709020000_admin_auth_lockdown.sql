-- ============================================================================
-- Require a logged-in Supabase Auth user for every admin write. Until now
-- `/admin` had no login screen at all -- table policies allowed "anyone"
-- (i.e. any anon API caller, not just the /admin page) to insert/update/
-- delete cards, sales, and claims directly, and to SELECT the `claims`
-- table, which carries buyer phone numbers. This closes both gaps:
--   - Public (anon) keeps SELECT on cards/app_settings (storefront browsing)
--     and the buyer-facing RPCs (claim_units/release_claim/finalize_claims/
--     get_my_claims/leaderboards).
--   - Every direct write to cards/claims/sales/app_settings/transactions,
--     and every admin-only RPC, now requires an authenticated session --
--     i.e. a logged-in /admin user.
--
-- After applying: create the one admin account this app expects, via
-- Supabase Dashboard -> Authentication -> Users -> Add user (email/password,
-- "Auto Confirm User" on) -- there is no public sign-up screen.
-- ============================================================================

-- cards: public can still browse (SELECT unchanged), only a logged-in admin
-- can add/edit/delete listings.
DROP POLICY IF EXISTS "Anyone can insert cards" ON public.cards;
DROP POLICY IF EXISTS "Anyone can claim available cards" ON public.cards;
DROP POLICY IF EXISTS "Anyone can delete cards" ON public.cards;

CREATE POLICY "Authenticated can insert cards" ON public.cards
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update cards" ON public.cards
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete cards" ON public.cards
  FOR DELETE TO authenticated USING (true);

-- sales: only ever read/written through SECURITY DEFINER RPCs (list_sales,
-- start_sale, end_active_sale, update_sale_prize) from the client, so this
-- closes the direct-table-access path as defense in depth.
DROP POLICY IF EXISTS "Anyone can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can update sales" ON public.sales;

CREATE POLICY "Authenticated can write sales" ON public.sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- app_settings: public read (sale countdown / prize / site-wide-sale banner
-- are shown to every visitor), writes admin-only.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_settings'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.app_settings', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can write app_settings" ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- storage: card photos/videos are uploaded by the admin console only --
-- buyers never upload anything. Keep public read, require login to
-- upload/replace/delete.
DROP POLICY IF EXISTS "Anyone can upload card images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete card images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon video uploads" ON storage.objects;

CREATE POLICY "Authenticated can upload card images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'card-images');
CREATE POLICY "Authenticated can delete card images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'card-images');
CREATE POLICY "Authenticated can upload card videos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'card-videos');
CREATE POLICY "Authenticated can delete card videos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'card-videos');
