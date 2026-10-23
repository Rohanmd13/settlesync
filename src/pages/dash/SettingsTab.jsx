import { useRef, useState } from "react";
import { useApp, ROLES, go } from "../../lib/app";
import { backupJson, parseBackup } from "../../lib/invoices";
import { downloadText } from "../../lib/csv";
import { NETWORK } from "../../lib/stellar";
import { useCopy } from "../../components/bits";

export default function SettingsTab({ invoices, persist, account }) {
  const { address, profile, updateProfile, disconnect } = useApp();
  const [name, setName] = useState(profile.name || "");
  const [gstin, setGstin] = useState(profile.gstin || "");
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, copy] = useCopy();
  const fileRef = useRef(null);

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
      persist([...add, ...invoices].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      setMsg({ kind: "success", text: add.length ? `Restored ${add.length} invoices.` : "Everything in that backup is already here." });
    } catch (err) {
      setMsg({ kind: "error", text: err.message || "Couldn't read that file." });
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="settings">
      <section className="card">
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

      <form className="card" onSubmit={save}>
        <p className="card__title">On your invoices</p>
        <label className="field">{profile.role === "business" ? "Business name" : "Your name"}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Rao" />
          <small>When you send a wallet request, this name is also saved on your Stellar account so clients see who's asking.</small>
        </label>
        {profile.role === "business" && (
          <label className="field">GSTIN
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} maxLength={15} placeholder="29ABCDE1234F1Z5" />
          </label>
        )}
        <button className="btn btn--primary" type="submit">{saved ? "Saved" : "Save"}</button>
      </form>

      <section className="card">
        <p className="card__title">Backup</p>
        <p className="small muted">
          Invoices live in this browser. Ones you sent as wallet requests also come back from Stellar automatically. Keep a backup
          file for the rest, or to move to a new laptop.
        </p>
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => downloadText(`settlesync-backup-${new Date().toISOString().slice(0, 10)}.json`, backupJson(address, invoices), "application/json")}>
            Download backup ({invoices.length})
          </button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>Restore from file</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={restore} />
        </div>
        {msg && <p className={`alert alert--${msg.kind}`}>{msg.text}</p>}
      </section>

      <section className="card">
        <p className="card__title">Wallet</p>
        <p className="mono-addr">{address}</p>
        <div className="actions">
          <button className="btn btn--ghost btn--sm" onClick={() => copy(address, "a")}>{copied === "a" ? "Copied" : "Copy address"}</button>
          <a className="btn btn--ghost btn--sm" href={NETWORK.explorerAccount(address)} target="_blank" rel="noreferrer">View on explorer</a>
          <button className="btn btn--ghost btn--sm" onClick={() => { disconnect(); go("/"); }}>Disconnect</button>
        </div>
        {account?.exists && (
          <p className="small muted">
            Balance: {Number(account.xlm).toLocaleString("en-IN", { maximumFractionDigits: 2 })} XLM
            {account.hasUsdcTrustline ? `, ${Number(account.usdc).toLocaleString("en-IN", { maximumFractionDigits: 2 })} USDC` : ", USDC not enabled"}.
            {account.publicName ? ` Public name on Stellar: "${account.publicName}".` : ""}
          </p>
        )}
      </section>
    </div>
  );
}
