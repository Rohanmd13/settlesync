import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../lib/app";
import { describePayment } from "../../lib/csv";
import { downloadHistoryXlsx } from "../../lib/xlsx";
import { formatAmount, relativeTime, formatDate, localDay } from "../../lib/invoices";
import { NETWORK, shortAddr } from "../../lib/stellar";
import { DownloadIcon } from "../../components/Icons";
import { liveRates, formatFiat } from "../../lib/inr";

const FILTERS = { all: "Everything", settlesync: "SettleSync only", in: "Received", out: "Sent" };
const PERIODS = { month: "This month", year: "This year", all: "All time", custom: "Custom dates" };

// Money that actually moved: excludes request nudges and the deposit locked in a claim code.
const isRealMoney = (p) => p.what.kind !== "request" && p.what.kind !== "code";

function periodRange(period, from, to) {
  const now = new Date();
  if (period === "month") return [new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), null];
  if (period === "year") return [new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), null];
  if (period === "custom") return [from ? new Date(from + "T00:00:00Z") : null, to ? new Date(to + "T23:59:59Z") : null];
  return [null, null];
}

export default function HistoryTab({ payments, names }) {
  const { address, profile } = useApp();
  const [filter, setFilter] = useState("settlesync");
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState(() => localDay());
  const [to, setTo] = useState(() => localDay());
  const [exporting, setExporting] = useState(false);
  const [rates, setRates] = useState(null);
  const fiat = profile.currency || "INR";

  useEffect(() => {
    liveRates(fiat).then(setRates);
  }, [fiat]);

  const [start, end] = periodRange(period, from, to);
  const inPeriod = (p) => {
    const t = new Date(p.createdAt);
    return (!start || t >= start) && (!end || t <= end);
  };

  const all = useMemo(() => payments.map((p) => ({ ...p, what: describePayment(p, address) })), [payments, address]);

  const rows = useMemo(
    () =>
      all.filter(inPeriod).filter((p) => {
        if (filter === "settlesync") return p.what.kind !== "other";
        if (filter === "in" || filter === "out") return p.direction === filter;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, filter, period, from, to]
  );

  // Totals for the chosen period, per asset and in the user's currency at today's rate.
  const totals = useMemo(() => {
    const t = { in: { USDC: 0, XLM: 0, n: 0 }, out: { USDC: 0, XLM: 0, n: 0 } };
    for (const p of rows) {
      if (!isRealMoney(p)) continue;
      const side = t[p.direction];
      side[p.assetCode] = (side[p.assetCode] || 0) + Number(p.amount);
      side.n += 1;
    }
    const val = (s) => (rates ? (s.USDC || 0) * (rates.USDC || 0) + (s.XLM || 0) * (rates.XLM || 0) : null);
    return { ...t, inFiat: val(t.in), outFiat: val(t.out), netFiat: rates ? val(t.in) - val(t.out) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rates]);

  const assetLine = (s) => [s.USDC ? formatAmount(s.USDC, "USDC") : null, s.XLM ? formatAmount(s.XLM, "XLM") : null].filter(Boolean).join(" + ") || "nothing yet";

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
      await downloadHistoryXlsx(rows, address, profile.currency || "INR");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="period">
        <div className="seg" role="tablist" aria-label="Period">
          {Object.entries(PERIODS).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={period === k} className={period === k ? "is-on" : ""} onClick={() => setPeriod(k)}>{label}</button>
          ))}
        </div>
        {period === "custom" && (
          <div className="period__dates">
            <label>From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
      </div>

      <div className="totals" aria-label="Totals for this period">
        <div className="totals__card totals__card--in">
          <span className="totals__label">Received</span>
          <strong>{totals.inFiat === null ? "—" : formatFiat(totals.inFiat, fiat)}</strong>
          <small>{assetLine(totals.in)} · {totals.in.n} payments</small>
        </div>
        <div className="totals__card totals__card--out">
          <span className="totals__label">Sent</span>
          <strong>{totals.outFiat === null ? "—" : formatFiat(totals.outFiat, fiat)}</strong>
          <small>{assetLine(totals.out)} · {totals.out.n} payments</small>
        </div>
        <div className="totals__card">
          <span className="totals__label">Net</span>
          <strong className={totals.netFiat < 0 ? "is-neg" : ""}>{totals.netFiat === null ? "—" : formatFiat(totals.netFiat, fiat)}</strong>
          <small>{PERIODS[period].toLowerCase()} · {fiat} at today's rate</small>
        </div>
      </div>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="Filter history">
          {Object.entries(FILTERS).map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? "is-on" : ""}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>{label}</button>
          ))}
        </div>
        <div className="toolbar__end">
          <button className="btn btn--ghost" onClick={exportCsv} disabled={!rows.length || exporting}><DownloadIcon /> {exporting ? "Preparing…" : "Download Excel"}</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ledger"><div className="empty empty--small"><p>{all.length ? "No payments in this period. Try All time or other dates." : "Nothing here yet. Payments and requests appear as soon as they happen on Stellar."}</p></div></div>
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
                        <small>{p.direction === "in" ? "from" : "to"} {names[who] || shortAddr(who)} · {relativeTime(p.createdAt)}{p.paidWith ? ` · ${p.direction === "in" ? "they paid" : "you paid"} ${formatAmount(p.paidWith.amount, p.paidWith.assetCode)}, converted` : ""}</small>
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
