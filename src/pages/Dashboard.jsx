import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, go, ROLES } from "../lib/app";
import { getAccountInfo, getAccountPayments, fundWithFriendbot, getPublicName } from "../lib/stellar";
import {
  loadInvoices,
  saveInvoices,
  matchPayments,
  billsFor,
  mergeRequestedFromChain,
  statusOf,
  formatINR,
  invoicesThisMonth,
  FREE_INVOICES_PER_MONTH,
} from "../lib/invoices";
import { liveInrRates } from "../lib/inr";
import { enableUsdc } from "../lib/actions";
import { WalletIcon } from "../components/Icons";
import InvoicesTab from "./dash/InvoicesTab";
import BillsTab from "./dash/BillsTab";
import HistoryTab from "./dash/HistoryTab";
import SettingsTab from "./dash/SettingsTab";

const POLL_MS = 8000;

export default function Dashboard() {
  const { address, walletReady, connect, profile } = useApp();
  const [err, setErr] = useState("");

  if (!walletReady) return <section className="page page--narrow"><p className="muted">Loading your wallet…</p></section>;

  if (!address) {
    const onConnect = async () => {
      setErr("");
      try {
        await connect();
      } catch (e) {
        if (!/closed|cancel/i.test(e.message)) setErr(e.message);
      }
    };
    return (
      <section className="page page--narrow connect">
        <h1>Connect your wallet to open your dashboard</h1>
        <p className="lede">
          Use the Stellar wallet you get paid into, or pay from. SettleSync never holds your money and never asks for your secret phrase.
        </p>
        <button className="btn btn--primary btn--lg" onClick={onConnect}><WalletIcon /> Connect wallet</button>
        {err && <p className="alert alert--error">{err}</p>}
        <div className="connect__help">
          <p><b>No wallet yet?</b> Albedo works in your browser with nothing to install. Freighter is a Chrome extension from freighter.app.</p>
          <p><b>On testnet.</b> Switch your wallet's network to Testnet. Test money is free.</p>
        </div>
      </section>
    );
  }

  if (!profile.role) return <Onboarding />;
  return <Workspace key={address} />;
}

function Onboarding() {
  const { updateProfile } = useApp();
  const pending = (() => {
    try { return sessionStorage.getItem("settlesync:pending-role"); } catch { return null; }
  })();
  const [role, setRole] = useState(pending && ROLES[pending] ? pending : "freelancer");
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");

  const save = (e) => {
    e.preventDefault();
    try { sessionStorage.removeItem("settlesync:pending-role"); } catch { /* ignore */ }
    updateProfile({ role, name: name.trim(), gstin: role === "business" ? gstin.trim().toUpperCase() : "" });
    go(role === "client" ? "/dashboard/bills" : "/dashboard/invoices");
  };

  return (
    <section className="page page--narrow onboard">
      <h1>How will you use SettleSync?</h1>
      <p className="lede">Your dashboard arranges itself around this. You can change it any time in Profile and backup.</p>
      <form onSubmit={save} className="onboard__form">
        <div className="role-pick" role="radiogroup" aria-label="Your role">
          {Object.entries(ROLES).map(([key, r]) => (
            <label key={key} className={`role-pick__opt ${role === key ? "is-on" : ""}`}>
              <input type="radio" name="role" value={key} checked={role === key} onChange={() => setRole(key)} />
              <b>{r.label}</b>
              <span>{r.blurb}</span>
            </label>
          ))}
        </div>
        <label className="field">
          {role === "business" ? "Business name" : "Your name"}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={role === "business" ? "Kite Studio Pvt Ltd" : "Ananya Rao"} />
          <small>Shown on your invoices and payment requests.</small>
        </label>
        {role === "business" && (
          <label className="field">
            GSTIN <span className="muted">(optional)</span>
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" maxLength={15} />
          </label>
        )}
        <button className="btn btn--primary btn--lg" type="submit">Open my dashboard</button>
      </form>
    </section>
  );
}

const TABS = {
  invoices: "Invoices",
  bills: "Bills to pay",
  history: "History",
  settings: "Profile and backup",
};

function Workspace() {
  const { address, route, profile } = useApp();
  const role = profile.role;
  const order = role === "client" ? ["bills", "history", "invoices", "settings"] : ["invoices", "bills", "history", "settings"];
  const sub = route.split("/")[2];
  const tab = TABS[sub] ? sub : order[0];

  const [invoices, setInvoices] = useState(() => loadInvoices(address));
  const [payments, setPayments] = useState([]);
  const [account, setAccount] = useState(null);
  const [rates, setRates] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState("");
  const [justPaid, setJustPaid] = useState({});
  const [names, setNames] = useState({});
  const [hideUpsell, setHideUpsell] = useState(() => {
    try { return sessionStorage.getItem("settlesync:hide-upsell") === "1"; } catch { return false; }
  });
  const paidBefore = useRef(null);

  const persist = useCallback(
    (list) => {
      setInvoices(list);
      saveInvoices(address, list);
    },
    [address]
  );

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await getAccountInfo(address));
    } catch {
      /* surfaced by sync */
    }
  }, [address]);

  const sync = useCallback(async () => {
    try {
      const p = await getAccountPayments(address);
      setPayments(p);
      setSyncError("");
      setLastSync(new Date());
    } catch (e) {
      if (e?.response?.status === 404) {
        setPayments([]);
        setLastSync(new Date());
        setSyncError("");
      } else setSyncError("Can't reach Stellar right now. Retrying…");
    }
  }, [address]);

  useEffect(() => {
    refreshAccount();
    sync();
    liveInrRates().then(setRates);
    const t = setInterval(sync, POLL_MS);
    return () => clearInterval(t);
  }, [refreshAccount, sync]);

  // Bring back invoices this wallet requested on-chain (new device / cleared browser).
  useEffect(() => {
    const merged = mergeRequestedFromChain(invoices, payments, address);
    if (merged) persist(merged);
  }, [payments, invoices, address, persist]);

  const matched = useMemo(() => matchPayments(invoices, payments), [invoices, payments]);
  const bills = useMemo(() => billsFor(address, payments), [address, payments]);

  // Look up requesters' public names for bills.
  useEffect(() => {
    const missing = [...new Set(bills.map((b) => b.to))].filter((a) => !(a in names));
    if (!missing.length) return;
    Promise.all(missing.map(async (a) => [a, await getPublicName(a)])).then((pairs) =>
      setNames((n) => ({ ...n, ...Object.fromEntries(pairs) }))
    );
  }, [bills, names]);

  // Stamp + notice when an invoice that was open earlier in this session becomes paid.
  useEffect(() => {
    if (!lastSync) return;
    const prev = paidBefore.current; // Map id -> paid?
    const now = new Map(matched.map((i) => [i.id, !!i.paidAt]));
    paidBefore.current = now;
    if (!prev) return;
    const fresh = [...now].filter(([id, paid]) => paid && prev.get(id) === false).map(([id]) => id);
    if (fresh.length) {
      const stamp = Date.now();
      setJustPaid((m) => ({ ...m, ...Object.fromEntries(fresh.map((id) => [id, stamp])) }));
      setNotice({ kind: "success", text: `Payment matched to ${fresh.join(", ")}. Marked as paid.` });
      refreshAccount();
    }
  }, [matched, lastSync, refreshAccount]);

  const doFund = async () => {
    setBusy("fund");
    setNotice(null);
    try {
      await fundWithFriendbot(address);
      setNotice({ kind: "success", text: "Funded with 10,000 test XLM." });
      await refreshAccount();
      sync();
    } catch (e) {
      setNotice({ kind: "error", text: e.message });
    } finally {
      setBusy("");
    }
  };

  const doEnableUsdc = async () => {
    setBusy("trust");
    setNotice(null);
    try {
      await enableUsdc(address);
      setNotice({ kind: "success", text: "USDC enabled. Your wallet can now receive and hold USDC." });
      await refreshAccount();
    } catch (e) {
      setNotice({ kind: "error", text: e.message });
    } finally {
      setBusy("");
    }
  };

  // ---------- summary numbers ----------
  const inr = (amt, code) => (rates?.[code] ? amt * rates[code] : null);
  const ym = new Date().toISOString().slice(0, 7);
  const summary = useMemo(() => {
    let outstandingInr = 0, receivedInr = 0, overdue = 0, open = 0, toPayInr = 0, billsOpen = 0;
    for (const i of matched) {
      const s = statusOf(i);
      if (s !== "paid") {
        open += 1;
        outstandingInr += inr(Number(i.amount) - (i.received || 0), i.assetCode) || 0;
      }
      if (s === "overdue") overdue += 1;
      for (const p of i.payments || []) if (p.createdAt.startsWith(ym)) receivedInr += inr(Number(p.amount), p.assetCode) || 0;
    }
    for (const b of bills) {
      if (!b.paidAt) {
        billsOpen += 1;
        toPayInr += inr(Number(b.amount) - b.received, b.assetCode) || 0;
      }
    }
    return { outstandingInr, receivedInr, overdue, open, toPayInr, billsOpen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, bills, rates]);

  const monthCount = invoicesThisMonth(invoices);
  const showUpsell = !hideUpsell && tab === "invoices" && monthCount > FREE_INVOICES_PER_MONTH;

  const needsFunding = account && !account.exists;
  const needsUsdc = account && account.exists && !account.hasUsdcTrustline;
  const greeting = profile.name ? `Namaste, ${profile.name.split(" ")[0]}` : "Your dashboard";

  return (
    <section className="page workspace">
      <header className="ws-head">
        <div>
          <p className="ws-head__hello">{greeting}</p>
          <h1>{TABS[tab]}</h1>
        </div>
        <div className="stats" aria-label="Summary">
          {role === "client" ? (
            <>
              <Stat label="Left to pay" value={rates ? formatINR(summary.toPayInr) : "—"} sub={`${summary.billsOpen} open bills`} />
              <Stat label="Wallet" value={account?.exists ? `${Number(account.usdc ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} USDC` : "—"} sub={account?.exists ? `${Number(account.xlm).toLocaleString("en-IN", { maximumFractionDigits: 0 })} XLM` : "not active"} />
            </>
          ) : (
            <>
              <Stat label="Outstanding" value={rates ? formatINR(summary.outstandingInr) : "—"} sub={`${summary.open} open invoices`} />
              <Stat label="Received this month" value={rates ? formatINR(summary.receivedInr) : "—"} sub="at today's rate" />
              <Stat label="Overdue" value={String(summary.overdue)} sub={summary.overdue ? "send a reminder" : "all on time"} tone={summary.overdue ? "bad" : ""} />
            </>
          )}
        </div>
      </header>

      <nav className="tabs" aria-label="Dashboard sections">
        {order.map((t) => (
          <a key={t} href={`#/dashboard/${t}`} className={`tabs__tab ${tab === t ? "is-on" : ""}`} aria-current={tab === t ? "page" : undefined}>
            {TABS[t]}
            {t === "bills" && summary.billsOpen > 0 && <span className="tabs__badge">{summary.billsOpen}</span>}
            {t === "invoices" && summary.overdue > 0 && <span className="tabs__badge tabs__badge--bad">{summary.overdue}</span>}
          </a>
        ))}
        <span className="tabs__sync" aria-live="polite">
          <i className={syncError ? "is-off" : "is-on"} aria-hidden="true" />
          {syncError || (lastSync ? "Watching Stellar for payments" : "Connecting…")}
        </span>
      </nav>

      {notice && (
        <p className={`alert alert--${notice.kind}`} role="status">
          {notice.text}
          <button className="alert__x" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </p>
      )}

      {(needsFunding || needsUsdc) && tab !== "settings" && (
        <div className="setup">
          <h2>Finish setting up your wallet</h2>
          {needsFunding && (
            <div className="setup__step">
              <p>Your wallet isn't active on testnet yet. Get free test XLM to activate it.</p>
              <button className="btn btn--primary" onClick={doFund} disabled={busy === "fund"}>{busy === "fund" ? "Funding…" : "Get test XLM"}</button>
            </div>
          )}
          {needsUsdc && (
            <div className="setup__step">
              <p>Let your wallet hold USDC. It's a one-time approval, needed to receive or pay in USDC.</p>
              <button className="btn btn--primary" onClick={doEnableUsdc} disabled={busy === "trust"}>{busy === "trust" ? "Waiting for your wallet…" : "Enable USDC"}</button>
            </div>
          )}
        </div>
      )}

      {showUpsell && (
        <div className="upsell" role="note">
          <p>
            You've created {monthCount} invoices this month. The free plan covers {FREE_INVOICES_PER_MONTH}; during the testnet pilot,
            Pro is unlocked for everyone, so nothing changes for you. <a href="#/plans">See plans</a>
          </p>
          <button className="alert__x" aria-label="Dismiss" onClick={() => { setHideUpsell(true); try { sessionStorage.setItem("settlesync:hide-upsell", "1"); } catch { /* ignore */ } }}>×</button>
        </div>
      )}

      <div className="tab-body" key={tab}>
        {tab === "invoices" && (
          <InvoicesTab
            invoices={matched}
            persist={persist}
            rawInvoices={invoices}
            account={account}
            justPaid={justPaid}
            setNotice={setNotice}
            onRequested={sync}
            rates={rates}
          />
        )}
        {tab === "bills" && (
          <BillsTab bills={bills} names={names} account={account} setNotice={setNotice} onPaid={() => { sync(); refreshAccount(); }} />
        )}
        {tab === "history" && <HistoryTab payments={payments} names={names} />}
        {tab === "settings" && <SettingsTab invoices={invoices} persist={persist} account={account} />}
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone = "" }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ""}`}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  );
}
