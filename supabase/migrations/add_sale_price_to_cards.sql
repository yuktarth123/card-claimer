ALTER TABLE public.cards
ADD COLUMN sale_price NUMERIC;

-- Optional: Add a check constraint to ensure sale_price is less than price if both are present
ALTER TABLE public.cards
ADD CONSTRAINT chk_sale_price_less_than_price
CHECK (sale_price IS NULL OR price IS NULL OR sale_price <= price);

-- Optional: Add an index for faster queries if you plan to filter/sort by sale_price
CREATE INDEX IF NOT EXISTS cards_sale_price_idx ON public.cards (sale_price);