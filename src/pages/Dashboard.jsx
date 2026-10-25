import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, go, ROLES } from "../lib/app";
import { getAccountInfo, getAccountPayments, fundWithFriendbot, getPublicName, shortAddr, NETWORK } from "../lib/stellar";
import {
  loadInvoices,
  saveInvoices,
  matchPayments,
  billsFor,
  mergeRequestedFromChain,
  statusOf,
  invoicesThisMonth,
  FREE_INVOICES_PER_MONTH,
} from "../lib/invoices";
import { liveRates, formatFiat } from "../lib/inr";
import { enableUsdc, getTestUsdc } from "../lib/actions";
import { WalletIcon } from "../components/Icons";
import { Avatar } from "../components/Header";
import InvoicesTab from "./dash/InvoicesTab";
import BillsTab from "./dash/BillsTab";
import HistoryTab from "./dash/HistoryTab";
import SendTab from "./dash/SendTab";
import RedeemTab from "./dash/RedeemTab";

const POLL_MS = 8000;

export default function Dashboard() {
  const { address, walletReady, connect, profile, network } = useApp();
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
          <p><b>No wallet yet?</b> Albedo works in your browser with nothing to install. Freighter is a browser extension from freighter.app.</p>
          <p><b>Main Net or Testnet.</b> SettleSync uses whichever network your wallet is on: Main Net for real payments, Testnet to try it with free test money.</p>
        </div>
      </section>
    );
  }

  if (!profile.role) return <Onboarding />;
  return <Workspace key={`${address}:${network}`} />;
}

function Onboarding() {
  const { updateProfile, walletNetwork, network, switchNetwork } = useApp();
  const [net, setNet] = useState(walletNetwork || network);
  const pending = (() => {
    try { return sessionStorage.getItem("settlesync:pending-role"); } catch { return null; }
  })();
  const [role, setRole] = useState(pending && ROLES[pending] ? pending : "freelancer");
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");

  const save = (e) => {
    e.preventDefault();
    try { sessionStorage.removeItem("settlesync:pending-role"); } catch { /* ignore */ }
    updateProfile({ role, name: name.trim(), gstin: role === "business" ? gstin.trim().toUpperCase() : "", network: net });
    if (net !== network) switchNetwork(net);
    go(role === "client" ? "/dashboard/bills" : "/dashboard/invoices");
  };

  return (
    <section className="page page--narrow onboard">
      <h1>How will you use SettleSync?</h1>
      <p className="lede">Your dashboard arranges itself around this. You can change it any time from your profile.</p>
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
          {role === "business" ? "Business name" : role === "client" ? "Your name or company" : "Your name"}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={role === "business" ? "Kite Studio Pvt Ltd" : "Ananya Rao"} required />
          <small>This is how this wallet shows up across SettleSync, instead of its long G… address. Use a different name for each wallet you connect.</small>
        </label>
        {role === "business" && (
          <label className="field">
            GSTIN or tax ID <span className="muted">(optional)</span>
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" maxLength={20} />
          </label>
        )}
        <fieldset className="net-pick">
          <legend>What is this wallet for?</legend>
          <label className={`net-pick__opt ${net === "mainnet" ? "is-on" : ""}`}>
            <input type="radio" name="net" checked={net === "mainnet"} onChange={() => setNet("mainnet")} />
            <b>Real payments</b><span>Stellar Main Net, real USDC and XLM</span>
          </label>
          <label className={`net-pick__opt ${net === "testnet" ? "is-on" : ""}`}>
            <input type="radio" name="net" checked={net === "testnet"} onChange={() => setNet("testnet")} />
            <b>Trying it out</b><span>Stellar Testnet, free test money</span>
          </label>
          {walletNetwork && walletNetwork !== net && (
            <p className="alert alert--warn">Your wallet is set to {walletNetwork === "mainnet" ? "Main Net" : "Testnet"}. Switch your wallet's network to match, or SettleSync will follow the wallet.</p>
          )}
          {walletNetwork && walletNetwork === net && <small>Your wallet is on {net === "mainnet" ? "Main Net" : "Testnet"} too, so you're all set.</small>}
        </fieldset>
        <button className="btn btn--primary btn--lg" type="submit">Open my dashboard</button>
      </form>
    </section>
  );
}

const SECTIONS = {
  invoices: { label: "Invoices", group: "get", title: "Invoices", blurb: "Invoices you've sent, and whether they're paid. Payments match themselves." },
  redeem: { label: "Redeem a code", group: "get", title: "Redeem a claim code", blurb: "Someone sent you a SettleSync claim code? Paste it here to move the money into this wallet." },
  bills: { label: "Bills to pay", group: "pay", title: "Bills to pay", blurb: "Payment requests sent straight to this wallet. Pay with one tap." },
  send: { label: "Send money", group: "pay", title: "Send money", blurb: "Pay someone who hasn't billed you yet: straight to their wallet, or as a claim code they redeem." },
  history: { label: "History", group: "rec", title: "Payment history", blurb: "Everything this wallet sent and received, labelled, with proof on Stellar." },
};
const GROUPS = { get: "Get paid", pay: "Pay others", rec: "Records" };

function Workspace() {
  const { address, route, profile } = useApp();
  const role = profile.role;
  const fiat = profile.currency || "INR";
  const groupOrder = role === "client" ? ["pay", "get", "rec"] : ["get", "pay", "rec"];
  const defaultTab = role === "client" ? "bills" : "invoices";
  const sub = route.split("/")[2];
  const tab = SECTIONS[sub] ? sub : defaultTab;

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
    const t = setInterval(sync, POLL_MS);
    return () => clearInterval(t);
  }, [refreshAccount, sync]);

  useEffect(() => {
    liveRates(fiat).then(setRates);
  }, [fiat]);

  useEffect(() => {
    const merged = mergeRequestedFromChain(invoices, payments, address);
    if (merged) persist(merged);
  }, [payments, invoices, address, persist]);

  const matched = useMemo(() => matchPayments(invoices, payments), [invoices, payments]);
  const bills = useMemo(() => billsFor(address, payments), [address, payments]);

  // Public names (published on Stellar) for everyone this wallet deals with.
  useEffect(() => {
    const people = new Set(bills.map((b) => b.to));
    for (const p of payments.slice(0, 60)) people.add(p.direction === "in" ? p.from : p.to);
    const missing = [...people].filter((a) => a && !(a in names));
    if (!missing.length) return;
    Promise.all(missing.map(async (a) => [a, await getPublicName(a)])).then((pairs) =>
      setNames((n) => ({ ...n, ...Object.fromEntries(pairs) }))
    );
  }, [bills, payments, names]);

  useEffect(() => {
    if (!lastSync) return;
    const prev = paidBefore.current;
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

  const run = async (key, fn, ok) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: "success", text: ok });
      await refreshAccount();
      sync();
    } catch (e) {
      setNotice({ kind: "error", text: e.message });
    } finally {
      setBusy("");
    }
  };
  const doFund = () => run("fund", () => fundWithFriendbot(address), "Added 10,000 test XLM to this wallet.");
  const doEnableUsdc = () => run("trust", () => enableUsdc(address), "USDC enabled. This wallet can now receive and hold USDC.");
  const doTestUsdc = () =>
    run("usdc", () => getTestUsdc({ address, hasTrustline: !!account?.hasUsdcTrustline }), "Swapped 100 test XLM for test USDC on Stellar's exchange.");

  // ---------- summary numbers ----------
  const val = (amt, code) => (rates?.[code] ? amt * rates[code] : 0);
  const ym = new Date().toISOString().slice(0, 7);
  const summary = useMemo(() => {
    let outstanding = 0, received = 0, overdue = 0, open = 0, toPay = 0, billsOpen = 0, paidOut = 0;
    for (const i of matched) {
      const s = statusOf(i);
      if (s !== "paid") {
        open += 1;
        outstanding += val(Number(i.amount) - (i.received || 0), i.assetCode);
      }
      if (s === "overdue") overdue += 1;
      for (const p of i.payments || []) if (p.createdAt.startsWith(ym)) received += val(Number(p.amount), p.assetCode);
    }
    for (const b of bills) {
      if (!b.paidAt) {
        billsOpen += 1;
        toPay += val(Number(b.amount) - b.received, b.assetCode);
      }
    }
    for (const p of payments) if (p.direction === "out" && p.createdAt.startsWith(ym) && !(p.memo || "").startsWith("R:")) paidOut += val(Number(p.amount), p.assetCode);
    return { outstanding, received, overdue, open, toPay, billsOpen, paidOut };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, bills, payments, rates]);

  useEffect(() => {
    document.querySelector(".side-nav__item.is-on")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [tab]);

  const monthCount = invoicesThisMonth(invoices);
  const showUpsell = !hideUpsell && tab === "invoices" && monthCount > FREE_INVOICES_PER_MONTH;
  const needsFunding = account && !account.exists;
  const needsUsdc = account && account.exists && !account.hasUsdcTrustline;
  const money = (n) => (rates ? formatFiat(n, fiat) : "—");
  const S = SECTIONS[tab];

  return (
    <section className="dash">
      <aside className="dash__side" aria-label="Dashboard">
        <div className="who">
          <Avatar name={profile.name} address={address} size={44} />
          <div className="who__text">
            <b>{profile.name || shortAddr(address)}</b>
            <small>{ROLES[role]?.label}</small>
          </div>
          <a href="#/account" className="who__edit">Edit</a>
        </div>

        <div className="balances">
          <div><span>XLM</span>{account?.exists ? <b>{Number(account.xlm).toLocaleString("en-US", { maximumFractionDigits: 2 })}</b> : <b className="bal-note" title="This wallet has no XLM yet, so it isn't active on Stellar.">0, not active</b>}</div>
          <div><span>USDC</span>{account?.hasUsdcTrustline ? <b>{Number(account.usdc).toLocaleString("en-US", { maximumFractionDigits: 2 })}</b> : <b className="bal-note" title="This wallet can't hold USDC until you turn it on (a one-time approval).">Not turned on</b>}</div>
          {NETWORK.id === "testnet" && <details className="topup">
            <summary>Testnet top-up</summary>
            <p>Free test money for trying SettleSync. Not real funds.</p>
            <div className="topup__row">
              <button className="btn btn--ghost btn--sm" onClick={doFund} disabled={!!busy}>{busy === "fund" ? "Adding…" : "Add test XLM"}</button>
              {account?.exists && <button className="btn btn--ghost btn--sm" onClick={doTestUsdc} disabled={!!busy}>{busy === "usdc" ? "Swapping…" : "Add test USDC"}</button>}
            </div>
          </details>}
        </div>

        <nav className="side-nav">
          {groupOrder.map((g) => (
            <div key={g} className="side-nav__group">
              <p>{GROUPS[g]}</p>
              {Object.entries(SECTIONS).filter(([, s]) => s.group === g).map(([key, s]) => (
                <a key={key} href={`#/dashboard/${key}`} className={`side-nav__item ${tab === key ? "is-on" : ""}`} aria-current={tab === key ? "page" : undefined}>
                  {s.label}
                  {key === "bills" && summary.billsOpen > 0 && <span className="tabs__badge">{summary.billsOpen}</span>}
                  {key === "invoices" && summary.overdue > 0 && <span className="tabs__badge tabs__badge--bad">{summary.overdue}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <p className="side-sync" aria-live="polite">
          <i className={syncError ? "is-off" : "is-on"} aria-hidden="true" />
          {syncError || (lastSync ? "Watching Stellar for payments" : "Connecting…")}
        </p>
      </aside>

      <div className="dash__main">
        <header className="ws-head">
          <div>
            <h1>{S.title}</h1>
            <p className="ws-head__blurb">{S.blurb}</p>
          </div>
          {tab === "invoices" && (
            <div className="stats" aria-label="Summary">
              <Stat label="Outstanding" value={money(summary.outstanding)} sub={`${summary.open} open`} />
              <Stat label="Invoice payments this month" value={money(summary.received)} sub="at today's rate" />
              <Stat label="Overdue" value={String(summary.overdue)} sub={summary.overdue ? "send a reminder" : "all on time"} tone={summary.overdue ? "bad" : ""} />
            </div>
          )}
          {tab === "bills" && (
            <div className="stats" aria-label="Summary">
              <Stat label="Left to pay" value={money(summary.toPay)} sub={`${summary.billsOpen} open bills`} />
              <Stat label="Paid out this month" value={money(summary.paidOut)} sub="at today's rate" />
            </div>
          )}
        </header>

        {notice && (
          <p className={`alert alert--${notice.kind}`} role="status">
            {notice.text}
            <button className="alert__x" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </p>
        )}

        {(needsFunding || (needsUsdc && tab !== "history")) && (
          <div className="setup">
            <h2>Finish setting up this wallet</h2>
            {needsFunding && (
              <div className="setup__step">
                {NETWORK.id === "testnet" ? (
                  <>
                    <p>This wallet isn't active on Testnet yet. Add free test XLM to activate it.</p>
                    <button className="btn btn--primary" onClick={doFund} disabled={busy === "fund"}>{busy === "fund" ? "Adding…" : "Get test XLM"}</button>
                  </>
                ) : (
                  <p>This wallet isn't active on Stellar Main Net yet. Send it at least 2 XLM from an exchange or another wallet to activate it.</p>
                )}
              </div>
            )}
            {needsUsdc && (
              <div className="setup__step">
                <p>{NETWORK.id === "testnet" ? "Turn on USDC: a one-time approval in your wallet. Or get test USDC, which turns it on and adds some to try with." : "Turn on USDC: a one-time approval in your wallet so it can receive and hold USDC."}</p>
                <div className="actions">
                  <button className="btn btn--ghost" onClick={doEnableUsdc} disabled={!!busy}>{busy === "trust" ? "Waiting for wallet…" : "Enable USDC"}</button>
                  {NETWORK.id === "testnet" && <button className="btn btn--primary" onClick={doTestUsdc} disabled={!!busy}>{busy === "usdc" ? "Waiting for wallet…" : "Get test USDC"}</button>}
                </div>
              </div>
            )}
          </div>
        )}

        {showUpsell && (
          <div className="upsell" role="note">
            <p>
              You've created {monthCount} invoices this month. Free covers {FREE_INVOICES_PER_MONTH}; during the pilot, Pro is unlocked for everyone, so nothing changes for you. <a href="#/plans">See plans</a>
            </p>
            <button className="alert__x" aria-label="Dismiss" onClick={() => { setHideUpsell(true); try { sessionStorage.setItem("settlesync:hide-upsell", "1"); } catch { /* ignore */ } }}>×</button>
          </div>
        )}

        <div className="tab-body" key={tab}>
          {tab === "invoices" && (
            <InvoicesTab invoices={matched} persist={persist} rawInvoices={invoices} account={account} justPaid={justPaid} setNotice={setNotice} onRequested={sync} rates={rates} fiat={fiat} />
          )}
          {tab === "bills" && <BillsTab bills={bills} names={names} account={account} setNotice={setNotice} onPaid={() => { sync(); refreshAccount(); }} />}
          {tab === "send" && <SendTab account={account} names={names} setNotice={setNotice} onSent={() => { sync(); refreshAccount(); }} />}
          {tab === "redeem" && <RedeemTab account={account} setNotice={setNotice} onRedeemed={() => { sync(); refreshAccount(); }} />}
          {tab === "history" && <HistoryTab payments={payments} names={names} />}
        </div>
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
