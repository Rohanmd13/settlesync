import { inrRateOn } from "./inr";
import { NETWORK, parseRequestMemo } from "./stellar";
import { statusOf, STATUS_LABEL } from "./invoices";

function cell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (rows) => rows.map((r) => r.map(cell).join(",")).join("\n");

const FOOTNOTE = (owner) => [
  [],
  [`Wallet: ${owner}`],
  [`Network: Stellar ${NETWORK.name.toLowerCase()}`],
  ["INR rates: CoinGecko daily rate for the receipt date. A record for your CA, not tax advice."],
];

// Invoices ledger: one row per received payment (what a CA reconciles against),
// plus one row for each invoice still unpaid.
export async function buildLedgerCsv(invoices, owner, profile = {}) {
  const rows = [[
    "Invoice ID", "Client", "Description", "Invoice date", "Due date", "Invoice amount", "Asset", "Status",
    "Payment received (UTC)", "Amount received", "INR rate on receipt day", "INR value on receipt day",
    "Paid from wallet", "Transaction link",
  ]];
  for (const inv of invoices) {
    const base = [
      inv.id, inv.client, inv.description, inv.createdAt?.slice(0, 10), inv.dueDate,
      inv.amount, inv.assetCode, STATUS_LABEL[statusOf(inv)],
    ];
    if (!inv.payments?.length) {
      rows.push([...base, "", "", "", "", "", ""]);
      continue;
    }
    for (const p of inv.payments) {
      const rate = await inrRateOn(p.assetCode, p.createdAt);
      rows.push([
        ...base,
        p.createdAt.replace("T", " ").replace("Z", ""),
        p.amount,
        rate ? rate.toFixed(4) : "unavailable",
        rate ? (Number(p.amount) * rate).toFixed(2) : "",
        p.from,
        NETWORK.explorerTx(p.hash),
      ]);
    }
  }
  const head = profile.name ? [[`${profile.name}${profile.gstin ? ` (GSTIN ${profile.gstin})` : ""}`], []] : [];
  return toCsv([...head, ...rows, ...FOOTNOTE(owner)]);
}

// Full payment history, both directions, with what each payment was.
export async function buildHistoryCsv(payments, owner) {
  const rows = [["Date (UTC)", "Direction", "What", "Amount", "Asset", "INR value on the day", "Counterparty", "Memo", "Transaction link"]];
  for (const p of payments) {
    const what = describePayment(p, owner);
    const rate = what.kind === "request" ? null : await inrRateOn(p.assetCode, p.createdAt);
    rows.push([
      p.createdAt.replace("T", " ").replace("Z", ""),
      p.direction === "in" ? "Received" : "Sent",
      what.label,
      p.amount,
      p.assetCode,
      rate ? (Number(p.amount) * rate).toFixed(2) : "",
      p.direction === "in" ? p.from : p.to,
      p.memo || "",
      NETWORK.explorerTx(p.hash),
    ]);
  }
  return toCsv([...rows, ...FOOTNOTE(owner)]);
}

export function describePayment(p) {
  const req = parseRequestMemo(p.memo);
  if (req) {
    return p.direction === "in"
      ? { kind: "request", label: `Payment request ${req.invoiceId} received` }
      : { kind: "request", label: `Payment request ${req.invoiceId} sent` };
  }
  if (p.memo && /^SS-[A-Z2-9]{6}$/.test(p.memo)) {
    return p.direction === "in"
      ? { kind: "invoice", label: `Payment received for ${p.memo}` }
      : { kind: "invoice", label: `Paid invoice ${p.memo}` };
  }
  return { kind: "other", label: p.direction === "in" ? "Payment received" : "Payment sent" };
}

export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
