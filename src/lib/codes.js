// Claim codes this wallet created, kept in this browser so the sender can
// re-share them or take the money back while they're unredeemed.
import { NETWORK } from "./stellar";

const KEY = (addr) => (NETWORK.id === "mainnet" ? `settlesync:codes:mainnet:${addr}` : `settlesync:codes:${addr}`);

export function loadCodes(addr) {
  try {
    return JSON.parse(localStorage.getItem(KEY(addr)) || "[]");
  } catch {
    return [];
  }
}

export function saveCodes(addr, list) {
  try {
    localStorage.setItem(KEY(addr), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function claimLinkFor(secret) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/claim/${secret}${NETWORK.id === "mainnet" ? "?n=mainnet" : ""}`;
}

// Accepts a raw code (S…) or a full claim link.
export function extractSecret(input) {
  const s = (input || "").trim();
  const m = s.match(/#\/claim\/(S[A-Z2-7]{55})/);
  if (m) return m[1];
  const raw = s.match(/S[A-Z2-7]{55}/);
  return raw ? raw[0] : s;
}
