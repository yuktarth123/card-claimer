-- Category: free-text merchandising tag the seller can use however fits
-- (e.g. a product line, a themed collection) -- deliberately not a fixed
-- enum, since what's useful here varies by what's being sold.
ALTER TABLE public.cards ADD COLUMN category text;
CREATE INDEX cards_category_idx ON public.cards (category);

-- What kind of listing this is. Single cards and sealed product (booster
-- boxes/packs, ETBs, tins, etc.) get different admin fields in the UI --
-- e.g. a TCG-database lookup only makes sense for single cards.
ALTER TABLE public.cards ADD COLUMN item_type text NOT NULL DEFAULT 'card'
  CHECK (item_type IN ('card', 'sealed_product', 'accessory'));
