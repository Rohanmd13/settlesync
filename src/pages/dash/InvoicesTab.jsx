import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import InvoiceSheet from "../../components/InvoiceSheet";
import { QrImage, useCopy, whatsappLink, printInvoice } from "../../components/bits";
import { CopyIcon, QrIcon, PrintIcon, SendIcon, ChatIcon, PlusIcon, SearchIcon, DownloadIcon } from "../../components/Icons";
import {
  newInvoiceId,
  payLinkFor,
  statusOf,
  STATUS_LABEL,
  formatAmount,
  formatDate,
  remainingOf,
} from "../../lib/invoices";
import { NETWORK, shortAddr, isValidAddress, requestMemoFits } from "../../lib/stellar";
import { sendPaymentRequest } from "../../lib/actions";
import { buildLedgerCsv, downloadText } from "../../lib/csv";
import { formatFiat } from "../../lib/inr";

const FILTERS = { all: "All", open: "Open", overdue: "Overdue", paid: "Paid" };

export default function InvoicesTab({ invoices, persist, rawInvoices, account, justPaid, setNotice, onRequested, rates, fiat = "INR" }) {
  const { address, profile } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [exporting, setExporting] = useState(false);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((i) => {
      const s = statusOf(i);
      if (filter === "open" && s === "paid") return false;
      if (filter === "overdue" && s !== "overdue") return false;
      if (filter === "paid" && s !== "paid") return false;
      if (!needle) return true;
      return [i.id, i.client, i.description, i.amount].some((v) => String(v || "").toLowerCase().includes(needle));
    });
  }, [invoices, q, filter]);

  const selected = invoices.find((i) => i.id === selectedId) || null;
  const panelRef = useRef(null);
  useEffect(() => {
    if ((selectedId || showForm) && window.innerWidth < 900) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId, showForm]);

  const create = async (data, clientAddress) => {
    const inv = {
      id: newInvoiceId(),
      to: address,
      createdAt: new Date().toISOString(),
      fromName: profile.name || "",
      gstin: profile.role === "business" ? profile.gstin || "" : "",
      ...data,
      clientAddress: clientAddress || "",
    };
    persist([inv, ...rawInvoices]);
    setSelectedId(inv.id);
    setShowForm(false);
    if (!clientAddress) {
      setNotice({ kind: "success", text: `Invoice ${inv.id} created. Share the pay link with your client.` });
      return;
    }
    setNotice({ kind: "info", text: `Invoice ${inv.id} created. Approve the request in your wallet to send it to ${shortAddr(clientAddress)}.` });
    try {
      await sendPaymentRequest({ from: address, clientAddress, invoice: inv, publicName: profile.name });
      persist([{ ...inv, requestedTo: clientAddress, requestedAt: new Date().toISOString() }, ...rawInvoices]);
      setNotice({ kind: "success", text: `Request for ${inv.id} delivered to ${shortAddr(clientAddress)}. It's waiting in their Bills to pay.` });
      onRequested();
    } catch (e) {
      setNotice({ kind: "error", text: `Invoice saved, but the request wasn't sent: ${e.message} You can retry from the invoice, or share the pay link.` });
    }
  };

  const update = (id, patch) => persist(rawInvoices.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const remove = (id) => {
    if (!window.confirm(`Delete invoice ${id}? Payments already received stay in your wallet.`)) return;
    persist(rawInvoices.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  const duplicate = (inv) => {
    const copy = {
      ...rawInvoices.find((i) => i.id === inv.id),
      id: newInvoiceId(),
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      requestedTo: undefined,
      requestedAt: undefined,
      restored: undefined,
    };
    persist([copy, ...rawInvoices]);
    setSelectedId(copy.id);
    setNotice({ kind: "success", text: `Created ${copy.id}, a copy of ${inv.id} due in 14 days.` });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadText(`settlesync-ledger-${new Date().toISOString().slice(0, 10)}.csv`, await buildLedgerCsv(invoices, address, profile));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, invoice number, amount" aria-label="Search invoices" />
        </label>
        <div className="chips" role="group" aria-label="Filter invoices">
          {Object.entries(FILTERS).map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? "is-on" : ""}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>{label}</button>
          ))}
        </div>
        <div className="toolbar__end">
          <button className="btn btn--ghost" onClick={exportCsv} disabled={!invoices.length || exporting} title="CA export is a Pro feature, free during the pilot">
            <DownloadIcon /> {exporting ? "Preparing…" : "Export for my CA"} <span className="pro-tag">Pro</span>
          </button>
          <button className="btn btn--primary" onClick={() => { setShowForm(true); setSelectedId(null); }}><PlusIcon /> New invoice</button>
        </div>
      </div>

      <div className="ws-grid">
        <div className="ledger" aria-label="Invoices">
          {invoices.length === 0 ? (
            <div className="empty">
              <div className="empty__art" aria-hidden="true"><span /><span /><span /></div>
              <h3>Your ledger is empty</h3>
              <p>Create an invoice, then share a pay link or send it straight to your client's wallet. When they pay, it marks itself paid here.</p>
              <button className="btn btn--primary" onClick={() => setShowForm(true)}><PlusIcon /> Create your first invoice</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty empty--small"><p>No invoices match. <button className="linkish" onClick={() => { setQ(""); setFilter("all"); }}>Clear filters</button></p></div>
          ) : (
            <ul className="ledger__rows">
              {visible.map((inv) => {
                const s = statusOf(inv);
                const r = rates?.[inv.assetCode];
                return (
                  <li key={inv.id}>
                    <button className={`ledger__row ${inv.id === selectedId ? "is-selected" : ""} ${justPaid[inv.id] ? "is-fresh" : ""}`} onClick={() => { setSelectedId(inv.id); setShowForm(false); }}>
                      <span className="ledger__client">
                        <strong>{inv.client || "Unnamed client"}</strong>
                        <small>{inv.id} · {inv.dueDate ? `due ${formatDate(inv.dueDate)}` : `sent ${formatDate(inv.createdAt)}`}{inv.requestedTo ? " · sent to wallet" : ""}</small>
                      </span>
                      <span className="ledger__amt">
                        {formatAmount(inv.amount, inv.assetCode)}
                        {r && <small>{formatFiat(Number(inv.amount) * r, fiat)}</small>}
                      </span>
                      <span className={`pill pill--${s}`}>{STATUS_LABEL[s]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="panel" ref={panelRef}>
          {showForm ? (
            <InvoiceForm onCancel={() => setShowForm(false)} onCreate={create} usdcReady={!!account?.hasUsdcTrustline} />
          ) : selected ? (
            <InvoiceDetail
              inv={selected}
              stampKey={justPaid[selected.id]}
              onDelete={() => remove(selected.id)}
              onDuplicate={() => duplicate(selected)}
              onRequestSent={(to) => { update(selected.id, { requestedTo: to, requestedAt: new Date().toISOString(), clientAddress: to }); onRequested(); }}
              setNotice={setNotice}
            />
          ) : (
            <div className="panel__empty">
              <p>Pick an invoice to see its pay link, QR code and payment record.</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function InvoiceForm({ onCancel, onCreate, usdcReady }) {
  const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ client: "", clientAddress: "", description: "", amount: "", assetCode: "USDC", dueDate: in14 });
  const [how, setHow] = useState("link");
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr("");
    const amount = f.amount.trim().replace(/,/g, "");
    if (!f.client.trim()) return setErr("Add who you're billing.");
    if (!(Number(amount) > 0)) return setErr("Enter an amount greater than zero.");
    if (!/^\d+(\.\d{1,7})?$/.test(amount)) return setErr("Use digits only, with up to 7 decimal places.");
    if (how === "wallet") {
      if (!isValidAddress(f.clientAddress)) return setErr("Enter your client's Stellar address. It starts with G and is 56 characters.");
      if (!requestMemoFits("SS-XXXXXX", amount, f.assetCode)) return setErr("This amount has too many digits for a wallet request. Use fewer decimals.");
    }
    onCreate(
      { client: f.client.trim(), description: f.description.trim(), amount, assetCode: f.assetCode, dueDate: f.dueDate },
      how === "wallet" ? f.clientAddress.trim() : ""
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2>New invoice</h2>
      <label className="field">Billing
        <input value={f.client} onChange={set("client")} placeholder="Client, DAO or grant program" required autoFocus />
      </label>
      <label className="field">For
        <input value={f.description} onChange={set("description")} placeholder="Smart contract review, October" />
      </label>
      <div className="form__row">
        <label className="field">Amount
          <input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="500" required />
        </label>
        <label className="field">Paid in
          <select value={f.assetCode} onChange={set("assetCode")}>
            <option value="USDC">USDC</option>
            <option value="XLM">XLM</option>
          </select>
        </label>
      </div>
      <label className="field">Due date
        <input type="date" value={f.dueDate} onChange={set("dueDate")} />
      </label>

      <fieldset className="how">
        <legend>How should your client get it?</legend>
        <label className={`how__opt ${how === "link" ? "is-on" : ""}`}>
          <input type="radio" name="how" checked={how === "link"} onChange={() => setHow("link")} />
          <b>Pay link</b><span>Share on WhatsApp, email or QR</span>
        </label>
        <label className={`how__opt ${how === "wallet" ? "is-on" : ""}`}>
          <input type="radio" name="how" checked={how === "wallet"} onChange={() => setHow("wallet")} />
          <b>Send to their wallet</b><span>Lands in their Bills to pay</span>
        </label>
      </fieldset>
      {how === "wallet" && (
        <label className="field">Client's Stellar address
          <input value={f.clientAddress} onChange={set("clientAddress")} placeholder="G…" spellCheck={false} autoCapitalize="characters" />
          <small>You'll approve one tiny transaction (0.0000001 XLM) that carries the request.</small>
        </label>
      )}

      {f.assetCode === "USDC" && !usdcReady && (
        <p className="alert alert--warn">Enable USDC on your wallet first (see the setup box above), or USDC payments to you will be rejected.</p>
      )}
      {err && <p className="alert alert--error">{err}</p>}
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary">{how === "wallet" ? "Create and send" : "Create invoice"}</button>
      </div>
    </form>
  );
}

function InvoiceDetail({ inv, stampKey, onDelete, onDuplicate, onRequestSent, setNotice }) {
  const { address, profile } = useApp();
  const link = payLinkFor(inv);
  const status = statusOf(inv);
  const [copied, copy] = useCopy();
  const [showQr, setShowQr] = useState(false);
  const [reqAddr, setReqAddr] = useState(inv.clientAddress || "");
  const [sending, setSending] = useState(false);
  const [showReq, setShowReq] = useState(false);

  const due = inv.dueDate ? ` due ${formatDate(inv.dueDate)}` : "";
  const shareText = `Hi! Here's invoice ${inv.id} from ${inv.fromName || "me"} for ${formatAmount(remainingOf(inv), inv.assetCode)}${due}. You can pay it here in a few seconds: ${link}`;
  const reminderText = `Hi! A gentle reminder about invoice ${inv.id} for ${formatAmount(remainingOf(inv), inv.assetCode)}${due}. Pay here: ${link}`;

  const sendReq = async () => {
    setSending(true);
    try {
      await sendPaymentRequest({ from: address, clientAddress: reqAddr, invoice: inv, publicName: profile.name });
      onRequestSent(reqAddr.trim());
      setShowReq(false);
      setNotice({ kind: "success", text: `Request for ${inv.id} delivered to ${shortAddr(reqAddr.trim())}.` });
    } catch (e) {
      setNotice({ kind: "error", text: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="detail">
      <InvoiceSheet inv={inv} status={status} stampKey={stampKey} printable />

      {status !== "paid" && (
        <div className="card">
          <p className="card__title">Get it paid</p>
          <div className="share__row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Pay link" />
            <button className="btn btn--primary" onClick={() => copy(link, "link")}><CopyIcon /> {copied === "link" ? "Copied" : "Copy"}</button>
          </div>
          <div className="actions">
            <a className="btn btn--ghost btn--sm" href={whatsappLink(status === "overdue" ? reminderText : shareText)} target="_blank" rel="noreferrer">
              <ChatIcon /> {status === "overdue" ? "Send reminder" : "WhatsApp"}
            </a>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowQr((s) => !s)} aria-expanded={showQr}><QrIcon /> QR code</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowReq((s) => !s)} aria-expanded={showReq}><SendIcon /> {inv.requestedTo ? "Re-send to wallet" : "Send to wallet"}</button>
            <a className="btn btn--ghost btn--sm" href={link} target="_blank" rel="noreferrer">Preview pay page</a>
          </div>
          {showQr && (
            <div className="qr-box">
              <QrImage text={link} />
              <p className="small muted">Your client scans this with their phone camera to open the pay page.</p>
            </div>
          )}
          {showReq && (
            <div className="req-box">
              <label className="field">Client's Stellar address
                <input value={reqAddr} onChange={(e) => setReqAddr(e.target.value)} placeholder="G…" spellCheck={false} />
              </label>
              <button className="btn btn--primary btn--sm" onClick={sendReq} disabled={sending}>{sending ? "Approve in your wallet…" : "Send request"}</button>
            </div>
          )}
          {inv.requestedTo && (
            <p className="small muted">Request sent to {shortAddr(inv.requestedTo)} on {formatDate(inv.requestedAt)}. It's in their Bills to pay.</p>
          )}
        </div>
      )}

      {inv.payments?.length > 0 && (
        <div className="card">
          <p className="card__title">Payments matched to this invoice</p>
          <ul className="receipts">
            {inv.payments.map((p) => (
              <li key={p.id}>
                <span className="receipts__amt">{formatAmount(p.amount, p.assetCode)}</span>
                <span className="muted small">{formatDate(p.createdAt)} from {shortAddr(p.from)}</span>
                <a className="small" href={NETWORK.explorerTx(p.hash)} target="_blank" rel="noreferrer">View transaction</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="detail__more">
        <button className="btn btn--ghost btn--sm" onClick={printInvoice}><PrintIcon /> Download PDF</button>
        <button className="btn btn--ghost btn--sm" onClick={onDuplicate}>Bill again</button>
        <button className="linkish danger small" onClick={onDelete}>Delete invoice</button>
      </div>
    </div>
  );
}
