// INR value on the day a payment was received, for the CA export.
// Uses CoinGecko's public daily history; cached in this browser so each
// (asset, day) pair is fetched once.

const COIN = { USDC: "usd-coin", XLM: "stellar" };
const CACHE_KEY = "settlesync:inr-rates";

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
