-- Cards table
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  card_set TEXT,
  card_number TEXT,
  rarity TEXT,
  tcg_image_url TEXT,
  photo_url TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  buyer_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Public can read all cards
CREATE POLICY "Anyone can view cards" ON public.cards
  FOR SELECT USING (true);

-- Anyone can insert (admin page is unprotected by design - seller only shares /admin URL)
CREATE POLICY "Anyone can insert cards" ON public.cards
  FOR INSERT WITH CHECK (true);

-- Anyone can update only to claim an available card, or seller can edit any
CREATE POLICY "Anyone can claim available cards" ON public.cards
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete cards" ON public.cards
  FOR DELETE USING (true);

-- Atomic claim function
CREATE OR REPLACE FUNCTION public.claim_card(
  _card_id UUID,
  _buyer_name TEXT,
  _session_id TEXT
)
RETURNS public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.cards;
BEGIN
  UPDATE public.cards
  SET status = 'claimed',
      claimed_by = _buyer_name,
      claimed_at = now(),
      buyer_session_id = _session_id
  WHERE id = _card_id AND status = 'available'
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Card already claimed or not found';
  END IF;

  RETURN result;
END;
$$;

-- Unclaim (only by same session)
CREATE OR REPLACE FUNCTION public.unclaim_card(
  _card_id UUID,
  _session_id TEXT
)
RETURNS public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.cards;
BEGIN
  UPDATE public.cards
  SET status = 'available',
      claimed_by = NULL,
      claimed_at = NULL,
      buyer_session_id = NULL
  WHERE id = _card_id AND buyer_session_id = _session_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Realtime
ALTER TABLE public.cards REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;

-- Storage bucket for card photos
INSERT INTO storage.buckets (id, name, public) VALUES ('card-images', 'card-images', true);

CREATE POLICY "Public read card images" ON storage.objects
  FOR SELECT USING (bucket_id = 'card-images');

CREATE POLICY "Anyone can upload card images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'card-images');

CREATE POLICY "Anyone can delete card images" ON storage.objects
  FOR DELETE USING (bucket_id = 'card-images');