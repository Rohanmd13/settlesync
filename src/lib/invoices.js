// Invoices live in this browser (localStorage), keyed by the freelancer's wallet.
// The pay link carries the invoice details itself, so the client needs no account.

const KEY = (addr) => `settlesync:invoices:${addr}`;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

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

// Fields the client sees on the pay page.
const PUBLIC_FIELDS = ["id", "to", "fromName", "client", "description", "amount", "assetCode", "dueDate", "createdAt"];

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
  const data = Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, inv[k]]));
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

// Match incoming payments to invoices by memo (= invoice ID) and asset.
// Several payments with the same memo are summed, so part-payments add up.
export function matchPayments(invoices, payments) {
  return invoices.map((inv) => {
    const hits = payments.filter((p) => p.memo === inv.id && p.assetCode === inv.assetCode);
    if (hits.length === 0) return { ...inv, received: 0, payments: [] };
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

export function statusOf(inv) {
  if (inv.paidAt) return "paid";
  if (inv.received > 0) return "partial";
  if (inv.dueDate && inv.dueDate < new Date().toISOString().slice(0, 10)) return "overdue";
  return "pending";
}

export const STATUS_LABEL = {
  paid: "Paid",
  partial: "Part paid",
  overdue: "Overdue",
  pending: "Awaiting payment",
};

export function formatAmount(n, code) {
  const num = Number(n || 0);
  return `${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 7 })} ${code}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
