// INR values via CoinGecko's public API, cached in this browser.

const COIN = { USDC: "usd-coin", XLM: "stellar" };
const CACHE_KEY = "settlesync:inr-rates";
const LIVE_TTL_MS = 10 * 60 * 1000;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeCache(c) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

// Rate on the day a payment was received, for the CA export.
export async function inrRateOn(assetCode, isoDateTime) {
  const coin = COIN[assetCode];
  if (!coin) return null;
  const d = new Date(isoDateTime);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const key = `${coin}:${dd}-${mm}-${d.getUTCFullYear()}`;
  const cache = readCache();
  if (cache[key]) return cache[key];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coin}/history?date=${dd}-${mm}-${d.getUTCFullYear()}&localization=false`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const rate = json?.market_data?.current_price?.inr ?? null;
    if (rate) {
      cache[key] = rate;
      writeCache(cache);
    }
    return rate;
  } catch {
    return null;
  }
}

// Today's rates for the dashboard totals.
export async function liveInrRates() {
  const cache = readCache();
  if (cache.live && Date.now() - cache.live.at < LIVE_TTL_MS) return cache.live.rates;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,stellar&vs_currencies=inr");
    if (!res.ok) return cache.live?.rates || null;
    const j = await res.json();
    const rates = { USDC: j["usd-coin"]?.inr ?? null, XLM: j.stellar?.inr ?? null };
    cache.live = { at: Date.now(), rates };
    writeCache(cache);
    return rates;
  } catch {
    return cache.live?.rates || null;
  }
}
