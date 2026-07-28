// Update SELLER_WHATSAPP with your full international number (digits only, no +).
// Example: India 91, then 10-digit number => "919876543210"
export const SELLER_WHATSAPP = "918859744828";
// Buyers enter their phone without a country code (see NameGate) -- assumed
// to be this country when building a wa.me link for them.
export const DEFAULT_COUNTRY_CODE = "91";
export const SELLER_NAME = "Yanks TCG";
export const CURRENCY = "₹";
export const CLAIM_DURATION_MINUTES = 10; // Units must be purchased within this time
export const FREE_SHIPPING_THRESHOLD = 1500; // Order value above this gets free shipping
export const SHIPPING_FEE = 150; // Charged when the order subtotal is below the free-shipping threshold

// Pre-order items ship in this many days from their publish date (not from
// order date) -- shown to buyers as an estimated arrival window.
export const PREORDER_MIN_DAYS = 15;
export const PREORDER_MAX_DAYS = 20;

export const CARD_CONDITIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const;

// What kind of listing this is. "card" and "slab" both get the full
// single-card fields (TCG database search, card number, rarity) since a
// slab is still a specific card, just graded/encapsulated -- it additionally
// gets the grading fields (see GRADING_COMPANIES/VISUAL_TIERS below).
// Sealed product and accessories skip the card-identity fields entirely.
export const ITEM_TYPES = [
  { value: "card", label: "Single Card" },
  { value: "slab", label: "Graded Slab" },
  { value: "sealed_product", label: "Sealed Product (Box / Pack / ETB / Tin)" },
  { value: "accessory", label: "Accessory / Other" },
] as const;

// Matches the Supabase project's storage upload limit (free-tier default).
// Videos are compressed client-side before upload to try to stay under this,
// but very long/high-res clips can still exceed it after compression.
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

// Slabs (graded cards). Grade itself stays free text in the form (see
// EditCardDialog/Admin) since scales differ across companies -- PSA/BGS/SGC
// top out at "10", CGC's top grade is "10 Pristine", BGS also has "10 Black
// Label" above plain "10". Trying to encode that as one shared enum caused
// more special-casing than it saved.
export const GRADING_COMPANIES = ["PSA", "CGC", "BGS", "SGC", "Other"] as const;

// Visual tier is set by the admin per listing (any listing type, not just
// slabs) rather than derived automatically -- keeps editorial control over
// which listings get the standout shimmer treatment. Values stay top_grade/
// low_pop for historical reasons (originated as slab-only), but they apply
// to any listing now.
export const VISUAL_TIERS = [
  { value: "standard", label: "Standard" },
  { value: "top_grade", label: "Gold Shimmer" },
  { value: "low_pop", label: "Holo Shimmer" },
] as const;

// SALE_START_TIME is now managed via the Admin UI and stored in Supabase.
