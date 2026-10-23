import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InvoiceSheet from "../components/InvoiceSheet";
import {
  NETWORK,
  getAccountInfo,
  getIncomingPayments,
  buildUsdcTrustline,
  submitSigned,
  shortAddr,
} from "../lib/stellar";
import { connectWallet, getConnectedAddress, signWithWallet, checkNetwork } from "../lib/wallet";
import {
  loadInvoices,
  saveInvoices,
  newInvoiceId,
  payLinkFor,
  matchPayments,
  statusOf,
  STATUS_LABEL,
  formatAmount,
  formatDate,
} from "../lib/invoices";
import { buildLedgerCsv, downloadText } from "../lib/csv";

const POLL_MS = 8000;
const PROFILE_KEY = "settlesync:profile";

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function Dashboard() {
  const [address, setAddress] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [netWarning, setNetWarning] = useState("");

  useEffect(() => {
    getConnectedAddress()
      .then((a) => a && setAddress(a))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!address) return;
    checkNetwork().then((r) => setNetWarning(r.ok ? "" : r.message));
  }, [address]);

  const connect = async () => {
    setError("");
    try {
      setAddress(await connectWallet());
    } catch (e) {
      setError(e.message);
    }
  };

  if (checking) return <section className="page page--narrow"><p className="muted">Checking for Freighter…</p></section>;

  if (!address) {
    return (
      <section className="page page--narrow connect">
        <h1>Your invoices, matched to every payment</h1>
        <p>Connect the Freighter wallet you get paid into. SettleSync never holds your money and never asks for your secret phrase.</p>
        <button className="btn btn--primary" onClick={connect}>Connect Freighter</button>
        {error && <p className="alert alert--error">{error}</p>}
        <p className="muted small">
          No Freighter yet? Install it from <a href="https://freighter.app" target="_blank" rel="noreferrer">freighter.app</a>, switch it to Testnet, then come back.
        </p>
      </section>
    );
  }

  return <Workspace address={address} netWarning={netWarning} onDisconnect={() => setAddress(null)} />;
}

function Workspace({ address, netWarning, onDisconnect }) {
  const [invoices, setInvoices] = useState(() => loadInvoices(address));
  const [payments, setPayments] = useState([]);
  const [account, setAccount] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [justPaid, setJustPaid] = useState({});
  const paidBefore = useRef(null);

  const persist = (list) => {
    setInvoices(list);
    saveInvoices(address, list);
  };

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await getAccountInfo(address));
    } catch {
      /* shown via syncError on next payments call */
    }
  }, [address]);

  const sync = useCallback(async () => {
    try {
      const p = await getIncomingPayments(address);
      setPayments(p);
      setSyncError("");
      setLastSync(new Date());
    } catch (e) {
      if (e?.response?.status === 404) {
        setPayments([]);
        setSyncError("");
      } else {
        setSyncError("Couldn't reach the Stellar network. Retrying…");
      }
    }
  }, [address]);

  useEffect(() => {
    refreshAccount();
    sync();
    const t = setInterval(sync, POLL_MS);
    return () => clearInterval(t);
  }, [refreshAccount, sync]);

  const matched = useMemo(() => matchPayments(invoices, payments), [invoices, payments]);

  // Detect invoices that became paid during this session → stamp + notice.
  useEffect(() => {
    const nowPaid = new Set(matched.filter((i) => i.paidAt).map((i) => i.id));
    if (paidBefore.current === null) {
      if (lastSync) paidBefore.current = nowPaid; // first successful sync: baseline only
      return;
    }
    const fresh = [...nowPaid].filter((id) => !paidBefore.current.has(id));
    if (fresh.length) {
      const stamp = Date.now();
      setJustPaid((m) => ({ ...m, ...Object.fromEntries(fresh.map((id) => [id, stamp])) }));
      setNotice({ kind: "success", text: `Payment matched to ${fresh.join(", ")}. Marked as paid.` });
      setSelectedId(fresh[0]);
      refreshAccount();
    }
    paidBefore.current = nowPaid;
  }, [matched, lastSync, refreshAccount]);

  const selected = matched.find((i) => i.id === selectedId) || null;

  const totals = useMemo(() => {
    const t = { pending: 0, paid: 0, count: matched.length };
    for (const i of matched) {
      const s = statusOf(i);
      if (s === "paid") t.paid += 1;
      else t.pending += 1;
    }
    return t;
  }, [matched]);

  const fundWithFriendbot = async () => {
    setBusy("fund");
    setNotice(null);
    try {
      const r = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
      if (!r.ok) throw new Error();
      setNotice({ kind: "success", text: "Funded with 10,000 test XLM." });
      await refreshAccount();
    } catch {
      setNotice({ kind: "error", text: "Friendbot didn't respond. Try the Fund button inside Freighter instead." });
    } finally {
      setBusy("");
    }
  };

  const enableUsdc = async () => {
    setBusy("trust");
    setNotice(null);
    try {
      const xdr = await buildUsdcTrustline(address);
      const signed = await signWithWallet(xdr, address);
      await submitSigned(signed);
      setNotice({ kind: "success", text: "USDC enabled. You can now receive USDC invoices." });
      await refreshAccount();
    } catch (e) {
      setNotice({ kind: "error", text: e.message });
    } finally {
      setBusy("");
    }
  };

  const createInvoice = (data) => {
    const inv = {
      id: newInvoiceId(),
      to: address,
      createdAt: new Date().toISOString(),
      ...data,
    };
    persist([inv, ...invoices]);
    setSelectedId(inv.id);
    setShowForm(false);
    setNotice({ kind: "success", text: `Invoice ${inv.id} created. Send the pay link to your client.` });
  };

  const deleteInvoice = (id) => {
    if (!window.confirm(`Delete invoice ${id}? Payments already received stay in your wallet.`)) return;
    persist(invoices.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  const exportCsv = async () => {
    setBusy("csv");
    try {
      const csv = await buildLedgerCsv(matched, address);
      downloadText(`settlesync-ledger-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } finally {
      setBusy("");
    }
  };

  const needsFunding = account && !account.exists;
  const needsUsdc = account && account.exists && !account.hasUsdcTrustline;

  return (
    <section className="page workspace">
      <header className="ws-head">
        <div>
          <h1>Your ledger</h1>
          <p className="muted">
            <a href={NETWORK.explorerAccount(address)} target="_blank" rel="noreferrer" title={address}>{shortAddr(address)}</a>
            {account?.exists && (
              <> · {Number(account.xlm).toLocaleString("en-IN", { maximumFractionDigits: 2 })} XLM
                {account.hasUsdcTrustline && <> · {Number(account.usdc).toLocaleString("en-IN", { maximumFractionDigits: 2 })} USDC</>}
              </>
            )}
          </p>
        </div>
        <div className="ws-actions">
          <button className="btn btn--ghost" onClick={exportCsv} disabled={!matched.length || busy === "csv"}>
            {busy === "csv" ? "Preparing…" : "Export for my CA"}
          </button>
          <button className="btn btn--primary" onClick={() => { setShowForm(true); setSelectedId(null); }}>New invoice</button>
        </div>
      </header>

      {netWarning && <p className="alert alert--error">{netWarning}</p>}
      {notice && <p className={`alert alert--${notice.kind}`} role="status">{notice.text}</p>}

      {(needsFunding || needsUsdc) && (
        <div className="setup">
          <h2>Finish setting up your wallet</h2>
          {needsFunding && (
            <div className="setup__step">
              <p>Your wallet isn't active on testnet yet. Get free test XLM to activate it.</p>
              <button className="btn btn--primary" onClick={fundWithFriendbot} disabled={busy === "fund"}>
                {busy === "fund" ? "Funding…" : "Get test XLM"}
              </button>
            </div>
          )}
          {needsUsdc && (
            <div className="setup__step">
              <p>To get paid in USDC, your wallet needs to accept it. This is a one-time approval in Freighter.</p>
              <button className="btn btn--primary" onClick={enableUsdc} disabled={busy === "trust"}>
                {busy === "trust" ? "Waiting for Freighter…" : "Enable USDC"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="ws-grid">
        <div className="ledger" aria-label="Invoices">
          <div className="ledger__summary">
            <span>{totals.count} invoices</span>
            <span>{totals.paid} paid</span>
            <span>{totals.pending} open</span>
            <span className="ledger__sync">
              {syncError || (lastSync ? `Watching for payments · checked ${lastSync.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Connecting…")}
            </span>
          </div>

          {matched.length === 0 ? (
            <div className="ledger__empty">
              <p>No invoices yet. Create one and send the pay link to your client. When they pay, it's marked paid here automatically.</p>
              <button className="btn btn--primary" onClick={() => setShowForm(true)}>Create your first invoice</button>
            </div>
          ) : (
            <ul className="ledger__rows">
              {matched.map((inv) => {
                const s = statusOf(inv);
                return (
                  <li key={inv.id}>
                    <button
                      className={`ledger__row ${inv.id === selectedId ? "is-selected" : ""}`}
                      onClick={() => { setSelectedId(inv.id); setShowForm(false); }}
                    >
                      <span className="ledger__client">
                        <strong>{inv.client || "Unnamed client"}</strong>
                        <small>{inv.id} · due {formatDate(inv.dueDate)}</small>
                      </span>
                      <span className="ledger__amt">{formatAmount(inv.amount, inv.assetCode)}</span>
                      <span className={`pill pill--${s}`}>{STATUS_LABEL[s]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="panel">
          {showForm ? (
            <InvoiceForm
              onCancel={() => setShowForm(false)}
              onCreate={createInvoice}
              usdcReady={!!account?.hasUsdcTrustline}
            />
          ) : selected ? (
            <InvoiceDetail inv={selected} stampKey={justPaid[selected.id]} onDelete={() => deleteInvoice(selected.id)} />
          ) : (
            <div className="panel__empty">
              <p>Select an invoice to see its pay link and payment record.</p>
            </div>
          )}
        </aside>
      </div>

      <p className="muted small ws-foot">
        Invoices are saved in this browser for this wallet. <button className="linkish" onClick={onDisconnect}>Use a different wallet</button>
      </p>
    </section>
  );
}

function InvoiceForm({ onCancel, onCreate, usdcReady }) {
  const profile = loadProfile();
  const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({
    fromName: profile.fromName || "",
    client: "",
    description: "",
    amount: "",
    assetCode: "USDC",
    dueDate: in14,
  });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const amt = Number(f.amount);
    if (!f.client.trim()) return setErr("Add who you're billing.");
    if (!(amt > 0)) return setErr("Enter an amount greater than zero.");
    if (!/^\d+(\.\d{1,7})?$/.test(f.amount.trim())) return setErr("Use up to 7 decimal places.");
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ fromName: f.fromName.trim() }));
    } catch { /* ignore */ }
    onCreate({ ...f, fromName: f.fromName.trim(), client: f.client.trim(), description: f.description.trim(), amount: f.amount.trim() });
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2>New invoice</h2>
      <label>Your name or business
        <input value={f.fromName} onChange={set("fromName")} placeholder="Ekta Studio" autoComplete="organization" />
      </label>
      <label>Billing
        <input value={f.client} onChange={set("client")} placeholder="Client or DAO name" required />
      </label>
      <label>For
        <input value={f.description} onChange={set("description")} placeholder="Smart contract audit, October" />
      </label>
      <div className="form__row">
        <label>Amount
          <input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="500" required />
        </label>
        <label>Paid in
          <select value={f.assetCode} onChange={set("assetCode")}>
            <option value="USDC">USDC</option>
            <option value="XLM">XLM</option>
          </select>
        </label>
      </div>
      <label>Due date
        <input type="date" value={f.dueDate} onChange={set("dueDate")} />
      </label>
      {f.assetCode === "USDC" && !usdcReady && (
        <p className="alert alert--warn">Enable USDC on your wallet first (button above), or your client's payment will be rejected.</p>
      )}
      {err && <p className="alert alert--error">{err}</p>}
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary">Create invoice</button>
      </div>
    </form>
  );
}

function InvoiceDetail({ inv, stampKey, onDelete }) {
  const link = payLinkFor(inv);
  const [copied, setCopied] = useState(false);
  const status = statusOf(inv);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this pay link:", link);
    }
  };

  return (
    <div className="detail">
      <InvoiceSheet inv={inv} status={status} stampKey={stampKey} />

      {status !== "paid" && (
        <div className="share">
          <p className="share__label">Pay link for your client</p>
          <div className="share__row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Pay link" />
            <button className="btn btn--primary" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          </div>
          <a className="small" href={link} target="_blank" rel="noreferrer">Open the client's pay page</a>
        </div>
      )}

      {inv.payments?.length > 0 && (
        <div className="receipts">
          <p className="share__label">Payments matched to this invoice</p>
          <ul>
            {inv.payments.map((p) => (
              <li key={p.id}>
                <span>{formatAmount(p.amount, p.assetCode)}</span>
                <span className="muted">{formatDate(p.createdAt)} from {shortAddr(p.from)}</span>
                <a href={NETWORK.explorerTx(p.hash)} target="_blank" rel="noreferrer">View transaction</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="linkish danger small" onClick={onDelete}>Delete invoice</button>
    </div>
  );
}
