import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_COUNTRY_CODE } from "@/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Buyers store their phone without a country code -- prepend the default
 * one if it looks like a bare local number, so wa.me links resolve. */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `${DEFAULT_COUNTRY_CODE}${digits}` : digits;
}

export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/** Parses a Supabase Storage public URL into its bucket and object path, or
 * null if the URL isn't one of this project's storage objects (e.g. an
 * externally hosted image). Used to clean up storage when the row that
 * referenced it is deleted, so removed listings don't leave orphaned files
 * behind. */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], path: decodeURIComponent(match[2]) };
}
