-- ============================================================================
-- Live box break feature: an admin-run event (title, YouTube video, N
-- numbered slots at a fixed price) that buyers watch and claim slots on in
-- real time, plus a live chat panel. Checkout is WhatsApp-based, same as the
-- rest of the site -- no payment is handled in-app.
--
-- break_slot_claims is intentionally public-SELECT (unlike `claims`, which
-- is admin-only because it stores buyer_phone). It carries no phone number,
-- so every viewer can see whose name is on which slot in real time -- that's
-- the point of a live break. All writes to it still go through the
-- SECURITY DEFINER functions below, never direct table access, so slot
-- assignment stays race-safe under concurrent claims.
-- ============================================================================

-- --- Tables ----------------------------------------------------------------

CREATE TABLE public.box_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text,
  youtube_video_id text,
  total_slots integer NOT NULL CHECK (total_slots > 0),
  price_per_slot numeric(10,2) NOT NULL DEFAULT 0 CHECK (price_per_slot >= 0),
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.box_breaks.youtube_video_id IS 'Just the video ID (the part after v= or youtu.be/), not the full URL';

CREATE TABLE public.break_slot_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  break_id uuid NOT NULL REFERENCES public.box_breaks(id) ON DELETE CASCADE,
  slot_number integer NOT NULL CHECK (slot_number > 0),
  buyer_name text NOT NULL,
  buyer_session_id text NOT NULL,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'checked_out')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_break_slot UNIQUE (break_id, slot_number)
);

CREATE INDEX break_slot_claims_break_id_idx ON public.break_slot_claims(break_id);
CREATE INDEX break_slot_claims_session_idx ON public.break_slot_claims(buyer_session_id);

CREATE TABLE public.live_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  break_id uuid NOT NULL REFERENCES public.box_breaks(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 50),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX live_chat_messages_break_id_idx ON public.live_chat_messages(break_id);

-- --- Row Level Security ------------------------------------------------------

ALTER TABLE public.box_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_slot_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view breaks" ON public.box_breaks FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert breaks" ON public.box_breaks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update breaks" ON public.box_breaks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete breaks" ON public.box_breaks FOR DELETE TO authenticated USING (true);

-- No public INSERT/UPDATE/DELETE here on purpose: buyers reach slot claims
-- only through claim_break_slots/release_break_slot_claim/
-- finalize_break_slot_claims below, all SECURITY DEFINER, so slot
-- assignment can be validated (range, no double-claim) atomically.
CREATE POLICY "Public can view slot claims" ON public.break_slot_claims FOR SELECT USING (true);
CREATE POLICY "Authenticated can update slot claims" ON public.break_slot_claims FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete slot claims" ON public.break_slot_claims FOR DELETE TO authenticated USING (true);

CREATE POLICY "Public can view chat" ON public.live_chat_messages FOR SELECT USING (true);
CREATE POLICY "Public can post chat" ON public.live_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can delete chat" ON public.live_chat_messages FOR DELETE TO authenticated USING (true);

-- --- Realtime ----------------------------------------------------------------

ALTER TABLE public.box_breaks REPLICA IDENTITY FULL;
ALTER TABLE public.break_slot_claims REPLICA IDENTITY FULL;
ALTER TABLE public.live_chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.box_breaks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.break_slot_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;

-- --- Storage -----------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public) VALUES ('break-images', 'break-images', true);

CREATE POLICY "Public read break images" ON storage.objects FOR SELECT USING (bucket_id = 'break-images');
CREATE POLICY "Authenticated can upload break images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'break-images');
CREATE POLICY "Authenticated can delete break images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'break-images');

-- --- Functions ---------------------------------------------------------------

-- Matches CLAIM_DURATION_MINUTES in src/config.ts -- keep these in sync.
CREATE OR REPLACE FUNCTION public.release_expired_break_slot_claims()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.break_slot_claims
  WHERE status = 'claimed' AND claimed_at < now() - interval '10 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_break_slots(
  _break_id UUID, _slot_numbers INTEGER[], _buyer_name TEXT, _session_id TEXT
)
RETURNS SETOF public.break_slot_claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  break_row public.box_breaks;
  slot INTEGER;
BEGIN
  IF _slot_numbers IS NULL OR array_length(_slot_numbers, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one slot';
  END IF;

  PERFORM public.release_expired_break_slot_claims();

  SELECT * INTO break_row FROM public.box_breaks WHERE id = _break_id;
  IF break_row.id IS NULL THEN
    RAISE EXCEPTION 'Break not found';
  END IF;
  IF break_row.status = 'ended' THEN
    RAISE EXCEPTION 'This break has ended';
  END IF;

  -- Each insert is its own sub-transaction via the nested BEGIN/EXCEPTION
  -- block so a unique_violation on one slot raises a clear "slot N taken"
  -- message; that RAISE is left uncaught, which aborts the whole function
  -- (and every insert already made in this call) -- an all-or-nothing claim.
  FOREACH slot IN ARRAY _slot_numbers LOOP
    IF slot < 1 OR slot > break_row.total_slots THEN
      RAISE EXCEPTION 'Slot % does not exist in this break', slot;
    END IF;

    BEGIN
      INSERT INTO public.break_slot_claims (break_id, slot_number, buyer_name, buyer_session_id)
      VALUES (_break_id, slot, _buyer_name, _session_id);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Slot % was just taken by someone else', slot;
    END;
  END LOOP;

  RETURN QUERY SELECT * FROM public.break_slot_claims
    WHERE break_id = _break_id AND buyer_session_id = _session_id AND slot_number = ANY(_slot_numbers);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_break_slot_claim(_claim_id UUID, _session_id TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.break_slot_claims
  WHERE id = _claim_id AND buyer_session_id = _session_id AND status = 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_break_slot_claims(_break_id UUID, _session_id TEXT)
RETURNS SETOF public.break_slot_claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.break_slot_claims SET status = 'checked_out'
  WHERE break_id = _break_id AND buyer_session_id = _session_id AND status = 'claimed';

  RETURN QUERY SELECT * FROM public.break_slot_claims
    WHERE break_id = _break_id AND buyer_session_id = _session_id AND status = 'checked_out';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_break_slot_claim(_claim_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.break_slot_claims WHERE id = _claim_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_break_slot_sold(_claim_id UUID)
RETURNS public.break_slot_claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated public.break_slot_claims;
BEGIN
  UPDATE public.break_slot_claims SET status = 'checked_out'
  WHERE id = _claim_id
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  RETURN updated;
END;
$$;

-- --- Grants ------------------------------------------------------------------

-- Buyer-facing / public: usable without logging in.
GRANT EXECUTE ON FUNCTION public.release_expired_break_slot_claims() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_break_slots(uuid, integer[], text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_break_slot_claim(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_break_slot_claims(uuid, text) TO anon, authenticated;

-- Admin-only: requires a logged-in /admin session. Supabase auto-grants
-- EXECUTE on new public-schema functions to anon by default, so this
-- explicit REVOKE is required -- see fresh_project_schema.sql for the same
-- pattern and the confirmed-live note on why it matters.
REVOKE EXECUTE ON FUNCTION public.admin_release_break_slot_claim(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_break_slot_sold(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_release_break_slot_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_break_slot_sold(uuid) TO authenticated;
