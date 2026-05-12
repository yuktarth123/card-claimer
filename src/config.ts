// Update SELLER_WHATSAPP with your full international number (digits only, no +).
// Example: India 91, then 10-digit number => "919876543210"
export const SELLER_WHATSAPP = "910000000000";
export const SELLER_NAME = "Yuktarth";
export const CURRENCY = "₹";

// Hot Sale Discount Rules (ordered from highest cart value to lowest)
export const DISCOUNT_RULES = [
  { minCartValue: 10000, discount: 1000 },
  { minCartValue: 5000, discount: 500 },
];