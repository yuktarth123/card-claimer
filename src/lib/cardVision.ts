import { supabase } from "@/integrations/supabase/client";

export interface PriceSuggestion {
  source: "gemini_search" | "japanese_proxy";
  amountUsd: number;
  label: string;
  sourceUrls: string[];
  note: string | null;
}

export interface CardIdentity {
  name: string | null;
  set: string | null;
  number: string | null;
  language: string | null;
  printVariant: string | null;
  uncertain: boolean;
  note: string | null;
  priceSuggestion: PriceSuggestion | null;
}

// Sends a captured frame to the identify-card Edge Function, which calls
// Gemini vision server-side so the API key never reaches the browser.
export async function identifyCardFromImage(imageDataUrl: string): Promise<CardIdentity> {
  const { data, error } = await supabase.functions.invoke("identify-card", {
    body: { image: imageDataUrl },
  });

  if (error) {
    throw new Error(error.message || "Card identification failed.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Card identification returned no data.");
  }
  if ("error" in data) {
    throw new Error(String((data as { error: string }).error));
  }

  return data as CardIdentity;
}
