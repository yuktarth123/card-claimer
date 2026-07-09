-- Vintage flag, manually set by the seller per listing (e.g. WOTC-era /
-- pre-2003 cards, or other older, especially collectible prints).
ALTER TABLE public.cards ADD COLUMN is_vintage boolean NOT NULL DEFAULT false;
