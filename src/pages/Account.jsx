import { useEffect, useRef, useState } from "react";
import { useApp, ROLES, go } from "../lib/app";
import { backupJson, parseBackup, loadInvoices, saveInvoices, formatDate } from "../lib/invoices";
import { downloadText } from "../lib/csv";
import { FIATS } from "../lib/inr";
import { NETWORK, getAccountInfo, getAccountPayments, proStatus } from "../lib/stellar";
import { useCopy } from "../components/bits";
import { Avatar } from "../components/Header";
import { WalletIcon } from "../components/Icons";

export default function Account() {
  const { address, walletReady, connect, profile, updateProfile, disconnect } = useApp();
  const [name, setName] = useState(profile.name || "");
  const [gstin, setGstin] = useState(profile.gstin || "");
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState(null);
  const [account, setAccount] = useState(null);
  const [pro, setPro] = useState(null);
  const [copied, copy] = useCopy();
  const fileRef = useRef(null);

  useEffect(() => {
    setName(profile.name || "");
    setGstin(profile.gstin || "");
  }, [profile.name, profile.gstin]);

  useEffect(() => {
    if (!address) return;
    getAccountInfo(address).then(setAccount).catch(() => {});
    getAccountPayments(address).then((p) => setPro(proStatus(p, address))).catch(() => setPro({ active: false }));
  }, [address]);

  if (!walletReady) return <section className="page page--narrow"><p className="muted">Loading…</p></section>;
  if (!address) {
    return (
      <section className="page page--narrow">
        <h1>Your profile</h1>
        <p className="lede">Connect a wallet to see and edit its profile.</p>
        <button className="btn btn--primary btn--lg" onClick={() => connect().catch(() => {})}><WalletIcon /> Connect wallet</button>
      </section>
    );
  }

  const invoices = loadInvoices(address);

  const save = (e) => {
    e.preventDefault();
    updateProfile({ name: name.trim(), gstin: gstin.trim().toUpperCase() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = parseBackup(await file.text());
      const have = new Set(invoices.map((i) => i.id));
      const add = data.invoices.filter((i) => !have.has(i.id) && i.to === address);
      saveInvoices(address, [...add, ...invoices].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      setMsg({ kind: "success", text: add.length ? `Restored ${add.length} invoices.` : "Everything in that backup is already here." });
    } catch (err) {
      setMsg({ kind: "error", text: err.message || "Couldn't read that file." });
    } finally {
      e.target.value = "";
    }
  };

  return (
    <section className="page account">
      <div className="account__head">
        <Avatar name={profile.name} address={address} size={64} />
        <div>
          <h1>{profile.name || "Your profile"}</h1>
          <p className="muted">{ROLES[profile.role]?.label || "Role not chosen"} · {pro?.active ? <span className="pro-badge">Pro</span> : "Free plan"}</p>
        </div>
        <a href="#/dashboard" className="btn btn--ghost account__back">Back to dashboard</a>
      </div>

      <div className="settings">
        <form className="card" onSubmit={save}>
          <p className="card__title">Name for this wallet</p>
          <label className="field">{profile.role === "business" ? "Business name" : "Name"}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Rao" />
            <small>Shown instead of the G… address everywhere in SettleSync, and on your invoices. When you send a wallet request, it's also saved on your Stellar account so the other person sees it.</small>
          </label>
          {profile.role === "business" && (
            <label className="field">GSTIN or tax ID
              <input value={gstin} onChange={(e) => setGstin(e.target.value)} maxLength={20} placeholder="29ABCDE1234F1Z5" />
            </label>
          )}
          <button className="btn btn--primary" type="submit">{saved ? "Saved" : "Save"}</button>
        </form>

        <section className="card">
          <p className="card__title">Show amounts in</p>
          <label className="field">Currency
            <select value={profile.currency || "INR"} onChange={(e) => updateProfile({ currency: e.target.value })}>
              {Object.entries(FIATS).map(([k, f]) => <option key={k} value={k}>{k}, {f.label}</option>)}
            </select>
            <small>Used for dashboard totals and your accountant export. SettleSync started in India and works anywhere USDC does.</small>
          </label>
        </section>

        <section className="card card--wide">
          <p className="card__title">I use SettleSync as</p>
          <div className="role-pick role-pick--row">
            {Object.entries(ROLES).map(([key, r]) => (
              <label key={key} className={`role-pick__opt ${profile.role === key ? "is-on" : ""}`}>
                <input type="radio" name="role" checked={profile.role === key} onChange={() => updateProfile({ role: key })} />
                <b>{r.label}</b>
                <span>{r.blurb}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <p className="card__title">Plan</p>
          {pro?.active ? (
            <p>Pro is active until {formatDate(pro.until)}.</p>
          ) : (
            <p className="muted">Free plan. During the pilot every Pro feature is unlocked anyway.</p>
          )}
          <a className="btn btn--ghost btn--sm" href="#/plans">See plans</a>
        </section>

        <section className="card">
          <p className="card__title">Backup</p>
          <p className="small muted">Invoices live in this browser. Ones you sent as wallet requests also come back from Stellar automatically. Keep a backup file for the rest, or to move to a new laptop.</p>
          <div className="actions">
            <button className="btn btn--ghost btn--sm" onClick={() => downloadText(`settlesync-backup-${new Date().toISOString().slice(0, 10)}.json`, backupJson(address, invoices), "application/json")}>
              Download backup ({invoices.length})
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>Restore from file</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={restore} />
          </div>
          {msg && <p className={`alert alert--${msg.kind}`}>{msg.text}</p>}
        </section>

        <section className="card card--wide">
          <p className="card__title">Wallet</p>
          <p className="mono-addr">{address}</p>
          {account?.exists && (
            <p className="small muted">
              {Number(account.xlm).toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM
              {account.hasUsdcTrustline ? `, ${Number(account.usdc).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC` : ", USDC not enabled"}.
              {account.publicName ? ` Name published on Stellar: "${account.publicName}".` : ""}
            </p>
          )}
          <div className="actions">
            <button className="btn btn--ghost btn--sm" onClick={() => copy(address, "a")}>{copied === "a" ? "Copied" : "Copy address"}</button>
            <a className="btn btn--ghost btn--sm" href={NETWORK.explorerAccount(address)} target="_blank" rel="noreferrer">View on explorer</a>
            <button className="btn btn--ghost btn--sm" onClick={() => { disconnect(); go("/"); }}>Disconnect</button>
          </div>
        </section>
      </div>
    </section>
  );
}
