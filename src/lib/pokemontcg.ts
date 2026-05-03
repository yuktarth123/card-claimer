// pokemontcg.io public API — no key needed for low-volume usage
const BASE = "https://api.pokemontcg.io/v2";

export interface TCGCard {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  set?: { name?: string; series?: string };
  images?: { small?: string; large?: string };
  // Add price information from TCGPlayer and Cardmarket
  tcgplayer?: {
    prices?: {
      averageSellPrice?: number;
      lowPrice?: number;
      highPrice?: number;
      marketPrice?: number;
      // Add other price types if needed
    };
  };
  cardmarket?: {
    prices?: {
      averageSellPrice?: number;
      lowPrice?: number;
      highPrice?: number;
      marketPrice?: number;
      // Add other price types if needed
    };
  };
}

export async function searchPokemonCards(query: string): Promise<TCGCard[]> {
  if (!query.trim()) return [];
  // Use a broader query to search across multiple fields
  const q = encodeURIComponent(query);
  const res = await fetch(`${BASE}/cards?q=${q}&pageSize=12&orderBy=-set.releaseDate`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}