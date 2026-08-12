-- ============================================================================
-- New slab arrivals (2026-08-12), 28 graded Pokemon cards.
--
-- IMPORTANT -- before running this migration:
--   1. Replace every <PRICE> placeholder below with the real sale price (INR,
--      matches this site's CURRENCY). They are intentionally non-numeric so
--      this migration FAILS to apply until every price is filled in --
--      nothing here can go live at price 0 by accident.
--   2. Double-check none of these cert numbers are already listed (this was
--      written without DB read access, so it wasn't checked against current
--      inventory). If one is a restock/duplicate of an existing listing,
--      drop its INSERT here and instead append its image to that listing's
--      photo_urls via the Admin UI.
--
-- Images ship as static assets in this app (public/slabs/*.jpg) rather than
-- Supabase Storage uploads, since the environment that authored this
-- migration had no network path to the Supabase project. photo_url just
-- needs to resolve against this site's own origin, so this works fine, but
-- feel free to migrate them into the `card-images` storage bucket later for
-- consistency with how every other listing's photos are stored.
-- ============================================================================

INSERT INTO public.cards
  (name, card_set, card_number, rarity, item_type, condition, price, quantity_total, quantity_available, photo_url, grading_company, grade, cert_number)
VALUES
  ('Mega Lucario ex', 'Mega Dream ex', '228/193', 'Mega Attack Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/mega-lucario-ex-6173887136.jpg', 'CGC', '9', '6173887136'),
  ('Milotic ex', 'Super Electric Breaker', '121/106', 'Super Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/milotic-ex-121-106-6173802067.jpg', 'CGC', '9', '6173802067'),
  ('Slowpoke', 'Scarlet & Violet (SVI)', '204/198', 'Illustration Rare', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/slowpoke-illustration-rare-98076989.jpg', 'PSA', '9', '98076989'),
  ('Probopass', 'Nihil Zero', '088/080', 'Art Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/probopass-6173502283.jpg', 'CGC', '10 Pristine', '6173502283'),
  ('Absol ex', 'Ruler of the Black Flame', '073/108', 'Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/absol-ex-6135689202.jpg', 'CGC', '7.5', '6135689202'),
  ('Haunter', 'Base Set', '29/102', NULL, 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/haunter-baseset-6122498171.jpg', 'CGC', '9', '6122498171'),
  ('Milotic ex', 'Super Electric Breaker', '026/106', 'Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/milotic-ex-026-106-6173891247.jpg', 'CGC', '10 Gem Mint', '6173891247'),
  ('Surfing Pikachu V', 'Celebrations', '008/025', 'Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/surfing-pikachu-v-celebrations-6138969289.jpg', 'CGC', '9', '6138969289'),
  ('Squirtle', 'Base Set', '63/102', NULL, 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/squirtle-baseset-6122497065.jpg', 'CGC', '9', '6122497065'),
  ('Togedemaru (2 of Hearts)', '2016 Pokemon Sun Playing Cards', NULL, NULL, 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/togedemaru-2-of-hearts-141624735.jpg', 'PSA', '10 Gem Mint', '141624735'),
  ('Zekrom ex', 'Black Bolt', '161/086', 'Super Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/zekrom-ex-blackbolt-6173801299.jpg', 'CGC', '7.5', '6173801299'),
  ('Seel', 'Base Set', '41/102', NULL, 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/seel-baseset-6122517283.jpg', 'CGC', '9', '6122517283'),
  ('Frillish', 'White Flare', '126/086', 'Illustration Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/frillish-whiteflare-6138961242.jpg', 'CGC', '8.5', '6138961242'),
  ('Froakie', 'Ninja Spinner', '086/083', 'Art Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/froakie-ninjaspinner-6173882020.jpg', 'CGC', '9', '6173882020'),
  ('Team Rocket''s Nidoking ex', 'Glory of the Rocket Gang', '116/098', 'Super Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/team-rockets-nidoking-ex-6173815289.jpg', 'CGC', '10 Gem Mint', '6173815289'),
  ('Mega Skarmory ex', 'Nihil Zero', '054/080', 'Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/mega-skarmory-ex-6173804238.jpg', 'CGC', '9', '6173804238'),
  ('Tentacruel', 'Fossil (1st Edition)', '44/62', NULL, 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/tentacruel-fossil1st-6128488145.jpg', 'CGC', '10 Gem Mint', '6128488145'),
  ('Alakazam ex', 'Scarlet & Violet 151', '188/165', 'Ultra Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/alakazam-ex-sv151-6138976182.jpg', 'CGC', '9', '6138976182'),
  ('Palafin ex', 'Terastal Fest ex', '207/187', 'Special Art Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/palafin-ex-terastalfest-6128491153.jpg', 'CGC', '10 Pristine', '6128491153'),
  ('Shroodle', 'Mega Evolution', '149/132', 'Illustration Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/shroodle-megaevolution-6128482111.jpg', 'CGC', '10 Gem Mint', '6128482111'),
  ('Walking Wake ex', 'Black Star Promos (Paradox Clash Tin)', '127', NULL, 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/walking-wake-ex-promo127-6128477211.jpg', 'CGC', '10 Gem Mint', '6128477211'),
  ('Mr. Fuji', 'Fossil (1st Edition)', '58/62', NULL, 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/mr-fuji-fossil1st-6128490291.jpg', 'CGC', '10 Gem Mint', '6128490291'),
  ('Xerneas', 'Ninja Spinner', '089/083', 'Art Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/xerneas-ninjaspinner-6173887255.jpg', 'CGC', '10 Gem Mint', '6173887255'),
  ('Psyduck', 'Mega Dream ex', '199/193', 'Art Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/psyduck-megadream-6173883096.jpg', 'CGC', '10 Pristine', '6173883096'),
  ('Mega Scrafty ex', 'Mega Dream ex', '231/193', 'Mega Attack Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/mega-scrafty-ex-megadream-6169948133.jpg', 'CGC', '10 Pristine', '6169948133'),
  ('Snorlax', 'Dark Phantasma', '077/071', 'Character Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/snorlax-darkphantasma-6173890254.jpg', 'CGC', '10 Gem Mint', '6173890254'),
  ('Radiant Charizard', 'VSTAR Universe', '015/172', 'Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/radiant-charizard-vstaruniverse-6173812179.jpg', 'CGC', '8', '6173812179'),
  ('Mega Latias ex', 'Mega Symphonia', '079/063', 'Super Rare - Holo', 'slab', 'Near Mint', <PRICE>, 1, 1, '/slabs/mega-latias-ex-megasymphonia-6169935178.jpg', 'CGC', '10 Gem Mint', '6169935178');
