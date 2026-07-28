-- One-time data backfill: retroactively set visual_tier on already-published
-- listings based on their (free-text) rarity, so existing cards get the
-- shimmer ring immediately instead of staying on 'standard' until someone
-- edits each one by hand in Admin. Not a schema change -- safe to re-run,
-- always maps a given rarity string to the same target tier.
--
-- Exact-string match (not ILIKE/substring) on purpose: several rarity
-- strings share substrings that mean very different things -- e.g. "Poke
-- Ball Pattern" appears on both "Rare (Poke Ball Pattern)" (holo-worthy)
-- and "Uncommon (Poke Ball Pattern)" / "Supporter (Poke Ball Pattern)"
-- (not). Pattern-matching would have wrongly promoted those too.
--
-- Mapping derived from the actual distinct rarity values live in this
-- project's `cards` table at write time (202 rows) -- not a generic enum,
-- since Pokemon rarity text varies a lot by set/era. Anything not listed
-- here (no rarity set, Common, Uncommon, plain Rare, non-holo, trainer
-- card types, Prerelease Promo) is left on 'standard'.

UPDATE public.cards SET visual_tier = 'top_grade'
WHERE rarity IN (
  'ACE SPEC Rare',
  'Ultra Rare (Full Art)',
  'Ultra Rare',
  'Rainbow Rare (RR)',
  'Secret Rare (SR)',
  'RR sparkle/rainbow holo art',
  'special-art sparkle/rainbow holo',
  'gold star/confetti holo',
  'Rare Ultra'
);

UPDATE public.cards SET visual_tier = 'low_pop'
WHERE rarity IN (
  'Double Rare (RR)',
  'Double Rare (RR, Stamped Promo)',
  'Holo',
  'Rare Holo',
  'Holo (Poke Ball Pattern)',
  'Holo Common',
  'Holo (Stamped Promo)',
  'full-card geometric holo',
  'full art holo',
  'full star-pattern holo',
  'full-card star holo',
  'Confetti holo with large Pokémon TCG logo',
  'patterned holo',
  'shattered-glass/crystal holo foil texture',
  'star holo',
  'Promo Holo (China Exclusive)',
  'Rare (Master Ball Pattern)',
  'Rare (Poke Ball Pattern)'
);
