// Update SELLER_WHATSAPP with your full international number (digits only, no +).
// Example: India 91, then 10-digit number => "919876543210"
export const SELLER_WHATSAPP = "918859744828";
// Buyers enter their phone without a country code (see NameGate) -- assumed
// to be this country when building a wa.me link for them.
export const DEFAULT_COUNTRY_CODE = "91";
export const SELLER_NAME = "Yanks TCG";
export const CURRENCY = "₹";
export const USD_TO_INR_RATE = 83.5; // Approximate conversion rate for USD to INR
export const CLAIM_DURATION_MINUTES = 10; // Units must be purchased within this time
export const FREE_SHIPPING_THRESHOLD = 1500; // Order value above this gets free shipping
export const SHIPPING_FEE = 250; // Charged when the order subtotal is below the free-shipping threshold

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

// What kind of listing this is. "card" gets the full single-card fields
// (TCG database search, card number, rarity); sealed product and
// accessories skip those since they don't apply.
export const ITEM_TYPES = [
  { value: "card", label: "Single Card" },
  { value: "sealed_product", label: "Sealed Product (Box / Pack / ETB / Tin)" },
  { value: "accessory", label: "Accessory / Other" },
] as const;

// SALE_START_TIME is now managed via the Admin UI and stored in Supabase.
