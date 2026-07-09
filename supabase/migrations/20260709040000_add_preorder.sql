-- Pre-order flag. Estimated arrival is computed in the frontend as
-- created_at + PREORDER_MIN_DAYS..PREORDER_MAX_DAYS (see src/config.ts) --
-- no extra date columns needed.
ALTER TABLE public.cards ADD COLUMN is_preorder boolean NOT NULL DEFAULT false;
