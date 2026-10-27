import { useEffect, useMemo, useState } from "react";
import { getAccountInfo, getAccountPayments, getPublicName, TREASURY, NETWORK, shortAddr, isProPayment } from "../lib/stellar";
import { useApp } from "../lib/app";
import { liveRates, formatFiat } from "../lib/inr";
import { formatAmount, formatDate, relativeTime } from "../lib/invoices";

// Owner view of SettleSync's own income. Not linked anywhere; reached at #/owner.
// The passcode keeps casual visitors out. It is not real security: the treasury's
// payments are public on Stellar by design, and nothing here can move money.
// Wallets the SettleSync team used to test the Pro flow during development.
// Hidden by default so the owner view shows real customers only.
const TEAM_TEST_WALLETS = new Set([
  "GCBTWY37Y3STHB24IFZ2RZQWPJ7EA7HAUR56HORBHFJXK2C7IF2OE2FY",
  "GDR4AYWBQLKZYDBH6KX4ATHDCZPZ2FY7QM5BN4QVBTBIHBKIRBP5ZUEG",
  "GA7AN6E6WTG2S3KWDUJCNYDKICOULDU5FAXIPOV7QBNWLGERLCICODIN",
]);
const PASS_HASH = "4ae5a198d438ea73f9df2066950087cbb14f8517b7f915dbeeebe6ec72ff39e7";
const SESSION_KEY = "settlesync:owner";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Admin() {
  const [ok, setOk] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
  });
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const unlock = async (e) => {
    e.preventDefault();
    if ((await sha256(`settlesync:${pass}`)) === PASS_HASH) {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
      setOk(true);
    } else {
      setErr("That passcode isn't right.");
    }
  };

  if (!ok) {
    return (
      <section className="page page--narrow owner-lock">
        <h1>Owner access</h1>
        <p className="lede">This page shows SettleSync's own revenue. Enter the owner passcode.</p>
        <form onSubmit={unlock} className="owner-lock__form">
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passcode" autoFocus autoComplete="current-password" aria-label="Owner passcode" />
          <button className="btn btn--primary" type="submit">Unlock</button>
        </form>
        {err && <p className="alert alert--error">{err}</p>}
      </section>
    );
  }
  return <OwnerDashboard onLock={() => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } setOk(false); }} />;
}

function OwnerDashboard({ onLock }) {
  const { network, switchNetwork } = useApp();
  if (!TREASURY) {
    return (
      <section className="page owner">
        <header className="owner__head">
          <div>
            <p className="owner__kicker">SettleSync owner dashboard</p>
            <h1>Revenue</h1>
          </div>
          <div className="owner__tools">
            <OwnerNet network={network} switchNetwork={switchNetwork} />
            <button className="btn btn--ghost btn--sm" onClick={onLock}>Lock</button>
          </div>
        </header>
        <div className="card">
          <p className="card__title">No Main Net treasury yet</p>
          <p className="muted">Pro isn't sold on Main Net yet, so there's no revenue to show here. When you create SettleSync's Main Net wallet, its address goes in one line of code and this page starts reading real revenue.</p>
        </div>
      </section>
    );
  }
  return <OwnerRevenue onLock={onLock} network={network} switchNetwork={switchNetwork} />;
}

function OwnerNet({ network, switchNetwork }) {
  return (
    <div className="seg seg--sm" aria-label="Network">
      <button className={network === "mainnet" ? "is-on" : ""} onClick={() => switchNetwork("mainnet")}>Main Net</button>
      <button className={network === "testnet" ? "is-on" : ""} onClick={() => switchNetwork("testnet")}>Testnet</button>
    </div>
  );
}

function OwnerRevenue({ onLock, network, switchNetwork }) {
  const [payments, setPayments] = useState(null);
  const [treasury, setTreasury] = useState(null);
  const [rates, setRates] = useState(null);
  const [names, setNames] = useState({});
  const [err, setErr] = useState("");
  const [showTest, setShowTest] = useState(false);

  const load = () => {
    getAccountPayments(TREASURY).then(setPayments).catch(() => setErr("Couldn't reach Stellar."));
    getAccountInfo(TREASURY).then(setTreasury).catch(() => {});
    liveRates("INR").then(setRates);
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const allSubs = useMemo(() => (payments || []).filter((p) => p.direction === "in" && !p.pending && isProPayment(p)), [payments]);
  const testCount = allSubs.filter((p) => TEAM_TEST_WALLETS.has(p.from)).length;
  const subs = useMemo(() => (showTest ? allSubs : allSubs.filter((p) => !TEAM_TEST_WALLETS.has(p.from))), [allSubs, showTest]);

  useEffect(() => {
    const missing = [...new Set(subs.map((p) => p.from))].filter((a) => !(a in names));
    if (missing.length) Promise.all(missing.map(async (a) => [a, await getPublicName(a)])).then((pairs) => setNames((n) => ({ ...n, ...Object.fromEntries(pairs) })));
  }, [subs, names]);

  const inr = (p) => (rates?.[p.assetCode] ? Number(p.amount) * rates[p.assetCode] : 0);
  const now = Date.now();
  const ym = new Date().toISOString().slice(0, 7);
  const stats = useMemo(() => {
    const total = subs.reduce((s, p) => s + inr(p), 0);
    const month = subs.filter((p) => p.createdAt.startsWith(ym)).reduce((s, p) => s + inr(p), 0);
    const lastBy = new Map();
    for (const p of subs) if (!lastBy.has(p.from) || lastBy.get(p.from) < p.createdAt) lastBy.set(p.from, p.createdAt);
    const active = [...lastBy.values()].filter((d) => now - new Date(d).getTime() < 30 * 864e5).length;
    const byAsset = subs.reduce((m, p) => ({ ...m, [p.assetCode]: (m[p.assetCode] || 0) + Number(p.amount) }), {});
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - i);
      const key = d.toISOString().slice(0, 7);
      months.push({ key, label: d.toLocaleDateString("en-IN", { month: "short" }), value: subs.filter((p) => p.createdAt.startsWith(key)).reduce((s, p) => s + inr(p), 0) });
    }
    return { total, month, active, customers: lastBy.size, byAsset, months, mrr: active * 299 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, rates]);

  const max = Math.max(1, ...stats.months.map((m) => m.value));

  return (
    <section className="page owner">
      <header className="owner__head">
        <div>
          <p className="owner__kicker">SettleSync owner dashboard</p>
          <h1>Revenue</h1>
          <p className="muted">Read live from the SettleSync treasury on Stellar {NETWORK.name.toLowerCase()}. Refreshes every 15 seconds.</p>
        </div>
        <div className="owner__tools">
          <OwnerNet network={network} switchNetwork={switchNetwork} />
          {testCount > 0 && (
            <label className="owner__toggle">
              <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Include {testCount} team test payments
            </label>
          )}
          <button className="btn btn--ghost btn--sm" onClick={onLock}>Lock</button>
        </div>
      </header>
      {err && <p className="alert alert--error">{err}</p>}

      <div className="owner__stats">
        <div className="stat"><span className="stat__label">All-time revenue</span><strong className="stat__value">{rates ? formatFiat(stats.total, "INR") : "—"}</strong><span className="stat__sub">{Object.entries(stats.byAsset).map(([a, v]) => formatAmount(v, a)).join(" + ") || "no payments yet"}</span></div>
        <div className="stat"><span className="stat__label">This month</span><strong className="stat__value">{rates ? formatFiat(stats.month, "INR") : "—"}</strong><span className="stat__sub">at today's rate</span></div>
        <div className="stat"><span className="stat__label">Active Pro users</span><strong className="stat__value">{stats.active}</strong><span className="stat__sub">{stats.customers} paying customers ever</span></div>
        <div className="stat"><span className="stat__label">Monthly recurring</span><strong className="stat__value">{formatFiat(stats.mrr, "INR")}</strong><span className="stat__sub">active × ₹299</span></div>
      </div>

      <div className="owner__grid">
        <section className="card">
          <p className="card__title">Revenue by month (₹)</p>
          <div className="bars" role="img" aria-label="Revenue for the last six months">
            {stats.months.map((m) => (
              <div key={m.key} className="bars__col">
                <span className="bars__val">{m.value ? formatFiat(m.value, "INR") : ""}</span>
                <span className="bars__bar" style={{ height: `${Math.max(2, (m.value / max) * 100)}%` }} />
                <span className="bars__label">{m.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <p className="card__title">Treasury wallet</p>
          <p className="mono-addr">{TREASURY}</p>
          {treasury && <p>{Number(treasury.xlm).toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM, {Number(treasury.usdc || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC</p>}
          <a className="btn btn--ghost btn--sm" href={NETWORK.explorerAccount(TREASURY)} target="_blank" rel="noreferrer">Open on Stellar explorer</a>
        </section>
      </div>

      <section className="card owner__list">
        <p className="card__title">Latest subscriptions</p>
        {payments === null ? <p className="muted">Loading…</p> : subs.length === 0 ? <p className="muted">No Pro payments yet.</p> : (
          <ul className="receipts">
            {subs.slice(0, 30).map((p) => (
              <li key={p.id}>
                <span className="receipts__amt">{formatAmount(p.amount, p.assetCode)} {rates && <small className="muted">({formatFiat(inr(p), "INR")})</small>}</span>
                <span className="small muted">{names[p.from] || shortAddr(p.from)}, {formatDate(p.createdAt)} ({relativeTime(p.createdAt)})</span>
                <a className="small" href={NETWORK.explorerTx(p.hash)} target="_blank" rel="noreferrer">View transaction</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="small muted">Revenue comes only from Pro subscriptions: SettleSync takes no cut of user payments. Payments the team made while testing are hidden unless you tick the box above. The treasury balance also includes the free 10,000 test XLM it was created with.</p>
    </section>
  );
}
