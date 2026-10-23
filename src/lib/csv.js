import { inrRateOn } from "./inr";
import { NETWORK } from "./stellar";
import { statusOf, STATUS_LABEL } from "./invoices";

function cell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per received payment (that's what a CA reconciles against),
// plus one row for each invoice still unpaid.
export async function buildLedgerCsv(invoices, ownerAddress) {
  const header = [
    "Invoice ID",
    "Client",
    "Description",
    "Invoice date",
    "Due date",
    "Invoice amount",
    "Asset",
    "Status",
    "Payment received (UTC)",
    "Amount received",
    "INR rate on receipt day",
    "INR value on receipt day",
    "Paid from wallet",
    "Transaction link",
  ];
  const rows = [header];

  for (const inv of invoices) {
    const base = [
      inv.id,
      inv.client,
      inv.description,
      inv.createdAt?.slice(0, 10),
      inv.dueDate,
      inv.amount,
      inv.assetCode,
      STATUS_LABEL[statusOf(inv)],
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

  const note = [
    [],
    [`Wallet: ${ownerAddress}`],
    [`Network: Stellar ${NETWORK.name.toLowerCase()}`],
    ["INR rates: CoinGecko daily rate for the receipt date. A record for your CA, not tax advice."],
  ];
  return [...rows, ...note].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
