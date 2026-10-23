// Fiat values for USDC/XLM via CoinGecko's public API, cached in this browser.
// India first (INR is the default), but any listed currency works.

export const FIATS = {
  INR: { label: "Indian rupee", locale: "en-IN" },
  USD: { label: "US dollar", locale: "en-US" },
  EUR: { label: "Euro", locale: "de-DE" },
  GBP: { label: "British pound", locale: "en-GB" },
  AED: { label: "UAE dirham", locale: "en-AE" },
  SGD: { label: "Singapore dollar", locale: "en-SG" },
  NGN: { label: "Nigerian naira", locale: "en-NG" },
  BRL: { label: "Brazilian real", locale: "pt-BR" },
  PHP: { label: "Philippine peso", locale: "en-PH" },
};

const COIN = { USDC: "usd-coin", XLM: "stellar" };
const CACHE_KEY = "settlesync:fiat-rates";
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

export function formatFiat(n, fiat = "INR") {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  const f = FIATS[fiat] || FIATS.INR;
  try {
    return new Intl.NumberFormat(f.locale, {
      style: "currency",
      currency: fiat,
      maximumFractionDigits: Math.abs(n) < 100 && fiat !== "INR" ? 2 : 0,
    }).format(n);
  } catch {
    return `${fiat} ${Math.round(n)}`;
  }
}

// Rate on the day a payment was received, for the accountant export.
export async function rateOn(assetCode, isoDateTime, fiat = "INR") {
  const coin = COIN[assetCode];
  if (!coin) return null;
  const d = new Date(isoDateTime);
  const date = `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
  const key = `${coin}:${date}`;
  const cache = readCache();
  cache.days ||= {};
  if (!cache.days[key]) {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}/history?date=${date}&localization=false`);
      if (!res.ok) return null;
      const json = await res.json();
      const prices = json?.market_data?.current_price;
      if (!prices) return null;
      cache.days[key] = prices;
      writeCache(cache);
    } catch {
      return null;
    }
  }
  return cache.days[key]?.[fiat.toLowerCase()] ?? null;
}

// Today's rates for dashboard totals: { USDC, XLM } in the chosen currency.
export async function liveRates(fiat = "INR") {
  const cache = readCache();
  const hit = cache.live?.[fiat];
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.rates;
  try {
    const vs = fiat.toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,stellar&vs_currencies=${vs}`);
    if (!res.ok) return hit?.rates || null;
    const j = await res.json();
    const rates = { USDC: j["usd-coin"]?.[vs] ?? null, XLM: j.stellar?.[vs] ?? null };
    cache.live = { ...(cache.live || {}), [fiat]: { at: Date.now(), rates } };
    writeCache(cache);
    return rates;
  } catch {
    return hit?.rates || null;
  }
}
