import { useEffect, useState } from "react";
import { go, useApp } from "../lib/app";
import { getAccountInfo, getAccountPayments, proStatus, PRO_PRICE, TREASURY } from "../lib/stellar";
import { payPro } from "../lib/actions";
import { formatDate } from "../lib/invoices";

export default function Plans() {
  const { address, connect, profile } = useApp();
  const [pro, setPro] = useState(null);
  const [account, setAccount] = useState(null);
  const [asset, setAsset] = useState("USDC");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const refresh = () => {
    if (!address) return;
    getAccountPayments(address).then((p) => setPro(proStatus(p, address))).catch(() => setPro({ active: false }));
    getAccountInfo(address).then(setAccount).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [address]);

  const upgrade = async () => {
    setMsg(null);
    if (!address) {
      try { await connect(); } catch { /* closed */ }
      return;
    }
    if (asset === "USDC" && !account?.hasUsdcTrustline) {
      setMsg({ kind: "warn", text: "This wallet doesn't hold USDC yet. Pay with XLM, or use Get test USDC in your dashboard first." });
      return;
    }
    setBusy(true);
    try {
      await payPro({ from: address, assetCode: asset, publicName: profile.name });
      setMsg({ kind: "success", text: "Welcome to Pro. Your subscription is recorded on Stellar." });
      setTimeout(refresh, 1500);
    } catch (e) {
      setMsg({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page plans-page">
      <h1>Plans</h1>
      <p className="lede">Start free. Upgrade only if SettleSync becomes part of how you run your work. During the pilot every Pro feature is unlocked for everyone. On Testnet you can try upgrading with free test money.</p>

      <div className="plans">
        <div className="plan">
          <h2>Free</h2>
          <p className="plan__price">₹0</p>
          <ul>
            <li>5 invoices a month</li>
            <li>Pay links, QR codes, wallet requests and claim codes</li>
            <li>Automatic matching and payment history</li>
            <li>Any Stellar wallet</li>
          </ul>
        </div>
        <div className="plan plan--pro">
          <h2>Pro</h2>
          <p className="plan__price">₹299 <span>a month, or {PRO_PRICE.USDC} USDC</span></p>
          <ul>
            <li>Unlimited invoices</li>
            <li>Accountant export with local-currency values on each payment day</li>
            <li>Your logo on invoices and pay pages</li>
            <li>Automatic reminders for overdue invoices</li>
          </ul>
          {!TREASURY ? (
            <p className="plan__pilot">Free for everyone during the pilot</p>
          ) : pro?.active ? (
            <p className="plan__pilot">Pro active until {formatDate(pro.until)}</p>
          ) : (
            <div className="plan__buy">
              <div className="seg">
                <button className={asset === "USDC" ? "is-on" : ""} onClick={() => setAsset("USDC")}>{PRO_PRICE.USDC} USDC</button>
                <button className={asset === "XLM" ? "is-on" : ""} onClick={() => setAsset("XLM")}>{PRO_PRICE.XLM} XLM</button>
              </div>
              <button className="btn btn--primary btn--wide" onClick={upgrade} disabled={busy}>
                {busy ? "Approve in your wallet…" : address ? "Upgrade for one month" : "Connect wallet to upgrade"}
              </button>
              <p className="small muted">Paid on Stellar to SettleSync's wallet. No card, no auto-renewal.</p>
            </div>
          )}
          {msg && <p className={`alert alert--${msg.kind}`}>{msg.text}</p>}
        </div>
      </div>

      <div className="plans-page__notes">
        <h2>Good to know</h2>
        <p>SettleSync never takes a cut of the payments you receive. Money moves wallet to wallet on Stellar, and the only network fee is a fraction of a rupee.</p>
        <p>Pro is paid in USDC or XLM through SettleSync itself, recorded on Stellar like everything else.</p>
      </div>
      <button className="btn btn--ghost btn--lg" onClick={() => go("/dashboard")}>{address ? "Back to dashboard" : "Get started free"}</button>
    </section>
  );
}
