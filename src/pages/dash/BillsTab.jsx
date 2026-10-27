import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import PayBox from "../../components/PayBox";
import InvoiceSheet from "../../components/InvoiceSheet";
import { QrImage, useCopy } from "../../components/bits";
import { CopyIcon } from "../../components/Icons";
import { statusOf, STATUS_LABEL, formatAmount, formatDate, remainingOf, relativeTime } from "../../lib/invoices";
import { NETWORK, shortAddr } from "../../lib/stellar";

export default function BillsTab({ bills, names, account, setNotice, onPaid }) {
  const { address } = useApp();
  const [selectedKey, setSelectedKey] = useState(null);
  const [copied, copy] = useCopy();
  const selected = bills.find((b) => b.key === selectedKey) || null;
  const panelRef = useRef(null);
  useEffect(() => {
    if ((selectedKey) && window.innerWidth < 900) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedKey]);
  const open = bills.filter((b) => !b.paidAt);
  const done = bills.filter((b) => b.paidAt);

  if (bills.length === 0) {
    return (
      <div className="bills-empty">
        <div>
          <h2>No bills yet</h2>
          <p>
            When a freelancer or vendor sends a SettleSync request to your wallet, it shows up here with their name, the amount and
            the invoice number. Pay it with one tap, no link needed.
          </p>
          <p>Share your Stellar address with the people you pay:</p>
          <div className="share__row">
            <input readOnly value={address} onFocus={(e) => e.target.select()} aria-label="Your Stellar address" />
            <button className="btn btn--primary" onClick={() => copy(address, "addr")}><CopyIcon /> {copied === "addr" ? "Copied" : "Copy"}</button>
          </div>
          <p className="small muted">Got a pay link instead? Just open it; it works with this same wallet.</p>
        </div>
        <div className="bills-empty__qr">
          <QrImage text={address} size={160} />
          <small>Your wallet address</small>
        </div>
      </div>
    );
  }

  const Row = ({ b }) => {
    const s = statusOf(b);
    return (
      <li>
        <button className={`ledger__row ${b.key === selectedKey ? "is-selected" : ""}`} onClick={() => setSelectedKey(b.key)}>
          <span className="ledger__client">
            <strong>{names[b.to] || shortAddr(b.to)}</strong>
            <small>{b.id} · {b.viaLink ? "from a pay link" : `requested ${relativeTime(b.requestedAt)}`}{b.received > 0 && b.received + 1e-7 < Number(b.amount) ? ` · ${formatAmount(Number(b.amount) - b.received, b.assetCode)} left` : ""}</small>
          </span>
          <span className="ledger__amt">{formatAmount(b.amount, b.assetCode)}</span>
          <span className={`pill pill--${s}`}>{s === "pending" ? "To pay" : STATUS_LABEL[s]}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="ws-grid">
      <div className="ledger" aria-label="Bills">
        {open.length > 0 && <p className="ledger__group">To pay</p>}
        <ul className="ledger__rows">{open.map((b) => <Row key={b.key} b={b} />)}</ul>
        {done.length > 0 && <p className="ledger__group">Paid</p>}
        <ul className="ledger__rows">{done.map((b) => <Row key={b.key} b={b} />)}</ul>
        <p className="ledger__note small muted">Only pay requests from people you know. Anyone can send a request to a public address.</p>
      </div>
      <aside className="panel" ref={panelRef}>
        {selected ? (
          <BillDetail bill={selected} name={names[selected.to]} account={account} setNotice={setNotice} onPaid={onPaid} />
        ) : (
          <div className="panel__empty"><p>Pick a bill to see who sent it and pay it.</p></div>
        )}
      </aside>
    </div>
  );
}

function BillDetail({ bill, name, account, setNotice, onPaid }) {
  const { address } = useApp();
  const [stampKey, setStampKey] = useState(null);
  const status = statusOf(bill);
  const remaining = remainingOf(bill);

  const sheet = { ...bill, fromName: name || bill.fromName || "Requester", client: "You", description: bill.description || (bill.viaLink ? "Invoice paid from a pay link" : "Payment request sent to your wallet"), createdAt: bill.requestedAt };

  const paid = ({ amount, paidWith }) => {
    const full = (bill.received || 0) + amount + 1e-7 >= Number(bill.amount);
    if (full) setStampKey(Date.now());
    setNotice({ kind: "success", text: `Paid ${formatAmount(amount, bill.assetCode)}${paidWith ? ` (with ${paidWith})` : ""} for ${bill.id}. ${name || "They"} will see it on their invoice automatically.` });
    onPaid();
  };

  return (
    <div className="detail">
      <InvoiceSheet inv={sheet} status={stampKey ? "paid" : status} stampKey={stampKey} />
      {status !== "paid" && !stampKey ? (
        <div className="card">
          <p className="card__title">{bill.received > 0 ? "Left to pay" : `Pay ${name || bill.fromName || shortAddr(bill.to)}`}</p>
          <p className="pay__amount">{formatAmount(remaining, bill.assetCode)}</p>
          {bill.received > 0 && <p className="small">Already paid {formatAmount(bill.received, bill.assetCode)} of {formatAmount(bill.amount, bill.assetCode)}.</p>}
          <p className="small muted">From {shortAddr(bill.to)}{name ? "" : " (no name published)"}. Settles in about 5 seconds.</p>
          <PayBox inv={bill} remaining={remaining} payer={address} payerInfo={account} payeeName={name || bill.fromName} blocked={!account?.exists} onPaid={paid} onStale={onPaid} />
        </div>
      ) : (
        <div className="card">
          <p className="card__title">Paid</p>
          {bill.payments?.map((p) => (
            <p key={p.id} className="small">
              {formatAmount(p.amount, p.assetCode)} on {formatDate(p.createdAt)}.{" "}
              <a href={NETWORK.explorerTx(p.hash)} target="_blank" rel="noreferrer">View transaction</a>
            </p>
          ))}
        </div>
      )}
      {bill.viaLink ? (
        <p className="small muted">Saved here when you paid part of it from a pay link, so you can finish paying without the link.</p>
      ) : (
        <p className="small muted">
          Request received {formatDate(bill.requestedAt)}. <a href={NETWORK.explorerTx(bill.requestHash)} target="_blank" rel="noreferrer">See it on Stellar</a>
        </p>
      )}
    </div>
  );
}
