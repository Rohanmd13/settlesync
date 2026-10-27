// Invoices live in this browser (localStorage), keyed by the wallet that issues them.
// Invoices sent as on-chain payment requests can also be restored from Stellar itself.
import { parseRequestMemo, shortAddr, NETWORK } from "./stellar";

// Testnet keeps the original key so existing pilot data stays; Main Net is separate.
const KEY = (addr) => (NETWORK.id === "mainnet" ? `settlesync:invoices:mainnet:${addr}` : `settlesync:invoices:${addr}`);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

export const FREE_INVOICES_PER_MONTH = 5;

export function newInvoiceId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `SS-${s}`; // 9 chars, well within Stellar's 28-byte text memo
}

export function loadInvoices(addr) {
  try {
    return JSON.parse(localStorage.getItem(KEY(addr)) || "[]");
  } catch {
    return [];
  }
}

export function saveInvoices(addr, list) {
  try {
    localStorage.setItem(KEY(addr), JSON.stringify(list));
  } catch {
    /* storage full or blocked; the in-memory list still works this session */
  }
}

// Rebuild invoices this wallet requested on-chain but that aren't in this browser
// (new device, cleared storage). Also records which client each request went to.
export function mergeRequestedFromChain(list, payments, owner) {
  const byId = new Map(list.map((i) => [i.id, i]));
  let changed = false;
  for (const p of payments) {
    if (p.direction !== "out" || p.from !== owner) continue;
    const req = parseRequestMemo(p.memo);
    if (!req) continue;
    const existing = byId.get(req.invoiceId);
    if (existing) {
      if (!existing.requestedTo) {
        byId.set(req.invoiceId, { ...existing, requestedTo: p.to, requestedAt: p.createdAt });
        changed = true;
      }
      continue;
    }
    byId.set(req.invoiceId, {
      id: req.invoiceId,
      to: owner,
      amount: req.amount,
      assetCode: req.assetCode,
      client: shortAddr(p.to),
      clientAddress: p.to,
      description: "",
      createdAt: p.createdAt,
      dueDate: "",
      requestedTo: p.to,
      requestedAt: p.createdAt,
      part: req.part,
      minPart: req.minPart,
      restored: true,
    });
    changed = true;
  }
  if (!changed) return null;
  return [...byId.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

// ---------- pay links ----------
const PUBLIC_FIELDS = ["id", "to", "fromName", "gstin", "client", "description", "amount", "assetCode", "dueDate", "createdAt", "net", "part", "minPart"];

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function payLinkFor(inv) {
  const data = Object.fromEntries(PUBLIC_FIELDS.filter((k) => inv[k]).map((k) => [k, inv[k]]));
  data.net = inv.net || NETWORK.id;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/pay/${toBase64Url(JSON.stringify(data))}`;
}

export function decodePayLink(token) {
  try {
    const d = JSON.parse(fromBase64Url(token));
    if (!d.id || !d.to || !d.amount || !d.assetCode) return null;
    return d;
  } catch {
    return null;
  }
}

// ---------- matching ----------
// Match incoming payments to invoices by memo (= invoice ID) and asset.
// Several payments with the same memo are summed, so part-payments add up.
export function matchPayments(invoices, payments) {
  return invoices.map((inv) => {
    const hits = payments.filter(
      (p) => (p.direction ?? "in") === "in" && p.memo === inv.id && p.assetCode === inv.assetCode
    );
    if (hits.length === 0) return { ...inv, received: 0, payments: [], paidAt: null };
    const received = hits.reduce((s, p) => s + Number(p.amount), 0);
    const sorted = [...hits].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      ...inv,
      received,
      payments: sorted,
      paidAt: received + 1e-7 >= Number(inv.amount) ? sorted[sorted.length - 1].createdAt : null,
    };
  });
}

// Bills: payment requests other wallets sent to `me`, with what I've paid against each.
export function billsFor(me, payments) {
  const bills = new Map();
  for (const p of payments) {
    if (p.direction !== "in" || p.from === me) continue;
    const req = parseRequestMemo(p.memo);
    if (!req) continue;
    const key = `${p.from}:${req.invoiceId}`;
    if (!bills.has(key)) {
      bills.set(key, {
        key,
        id: req.invoiceId,
        to: p.from,
        amount: req.amount,
        assetCode: req.assetCode,
        part: req.part,
        minPart: req.minPart,
        requestedAt: p.createdAt,
        requestHash: p.hash,
      });
    }
  }
  return [...bills.values()]
    .map((b) => {
      const paid = payments.filter(
        (p) => p.direction === "out" && p.to === b.to && p.memo === b.id && p.assetCode === b.assetCode
      );
      const received = paid.reduce((s, p) => s + Number(p.amount), 0);
      const last = paid.sort((a, c) => a.createdAt.localeCompare(c.createdAt)).at(-1);
      return {
        ...b,
        received,
        payments: paid,
        paidAt: received + 1e-7 >= Number(b.amount) ? last?.createdAt : null,
      };
    })
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

// Today's date in the user's own time zone (not UTC), as YYYY-MM-DD.
export function localDay(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function statusOf(inv) {
  if (inv.paidAt) return "paid";
  if (inv.received > 0) return "partial";
  if (inv.dueDate && inv.dueDate < localDay()) return "overdue";
  return "pending";
}

export const STATUS_LABEL = {
  paid: "Paid",
  partial: "Part paid",
  overdue: "Overdue",
  pending: "Awaiting payment",
};

export function invoicesThisMonth(list) {
  const ym = new Date().toISOString().slice(0, 7);
  return list.filter((i) => !i.restored && (i.createdAt || "").startsWith(ym)).length;
}

// Part payments: is `amount` an acceptable payment towards this invoice right now?
// Returns an error message, or "" when it's fine. The final payment may be below the minimum.
export function partAmountError(inv, amount) {
  const rem = Number(remainingOf(inv));
  const n = Number(amount);
  if (!/^\d+(\.\d{1,7})?$/.test(String(amount).trim()) || !(n > 0)) return "Enter an amount greater than zero, with up to 7 decimals.";
  if (n > rem + 1e-7) return `That's more than what's left (${formatAmount(rem, inv.assetCode)}).`;
  const min = Number(inv.minPart || 0);
  if (min > 0 && n + 1e-7 < Math.min(min, rem)) return `The minimum for each payment is ${formatAmount(min, inv.assetCode)}.`;
  return "";
}

export function remainingOf(inv) {
  const r = Math.max(0, Number(inv.amount) - (inv.received || 0));
  return r.toFixed(7).replace(/\.?0+$/, "");
}

// ---------- formatting ----------
export function formatAmount(n, code) {
  const num = Number(n || 0);
  return `${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 7 })} ${code}`;
}

export function formatINR(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(iso);
}

// ---------- backup ----------
export function backupJson(addr, list) {
  return JSON.stringify({ app: "settlesync", version: 1, wallet: addr, exportedAt: new Date().toISOString(), invoices: list }, null, 2);
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data?.app !== "settlesync" || !Array.isArray(data.invoices)) throw new Error("This isn't a SettleSync backup file.");
  return data;
}
