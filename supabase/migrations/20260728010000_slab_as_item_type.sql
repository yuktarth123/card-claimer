-- ============================================================================
-- Slab becomes a Listing Type choice (item_type = 'slab') instead of a
-- separate is_slab toggle -- one fewer control in the admin form, and it's
-- the more natural fit: a slab is a *kind* of listing (like Single Card or
-- Sealed Product), not an orthogonal flag on top of one.
-- ============================================================================

-- Allow 'slab' before backfilling, or the UPDATE below would violate the
-- existing check constraint. Name matches Postgres's default for an inline
-- column CHECK (<table>_<column>_check), as created in the fresh schema
-- migration this project started from.
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_item_type_check;
ALTER TABLE public.cards
  ADD CONSTRAINT cards_item_type_check CHECK (item_type IN ('card', 'sealed_product', 'accessory', 'slab'));

UPDATE public.cards SET item_type = 'slab' WHERE is_slab = true;

ALTER TABLE public.cards DROP COLUMN IF EXISTS is_slab;
