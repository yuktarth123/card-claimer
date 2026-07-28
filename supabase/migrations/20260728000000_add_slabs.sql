-- ============================================================================
-- Slabs: graded cards (PSA / CGC / BGS / SGC / etc.) get their own section.
-- Still a normal `cards` row with item_type='card' and the normal claim
-- flow -- these are just extra fields for the grading info, a static pop
-- count, marketing copy, and which visual treatment the tile gets.
-- ============================================================================

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS is_slab boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grading_company text,
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS cert_number text,
  ADD COLUMN IF NOT EXISTS population_count integer,
  ADD COLUMN IF NOT EXISTS population_note text,
  ADD COLUMN IF NOT EXISTS slab_description text,
  ADD COLUMN IF NOT EXISTS visual_tier text NOT NULL DEFAULT 'standard';

ALTER TABLE public.cards
  ADD CONSTRAINT chk_cards_visual_tier CHECK (visual_tier IN ('standard', 'top_grade', 'low_pop'));

COMMENT ON COLUMN public.cards.is_slab IS 'True for graded/encapsulated cards, shown in the dedicated Slabs section';
COMMENT ON COLUMN public.cards.grading_company IS 'e.g. PSA, CGC, BGS, SGC';
COMMENT ON COLUMN public.cards.grade IS 'Free text since grading scales differ, e.g. "10", "9.5", "10 Pristine", "10 Black Label"';
COMMENT ON COLUMN public.cards.population_count IS 'Static pop count captured at listing time -- not live, drifts as more copies get graded';
COMMENT ON COLUMN public.cards.population_note IS 'Free text context for the pop count, e.g. "as of Jul 2026" or "2 higher"';
COMMENT ON COLUMN public.cards.slab_description IS 'Longer marketing copy for the slab detail view, separate from the short name/set line';
COMMENT ON COLUMN public.cards.visual_tier IS 'Which tile treatment this slab gets: standard, top_grade (gold), or low_pop (holo)';

CREATE INDEX IF NOT EXISTS cards_is_slab_idx ON public.cards (is_slab);
