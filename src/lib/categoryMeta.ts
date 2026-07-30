import { Sparkles, Award, PackageOpen, ShieldCheck, type LucideIcon } from "lucide-react";
import { ITEM_TYPES } from "@/config";

// cards.item_type is typed as plain `string` in the generated Supabase
// types, but is only ever one of these four values in practice (see
// ITEM_TYPES in config.ts) -- use that as the literal union here instead.
type ItemType = (typeof ITEM_TYPES)[number]["value"];

interface CategoryMeta {
  label: string;
  route: string;
  icon: LucideIcon;
  description: string;
  emptyMessage: string;
  noMatchMessage: string;
}

// One source of truth for the 4 product categories -- used by the homepage
// hub tiles and by each category page's own header/empty-state copy.
export const CATEGORY_META: Record<ItemType, CategoryMeta> = {
  card: {
    label: "Singles",
    route: "/singles",
    icon: Sparkles,
    description: "Individual cards, from bulk commons to chase pulls.",
    emptyMessage: "No singles listed yet. Check back soon!",
    noMatchMessage: "No singles match your search or filters.",
  },
  slab: {
    label: "Slabs",
    route: "/slabs",
    icon: Award,
    description:
      "Graded, certified, and one-of-a-kind. Gold-ringed listings are top-graded gems; holo-ringed ones are the low-population grails.",
    emptyMessage: "No slabs listed yet. Check back soon!",
    noMatchMessage: "No slabs match your search or filters.",
  },
  sealed_product: {
    label: "Sealed",
    route: "/sealed",
    icon: PackageOpen,
    description: "Booster boxes, ETBs, tins, and packs — still factory sealed.",
    emptyMessage: "No sealed product listed yet. Check back soon!",
    noMatchMessage: "No sealed product matches your search or filters.",
  },
  accessory: {
    label: "Accessories",
    route: "/accessories",
    icon: ShieldCheck,
    description: "Sleeves, toploaders, binders, and other collector gear.",
    emptyMessage: "No accessories listed yet. Check back soon!",
    noMatchMessage: "No accessories match your search or filters.",
  },
};

export const CATEGORY_ORDER: ItemType[] = ["card", "slab", "sealed_product", "accessory"];
