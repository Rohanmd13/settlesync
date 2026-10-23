import { useMemo, useState } from "react";
import { useApp } from "../../lib/app";
import { describePayment, buildHistoryCsv, downloadText } from "../../lib/csv";
import { formatAmount, relativeTime, formatDate } from "../../lib/invoices";
import { NETWORK, shortAddr } from "../../lib/stellar";
import { DownloadIcon } from "../../components/Icons";

const FILTERS = { all: "Everything", settlesync: "SettleSync only", in: "Received", out: "Sent" };

export default function HistoryTab({ payments, names }) {
  const { address, profile } = useApp();
  const [filter, setFilter] = useState("settlesync");
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(
    () =>
      payments
        .map((p) => ({ ...p, what: describePayment(p, address) }))
        .filter((p) => {
          if (filter === "settlesync") return p.what.kind !== "other";
          if (filter === "in" || filter === "out") return p.direction === filter;
          return true;
        }),
    [payments, filter, address]
  );

  // Group by day for a ledger-book feel.
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const day = r.createdAt.slice(0, 10);
      if (!m.has(day)) m.set(day, []);
      m.get(day).push(r);
    }
    return [...m.entries()];
  }, [rows]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadText(`settlesync-history-${new Date().toISOString().slice(0, 10)}.csv`, await buildHistoryCsv(rows, address, profile.currency || "INR"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <div className="chips" role="group" aria-label="Filter history">
          {Object.entries(FILTERS).map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? "is-on" : ""}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>{label}</button>
          ))}
        </div>
        <div className="toolbar__end">
          <button className="btn btn--ghost" onClick={exportCsv} disabled={!rows.length || exporting}><DownloadIcon /> {exporting ? "Preparing…" : "Export CSV"}</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ledger"><div className="empty empty--small"><p>Nothing here yet. Payments and requests appear as soon as they happen on Stellar.</p></div></div>
      ) : (
        <div className="history">
          {groups.map(([day, list]) => (
            <section key={day} className="history__day">
              <h3>{formatDate(day)}</h3>
              <ul>
                {list.map((p) => {
                  const who = p.direction === "in" ? p.from : p.to;
                  const sign = p.direction === "in" ? "+" : "−";
                  return (
                    <li key={p.id} className={`history__item history__item--${p.direction} history__item--${p.what.kind === "code" ? "request" : p.what.kind}`}>
                      <span className="history__dir" aria-hidden="true">{p.direction === "in" ? "↓" : "↑"}</span>
                      <span className="history__what">
                        <b>{p.what.label}</b>
                        <small>{p.direction === "in" ? "from" : "to"} {names[who] || shortAddr(who)} · {relativeTime(p.createdAt)}</small>
                      </span>
                      <span className="history__amt">{p.what.kind === "request" ? "request" : p.what.kind === "code" ? "locked in code" : `${sign}${formatAmount(p.amount, p.assetCode)}`}</span>
                      <a className="history__link" href={NETWORK.explorerTx(p.hash)} target="_blank" rel="noreferrer" aria-label="View transaction on Stellar">View</a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="small muted">Showing the latest 200 payments on this wallet.</p>
        </div>
      )}
    </>
  );
}
