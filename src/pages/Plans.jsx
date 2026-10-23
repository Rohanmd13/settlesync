import { go, useApp } from "../lib/app";

export default function Plans() {
  const { address } = useApp();
  return (
    <section className="page plans-page">
      <h1>Plans</h1>
      <p className="lede">Start free. Upgrade only if SettleSync becomes part of how you run your work. During the testnet pilot, everything is unlocked for everyone.</p>

      <div className="plans">
        <div className="plan">
          <h2>Free</h2>
          <p className="plan__price">₹0</p>
          <ul>
            <li>5 invoices a month</li>
            <li>Pay links, QR codes and wallet requests</li>
            <li>Automatic matching and payment history</li>
            <li>Any Stellar wallet</li>
          </ul>
        </div>
        <div className="plan plan--pro">
          <h2>Pro</h2>
          <p className="plan__price">₹299 <span>a month, or 3 USDC</span></p>
          <ul>
            <li>Unlimited invoices</li>
            <li>CA-ready export with INR values on each payment day</li>
            <li>Your logo on invoices and pay pages</li>
            <li>Automatic reminders for overdue invoices</li>
          </ul>
          <p className="plan__pilot">Unlocked free during the pilot</p>
        </div>
      </div>

      <div className="plans-page__notes">
        <h2>Good to know</h2>
        <p>SettleSync never takes a cut of your payments. Money moves wallet to wallet on Stellar, and the only network fee is a fraction of a rupee.</p>
        <p>Pro will be paid in USDC through SettleSync itself, so it's an invoice that marks itself paid, too.</p>
      </div>
      <button className="btn btn--primary btn--lg" onClick={() => go("/dashboard")}>{address ? "Back to dashboard" : "Get started free"}</button>
    </section>
  );
}
