import { useState } from "react";
import InvoiceSheet from "../components/InvoiceSheet";

const DEMO = {
  id: "SS-K7QM4X",
  to: "GDEMOFREELANCERWALLETADDRESSFORLANDINGPAGEXXXXXXXXXXXX7Q2",
  fromName: "Ananya Rao, Solidity dev",
  client: "Lumen Labs DAO",
  description: "Soroban contract review, October",
  amount: "1200",
  assetCode: "USDC",
  createdAt: "2026-10-20T10:00:00Z",
  dueDate: "2026-11-03",
  received: 0,
};

export default function Landing() {
  const [paid, setPaid] = useState(false);
  const [stampKey, setStampKey] = useState(null);
  const inv = paid ? { ...DEMO, received: 1200, paidAt: new Date().toISOString() } : DEMO;

  const simulate = () => {
    if (paid) {
      setPaid(false);
      return;
    }
    setPaid(true);
    setStampKey(Date.now());
  };

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <h1>Get paid in USDC. Know exactly which invoice it was for.</h1>
          <p className="lede">
            SettleSync is invoicing for Indian freelancers and builders paid in USDC on Stellar. Each payment carries its
            invoice number, lands straight in your wallet, and marks the invoice paid by itself. At tax time, one export
            gives your CA every payment with its INR value.
          </p>
          <div className="hero__cta">
            <a href="#/app" className="btn btn--primary">Create an invoice</a>
            <a href="#how" className="btn btn--ghost">How it works</a>
          </div>
          <p className="muted small">Free during the testnet pilot. Non-custodial: we never hold your money.</p>
        </div>

        <div className="hero__demo">
          <InvoiceSheet inv={inv} status={paid ? "paid" : "pending"} stampKey={stampKey} />
          <button className="btn btn--ghost btn--wide" onClick={simulate}>
            {paid ? "Reset the demo" : "See what happens when the client pays"}
          </button>
        </div>
      </section>

      <section className="band">
        <div className="band__inner">
          <h2>Where USDC payments get lost</h2>
          <div className="pains">
            <p><strong>"Which invoice was this?"</strong> A DAO sends you 1,200 USDC. Your wallet shows a number and an address, nothing about the work it paid for.</p>
            <p><strong>Late and partial payments.</strong> One client pays half, another pays three weeks late. You chase them with explorer screenshots.</p>
            <p><strong>March with your CA.</strong> They need every payment with its INR value on the day it arrived. You rebuild a year of it by hand.</p>
          </div>
        </div>
      </section>

      <section className="steps" id="how">
        <h2>How it works</h2>
        <ol>
          <li>
            <h3>Create the invoice</h3>
            <p>Client, amount in USDC, due date. SettleSync gives it a number like SS-K7QM4X.</p>
          </li>
          <li>
            <h3>Send the pay link</h3>
            <p>Your client opens it, connects their wallet, and pays in one click. No account needed on their side.</p>
          </li>
          <li>
            <h3>It marks itself paid</h3>
            <p>The invoice number rides in the Stellar payment's memo, so the payment is matched to the right invoice the moment it lands.</p>
          </li>
          <li>
            <h3>Export for your CA</h3>
            <p>One CSV with every payment: date, client, amount, INR rate on the day, and a link to the transaction as proof.</p>
          </li>
        </ol>
      </section>

      <section className="why">
        <h2>Why Stellar</h2>
        <p>
          Payments settle in about five seconds and cost a fraction of a cent, so a 50 USDC invoice isn't eaten by fees.
          USDC is native on Stellar. And every Stellar payment has a memo field, which is what makes exact matching possible.
        </p>
      </section>

      <section className="pricing" id="pricing">
        <h2>Pricing</h2>
        <div className="plans">
          <div className="plan">
            <h3>Free</h3>
            <p className="plan__price">₹0</p>
            <ul>
              <li>5 invoices a month</li>
              <li>Pay links and automatic matching</li>
              <li>Payment history with proof</li>
            </ul>
          </div>
          <div className="plan plan--pro">
            <h3>Pro</h3>
            <p className="plan__price">₹299<span>/month, or 3 USDC</span></p>
            <ul>
              <li>Unlimited invoices</li>
              <li>CA-ready export with INR values</li>
              <li>Your logo on invoices and pay pages</li>
              <li>Automatic payment reminders</li>
            </ul>
          </div>
        </div>
        <p className="muted small">Everything is free during the testnet pilot.</p>
      </section>

      <section className="closing">
        <h2>Send your next invoice with SettleSync</h2>
        <a href="#/app" className="btn btn--primary">Create an invoice</a>
      </section>
    </>
  );
}
