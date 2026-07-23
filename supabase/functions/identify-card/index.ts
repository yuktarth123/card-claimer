// Supabase Edge Function: identify-card
//
// Takes a base64 JPEG frame of a physical Pokémon card and asks a Gemini
// vision model to name it. Runs server-side so the GEMINI_API_KEY secret
// never ships to the browser bundle.
//
// For non-English prints (where pokemontcg.io has no price data at all --
// see the client's handleScanned in Admin.tsx), this also makes a second,
// text-only Gemini call using Google Search grounding to suggest a market
// price with real cited sources, and falls back to PokemonPriceTracker's
// Japanese-print price (the closest available proxy for e.g. a Chinese
// print of the same set) if grounding doesn't turn up anything confident.
// Neither of these is treated as authoritative -- the client shows them as
// an editable, clearly-labeled starting point, never a locked-in price.
//
// Deploy:
//   supabase functions deploy identify-card --project-ref govervcxumkbpmnnotpr
// Secrets (required -- one of these two):
//   supabase secrets set GEMINI_API_KEY=your-key --project-ref govervcxumkbpmnnotpr
//   supabase secrets set GEMINI_API_KEYS=key-one,key-two,key-three --project-ref govervcxumkbpmnnotpr
//   GEMINI_API_KEYS (comma or newline separated) takes priority if both are set. Each
//   Gemini free-tier key has its own ~20 requests/minute cap -- when a key hits that
//   limit mid-scan, the next key in the list is tried automatically before giving up.
// Secrets (optional, defaults to gemini-2.5-flash):
//   supabase secrets set GEMINI_VISION_MODEL=gemini-2.5-flash --project-ref govervcxumkbpmnnotpr
// Secrets (optional -- enables the Japanese-proxy price fallback):
//   supabase secrets set POKEMONPRICETRACKER_API_KEY=your-key --project-ref govervcxumkbpmnnotpr
//   (free tier, no card required: https://www.pokemonpricetracker.com/api-keys)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface IdentifyResult {
  name: string | null;
  set: string | null;
  number: string | null;
  language: string | null;
  printVariant: string | null;
  uncertain: boolean;
  note: string | null;
}

interface PriceSuggestion {
  source: "gemini_search" | "japanese_proxy";
  amountUsd: number;
  label: string;
  sourceUrls: string[];
  note: string | null;
}

// Asking for card identity ONLY, never a price in this first call -- the
// model has no live market data and would just make up a number here.
// English-print pricing comes from the pokemontcg.io lookup the client does
// afterward; non-English pricing (if any) comes from the grounded search
// below, which is a separate, clearly-labeled best-effort call.
const IDENTIFY_PROMPT = `You are looking at a photo of a single physical Pokémon TCG card. Identify it.

Respond with ONLY a JSON object, no markdown fences, no extra text, matching exactly this shape:
{"name": string or null, "set": string or null, "number": string or null, "language": string or null, "printVariant": string or null, "uncertain": boolean, "note": string or null}

- "name": the card's name translated into English as it would appear on the English print (e.g. a card printed with the Chinese name "光辉摔角鹰人" should still be named "Radiant Hawlucha") -- this is used to look up the card in an English-only database, so always translate, never leave it in the original script. Include the card's suffix (ex, V, VMAX, GX, etc.) if visible.
- "set": the expansion/set name in English if you can tell (e.g. "Obsidian Flames"), else null.
- "number": the card number as printed, usually bottom-left like "4/102" or "004/091", else null. This is the number on THIS physical print and may differ from the English release's number -- report exactly what's printed, don't translate or guess the English equivalent.
- "language": the language of the text actually printed on this card (e.g. "English", "Chinese", "Japanese", "Korean", "German", "French"), your best guess from the visible text. Only null if truly illegible.
- "printVariant": look closely for anything about THIS specific physical print that could make it worth more or less than a plain base print of the same numbered card -- a foil/holo stamp or seal (describe it, e.g. "gold star stamp", "staff stamp", "1st edition stamp"), an unusual holo/foil texture or pattern (e.g. "cosmos holo", "confetti holo", "reverse holo", "rainbow/textured foil", "non-holo"), or any other special marking not part of a normal print. This matters a lot for Chinese Gem Pack cards and similar special releases, which often have distinctly stamped or patterned variants priced very differently from the plain version of the same card number. Set to null only if the card looks like a normal, unstamped, unremarkable print.
- "uncertain": true if you are not confident this is a real, specific, identifiable Pokémon card (blurry, obscured, not a Pokémon card, etc.). When true, do not guess a name -- set "name" to null and explain briefly in "note". Do NOT set this to true just because the printed copyright year looks later than what you'd expect from your training data -- your training data has a cutoff date, but new Pokémon products keep being printed and sold after it, so a copyright year that looks "future" to you (e.g. 2025, 2026, or later) is normal and is not by itself a sign of a fake or reprint card.
- "note": a short explanation, only needed when "uncertain" is true (or null otherwise).

Do not include any text outside the JSON object.`;

function loadGeminiKeys(): string[] {
  const multi = Deno.env.get("GEMINI_API_KEYS");
  if (multi) {
    return multi.split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
  }
  const single = Deno.env.get("GEMINI_API_KEY");
  return single ? [single] : [];
}

function isRateLimitError(message: string): boolean {
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(message);
}

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
}
interface GeminiApiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

const GEMINI_TIMEOUT_MS = 20_000;

// Tries each key in order, but only moves to the next one when the failure
// looks like a per-key rate limit -- any other error (bad request, model
// name typo, etc.) would fail identically on every key, so we return
// immediately instead of burning through the whole list pointlessly.
//
// Each attempt has a hard timeout: without one, a slow/hanging Gemini call
// would leave the whole function (and the "Identifying card..." spinner)
// stuck indefinitely, and a user retrying while it's still hanging burns
// even more quota on top of the still-in-flight call -- exactly what once
// ran the free-tier keys straight into their rate limit.
async function callGemini(
  keys: string[],
  model: string,
  payload: Record<string, unknown>,
): Promise<{ json: GeminiApiResponse } | { error: string }> {
  if (keys.length === 0) return { error: "No Gemini API key configured." };

  let lastError = "Unknown error";
  for (const key of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const json: GeminiApiResponse = await res.json();
      if (res.ok && !json.error) {
        return { json };
      }
      lastError = json.error?.message || `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error && err.name === "AbortError"
        ? `Timed out after ${GEMINI_TIMEOUT_MS / 1000}s`
        : err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }
    if (!isRateLimitError(lastError)) {
      return { error: lastError };
    }
    // else: this key is rate-limited, loop continues to the next one.
  }
  return { error: lastError };
}

function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseIdentity(text: string): IdentifyResult | null {
  const parsed = extractJson<Record<string, unknown>>(text);
  if (!parsed) return null;
  return {
    name: typeof parsed.name === "string" ? parsed.name : null,
    set: typeof parsed.set === "string" ? parsed.set : null,
    number: typeof parsed.number === "string" ? parsed.number : null,
    language: typeof parsed.language === "string" ? parsed.language : null,
    printVariant: typeof parsed.printVariant === "string" ? parsed.printVariant : null,
    uncertain: Boolean(parsed.uncertain),
    note: typeof parsed.note === "string" ? parsed.note : null,
  };
}

async function identifyCard(keys: string[], model: string, imageBase64: string): Promise<IdentifyResult | { error: string }> {
  const outcome = await callGemini(keys, model, {
    contents: [{
      parts: [
        { text: IDENTIFY_PROMPT },
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0 },
  });
  if ("error" in outcome) return { error: outcome.error };

  const text = outcome.json.candidates?.[0]?.content?.parts?.[0]?.text;
  const result = text ? parseIdentity(text) : null;
  return result || { error: "Could not parse a card identity from the model's response." };
}

// Temporary diagnostics surfaced in the response (as _debug) while tuning
// this -- not something the client UI reads or shows to end users.
interface StepDebug {
  step: string;
  ok: boolean;
  detail: unknown;
}

// Second, text-only call using Google Search grounding so Gemini can look at
// real current listings instead of guessing from training data. Sources come
// from the API's own groundingMetadata (structural citations), never from
// text the model wrote itself, since a model-authored URL could be invented.
async function searchPriceWithGemini(
  keys: string[],
  model: string,
  card: { name: string; set: string | null; number: string | null; language: string; printVariant: string | null },
): Promise<{ result: PriceSuggestion | null; debug: StepDebug }> {
  const prompt = `Search the web for the current resale/market price of this specific physical Pokémon TCG card:
- Name: ${card.name}
- Set: ${card.set ?? "unknown"}
- Card number: ${card.number ?? "unknown"}
- Print language: ${card.language}
- Special print/stamp/pattern: ${card.printVariant ?? "none noted -- appears to be a plain, unstamped print"}

This is the ${card.language}-language print specifically -- it is a different, differently-priced product from the English print of the same card, so do not substitute English-print pricing.${card.printVariant ? ` It also has this specific print variant: "${card.printVariant}" -- price THAT variant specifically, not a generic/plain print of the same card number, since stamped or specially-patterned prints (common for Chinese Gem Pack and similar special releases) can be priced very differently from the plain version.` : ""} Prioritize recent sold/completed listings over asking prices where you can find them. Collectr (getcollectr.com / app.getcollectr.com) tracks per-card pricing for Chinese and Japanese Pokémon TCG sets specifically -- check there in addition to general search.

After searching, respond with ONLY a JSON object, no markdown fences, no extra text, matching exactly this shape:
{"amountUsd": number or null, "confident": boolean, "note": string or null}

- "amountUsd": your best estimate of this card's market price in US dollars, based on what you found.
- "confident": true only if you found real, specific pricing for this exact card and this exact language print. false if you found nothing relevant, only found English-print prices, or had to guess.
- "note": one short sentence on what the estimate is based on, or why you're not confident.

Do not include any text outside the JSON object.`;

  try {
    const outcome = await callGemini(keys, model, {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0 },
    });
    if ("error" in outcome) {
      return { result: null, debug: { step: "gemini_search", ok: false, detail: outcome.error } };
    }

    const candidate = outcome.json.candidates?.[0];
    const text = candidate?.content?.parts?.find((p: { text?: string }) => typeof p.text === "string")?.text;
    const parsed = text ? extractJson<{ amountUsd?: number; confident?: boolean; note?: string }>(text) : null;

    if (!parsed || !parsed.confident || typeof parsed.amountUsd !== "number" || parsed.amountUsd <= 0) {
      return { result: null, debug: { step: "gemini_search", ok: false, detail: { rawText: text, parsed } } };
    }

    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const sourceUrls: string[] = chunks
      .map((c: { web?: { uri?: string } }) => c.web?.uri)
      .filter((u: unknown): u is string => typeof u === "string")
      .slice(0, 3);

    return {
      result: {
        source: "gemini_search",
        amountUsd: parsed.amountUsd,
        label: "Estimated from web search",
        sourceUrls,
        note: parsed.note ?? null,
      },
      debug: { step: "gemini_search", ok: true, detail: { parsed, sourceUrls } },
    };
  } catch (err) {
    return { result: null, debug: { step: "gemini_search", ok: false, detail: err instanceof Error ? err.message : String(err) } };
  }
}

// Fallback when grounding search doesn't find anything confident. Only
// covers English/Japanese, so this is a proxy (not a match) for any other
// non-English language -- labeled as such, never presented as exact. Filters
// by set (when we have one) so e.g. a rare special-parallel print doesn't
// silently get priced off an unrelated common print of the same card name.
async function fetchJapaneseProxyPrice(
  apiKey: string,
  cardName: string,
  cardSet: string | null,
): Promise<{ result: PriceSuggestion | null; debug: StepDebug }> {
  try {
    const params = new URLSearchParams({ search: cardName, language: "japanese", limit: "5" });
    if (cardSet) params.set("set", cardSet);
    const url = `https://www.pokemonpricetracker.com/api/v2/cards?${params.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      return { result: null, debug: { step: "japanese_proxy", ok: false, detail: `HTTP ${res.status}` } };
    }

    const json = await res.json();
    const candidates = Array.isArray(json.data) ? json.data : [];
    const card = candidates[0];
    const amountUsd = card?.prices?.market ?? card?.ebay?.psa10?.avg ?? null;

    if (!card || typeof amountUsd !== "number" || amountUsd <= 0) {
      return { result: null, debug: { step: "japanese_proxy", ok: false, detail: { candidateCount: candidates.length, params: params.toString() } } };
    }

    return {
      result: {
        source: "japanese_proxy",
        amountUsd,
        label: "Japanese print reference price",
        sourceUrls: [],
        note: "No pricing found for this exact language print -- this is the Japanese print's price as the closest available reference, not this card's actual market price.",
      },
      debug: { step: "japanese_proxy", ok: true, detail: { matchedCard: { name: card.name, set: card.set }, amountUsd, candidateCount: candidates.length } },
    };
  } catch (err) {
    return { result: null, debug: { step: "japanese_proxy", ok: false, detail: err instanceof Error ? err.message : String(err) } };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const geminiKeys = loadGeminiKeys();
  if (geminiKeys.length === 0) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY (or GEMINI_API_KEYS) is not configured on the server." }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (typeof body.image !== "string" || !body.image) {
    return new Response(JSON.stringify({ error: "Missing or invalid 'image' (must be a base64 JPEG string)." }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const base64 = body.image.split(",").pop(); // strip a data: URL prefix if present

  const model = Deno.env.get("GEMINI_VISION_MODEL") || "gemini-2.5-flash";

  try {
    const identity = await identifyCard(geminiKeys, model, base64);
    if ("error" in identity) {
      return new Response(JSON.stringify({ error: identity.error }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let priceSuggestion: PriceSuggestion | null = null;
    const debugSteps: StepDebug[] = [];
    const isEnglish = !identity.language || identity.language.toLowerCase() === "english";

    // Only worth the extra call(s) for a non-English card we're actually
    // confident about -- English cards already get real pricing from
    // pokemontcg.io client-side, and there's no point pricing a card we
    // couldn't even identify.
    if (!identity.uncertain && identity.name && !isEnglish) {
      const searchOutcome = await searchPriceWithGemini(geminiKeys, model, {
        name: identity.name,
        set: identity.set,
        number: identity.number,
        language: identity.language!,
        printVariant: identity.printVariant,
      });
      priceSuggestion = searchOutcome.result;
      debugSteps.push(searchOutcome.debug);

      if (!priceSuggestion) {
        const pptKey = Deno.env.get("POKEMONPRICETRACKER_API_KEY");
        if (pptKey) {
          const proxyOutcome = await fetchJapaneseProxyPrice(pptKey, identity.name, identity.set);
          priceSuggestion = proxyOutcome.result;
          debugSteps.push(proxyOutcome.debug);
        } else {
          debugSteps.push({ step: "japanese_proxy", ok: false, detail: "POKEMONPRICETRACKER_API_KEY not set" });
        }
      }
    }

    // _debug is temporary while tuning price-suggestion accuracy -- the
    // client ignores unknown fields, so this is harmless to leave in the
    // response but should come out once this is dialed in.
    return new Response(JSON.stringify({ ...identity, priceSuggestion, _debug: debugSteps }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Network error calling Gemini." }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
