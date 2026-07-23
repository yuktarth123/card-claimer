// Live USD->INR conversion, replacing what used to be a hardcoded constant
// that silently went stale (was 83.5 while the real rate is ~96.6, a ~16%
// underprice on every USD-converted listing).
//
// open.er-api.com is the only source -- Frankfurter (ECB-sourced) looked
// like a good primary/secondary pair, but it blocks cross-origin browser
// fetches entirely (verified: works fine from a server-side call, fails
// with a CORS error from an actual browser), so it would never succeed in
// this app regardless of ordering.
const RATE_API_URL = "https://open.er-api.com/v6/latest/USD";

// Only used if we've never successfully fetched a live rate yet (e.g. first
// load with no network) -- a rough safety net, not meant to stay accurate.
const EMERGENCY_FALLBACK_RATE = 90;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour -- FX doesn't need per-second freshness here

let cachedRate = EMERGENCY_FALLBACK_RATE;
let cachedAt = 0;
let inFlight: Promise<number> | null = null;

async function fetchLiveRate(): Promise<number | null> {
  try {
    const res = await fetch(RATE_API_URL);
    const json = await res.json();
    const rate = json?.rates?.INR;
    if (typeof rate === "number" && rate > 0) return rate;
  } catch {
    // network/CORS failure -- caller keeps the last cached rate
  }
  return null;
}

// Synchronous -- safe to call from render. Returns the last successfully
// fetched rate, or the emergency fallback if nothing's been fetched yet.
export function getCachedUsdToInrRate(): number {
  return cachedRate;
}

// Call this on mount wherever a USD price is about to be converted, so the
// cache gets warmed/refreshed without making every call site async.
export async function refreshUsdToInrRate(): Promise<number> {
  if (cachedAt !== 0 && Date.now() - cachedAt < CACHE_TTL_MS) return cachedRate;
  if (inFlight) return inFlight;

  inFlight = fetchLiveRate().then((rate) => {
    inFlight = null;
    if (rate !== null) {
      cachedRate = rate;
      cachedAt = Date.now();
    }
    return cachedRate;
  });
  return inFlight;
}
