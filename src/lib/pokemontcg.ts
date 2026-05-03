// pokemontcg.io public API — no key needed for low-volume usage
const BASE = "https://api.pokemontcg.io/v2";

export interface TCGCard {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  set?: { name?: string; series?: string; id?: string }; // Added set.id for more precise searching
  images?: { small?: string; large?: string };
  tcgplayer?: {
    prices?: {
      averageSellPrice?: number;
      lowPrice?: number;
      highPrice?: number;
      marketPrice?: number;
    };
  };
  cardmarket?: {
    prices?: {
      averageSellPrice?: number;
      lowPrice?: number;
      highPrice?: number;
      marketPrice?: number;
    };
  };
}

export async function searchPokemonCards(query: string): Promise<TCGCard[]> {
  if (!query.trim()) return [];

  let apiQuery = "";
  // Attempt to parse query as "SET_CODE CARD_NUMBER" (e.g., "base1 4")
  const setNumberMatch = query.match(/^(\w+)\s+(\d+)$/);

  if (setNumberMatch) {
    const setCode = setNumberMatch[1].toLowerCase(); // API set IDs are often lowercase
    const cardNumber = setNumberMatch[2];
    apiQuery = `q=set.id:${setCode} number:${cardNumber}`;
  } else {
    // Fallback to a broader search across all fields if no specific pattern is found
    apiQuery = `q=${encodeURIComponent(query)}`;
  }

  const url = `${BASE}/cards?${apiQuery}&pageSize=12&orderBy=-set.releaseDate`;
  console.log("Fetching TCG cards from:", url); // Log the full URL for debugging

  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to fetch TCG cards:", res.status, res.statusText, "URL:", url); // Include URL in error log
    return [];
  }
  const data = await res.json();
  return data.data || [];
}