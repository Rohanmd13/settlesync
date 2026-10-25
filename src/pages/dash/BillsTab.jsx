import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import InvoiceSheet from "../../components/InvoiceSheet";
import { QrImage, useCopy } from "../../components/bits";
import { CopyIcon } from "../../components/Icons";
import { statusOf, STATUS_LABEL, formatAmount, formatDate, remainingOf, relativeTime } from "../../lib/invoices";
import { NETWORK, shortAddr } from "../../lib/stellar";
import { payInvoice } from "../../lib/actions";

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
            <small>{b.id} · requested {relativeTime(b.requestedAt)}</small>
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
  const [busy, setBusy] = useState(false);
  const [stampKey, setStampKey] = useState(null);
  const status = statusOf(bill);
  const remaining = remainingOf(bill);
  const balance = account ? (bill.assetCode === "XLM" ? Number(account.xlm) : Number(account.usdc ?? 0)) : null;
  const lacksTrust = bill.assetCode === "USDC" && account?.exists && !account.hasUsdcTrustline;
  const tooLow = balance !== null && balance < Number(remaining);

  const sheet = { ...bill, fromName: name || "Requester", client: "You", description: "Payment request sent to your wallet", createdAt: bill.requestedAt };

  const pay = async () => {
    setBusy(true);
    try {
      await payInvoice({ payer: address, to: bill.to, amount: remaining, assetCode: bill.assetCode, invoiceId: bill.id });
      setStampKey(Date.now());
      setNotice({ kind: "success", text: `Paid ${formatAmount(remaining, bill.assetCode)} for ${bill.id}. ${name || "They"} will see it marked paid automatically.` });
      onPaid();
    } catch (e) {
      setNotice({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail">
      <InvoiceSheet inv={sheet} status={stampKey ? "paid" : status} stampKey={stampKey} />
      {status !== "paid" && !stampKey ? (
        <div className="card">
          <p className="card__title">Pay {name || shortAddr(bill.to)}</p>
          <p className="pay__amount">{formatAmount(remaining, bill.assetCode)}</p>
          <p className="small muted">From {shortAddr(bill.to)}{name ? "" : " (no name published)"}. Settles in about 5 seconds.</p>
          {lacksTrust && <p className="alert alert--warn">Your wallet can't hold USDC yet. Use "Enable USDC" above, then add USDC to it.</p>}
          {!lacksTrust && tooLow && <p className="alert alert--warn">Your balance ({formatAmount(balance, bill.assetCode)}) is lower than this bill.</p>}
          <button className="btn btn--primary btn--wide btn--lg" onClick={pay} disabled={busy || lacksTrust || !account?.exists}>
            {busy ? "Approve in your wallet…" : `Pay ${formatAmount(remaining, bill.assetCode)}`}
          </button>
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
      <p className="small muted">
        Request received {formatDate(bill.requestedAt)}. <a href={NETWORK.explorerTx(bill.requestHash)} target="_blank" rel="noreferrer">See it on Stellar</a>
      </p>
    </div>
  );
}
