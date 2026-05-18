
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS monthly_leaderboard_enabled boolean NOT NULL DEFAULT true;
