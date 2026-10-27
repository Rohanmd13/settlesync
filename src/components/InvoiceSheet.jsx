import { formatAmount, formatDate, STATUS_LABEL } from "../lib/invoices";
import { shortAddr } from "../lib/stellar";

// The invoice as a ledger page: red bahi-khata spine on the left, ruled lines,
// and a violet PAID stamp (Indian office stamp-pad ink) when a payment matches.
export default function InvoiceSheet({ inv, status = "pending", stampKey, printable = false }) {
  return (
    <article className={`sheet ${printable ? "print-target" : ""}`} aria-label={`Invoice ${inv.id}`}>
      <div className="sheet__spine" aria-hidden="true" />
      <div className="sheet__body">
        <header className="sheet__head">
          <div>
            <p className="sheet__from">{inv.fromName || "Freelancer"}</p>
            {inv.gstin && <p className="sheet__meta">GSTIN {inv.gstin}</p>}
            <p className="sheet__meta" title={inv.to}>{shortAddr(inv.to)}</p>
          </div>
          <div className="sheet__id">
            <span>Invoice</span>
            <strong>{inv.id}</strong>
          </div>
        </header>

        <dl className="sheet__rows">
          <div><dt>Billed to</dt><dd>{inv.client || "—"}</dd></div>
          <div><dt>For</dt><dd>{inv.description || "—"}</dd></div>
          <div><dt>Issued</dt><dd>{formatDate(inv.createdAt)}</dd></div>
          <div><dt>Due</dt><dd>{formatDate(inv.dueDate)}</dd></div>
        </dl>

        <div className="sheet__total">
          <span>Amount due</span>
          <strong>{formatAmount(inv.amount, inv.assetCode)}</strong>
        </div>

        {inv.part && status !== "paid" && (
          <p className="sheet__partnote">Part payments accepted{Number(inv.minPart) > 0 ? `, at least ${formatAmount(inv.minPart, inv.assetCode)} each` : ""}</p>
        )}
        {inv.received > 0 && status !== "paid" && (
          <p className="sheet__partial">Received so far: {formatAmount(inv.received, inv.assetCode)}</p>
        )}

        <p className={`sheet__status sheet__status--${status}`}>{STATUS_LABEL[status]}</p>
        <p className="sheet__foot">Pay on Stellar with memo {inv.id}. Settled wallet to wallet; SettleSync never holds funds.</p>
      </div>

      {status === "paid" && (
        <div key={stampKey} className={`stamp ${stampKey ? "stamp--land" : ""}`} role="img" aria-label="Paid">
          <span>Paid</span>
          <small>{formatDate(inv.paidAt)}</small>
        </div>
      )}
    </article>
  );
}
