-- Web push notifications for auction winners. Entirely free -- Web Push is
-- a browser standard (VAPID keys), no third-party SMS/WhatsApp service
-- involved. Complements the admin's manual "Message winner on WhatsApp"
-- button: this one is automatic, but only reaches buyers who opted in (and
-- on iOS, only if they added the site to their home screen).

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_session_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_session_idx ON public.push_subscriptions(buyer_session_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- No public SELECT/INSERT policy on purpose -- buyers reach this table only
-- through save_push_subscription below (SECURITY DEFINER), and only the
-- notify-auction-winner Edge Function (using the service role key, which
-- bypasses RLS) ever reads from it. Same privacy posture as claims.

CREATE OR REPLACE FUNCTION public.save_push_subscription(
  _session_id text, _endpoint text, _p256dh text, _auth text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.push_subscriptions (buyer_session_id, endpoint, p256dh, auth)
  VALUES (_session_id, _endpoint, _p256dh, _auth)
  ON CONFLICT (endpoint) DO UPDATE
  SET buyer_session_id = EXCLUDED.buyer_session_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
$$;

GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO anon, authenticated;

-- Fires once, the moment an auction transitions into 'ended' with a winner,
-- and calls the notify-auction-winner Edge Function. The anon key below is
-- safe to hardcode -- it's the same public key already embedded in the
-- client bundle (VITE_SUPABASE_PUBLISHABLE_KEY), not a secret. The function
-- itself uses the service role key (auto-injected into every Edge
-- Function, never stored here) to actually read push_subscriptions.
CREATE OR REPLACE FUNCTION public.notify_auction_winner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://govervcxumkbpmnnotpr.supabase.co/functions/v1/notify-auction-winner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvdmVydmN4dW1rYnBtbm5vdHByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NjM0ODMsImV4cCI6MjA4NTMzOTQ4M30.Gc-S3zX5kvHqeOrjYehJH3f6lNqUpu2Y0zB2DO-3t1I'
    ),
    body := jsonb_build_object(
      'auction_item_id', NEW.id,
      'winner_session_id', NEW.winner_session_id,
      'winner_name', NEW.winner_name,
      'winner_amount', NEW.winner_amount,
      'title', NEW.title
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_auction_winner
AFTER UPDATE ON public.auction_items
FOR EACH ROW
WHEN (NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' AND NEW.winner_session_id IS NOT NULL)
EXECUTE FUNCTION public.notify_auction_winner();
