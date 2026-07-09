-- Additional gallery images beyond the primary photo_url/video_url shown
-- as the listing's cover media. photo_url stays the single "cover" image
-- used for thumbnails and order snapshots -- this is purely supplementary.
ALTER TABLE public.cards ADD COLUMN photo_urls text[] NOT NULL DEFAULT '{}';
