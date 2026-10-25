import { useEffect, useState } from "react";

// A plain-language explainer, one step at a time:
// 1 invoice sent → 2 client pays → 3 invoice marks itself paid.
const INVOICE = { client: "Kite Studio", amount: "320", id: "SS-H4WQ8N", work: "Website design" };
const STEPS = [
  { title: "You send an invoice", body: "320 USDC to Kite Studio, numbered SS-H4WQ8N." },
  { title: "Your client pays", body: "The invoice number travels with the payment." },
  { title: "It marks itself paid", body: "No checking your wallet, no spreadsheet." },
];
const STEP_MS = 2600;

export default function HeroFlow() {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState(reduced ? 2 : 0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => {
      if (step < 2) setStep(step + 1);
      else {
        setStep(0);
        setCycle((c) => c + 1);
      }
    }, step === 2 ? STEP_MS + 1400 : STEP_MS);
    return () => clearTimeout(t);
  }, [step, reduced]);

  const paid = step === 2;

  return (
    <div className="flow2" aria-label="How SettleSync works: you send an invoice, your client pays, and the invoice marks itself paid">
      <ol className="flow2__steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={i === step ? "is-on" : i < step ? "is-done" : ""}>
            <button type="button" onClick={() => setStep(i)} aria-current={i === step}>
              <span className="flow2__num">{i < step ? "✓" : i + 1}</span>
              <span className="flow2__txt"><b>{s.title}</b><small>{s.body}</small></span>
            </button>
          </li>
        ))}
      </ol>

      <div className="flow2__stage">
        <div className={`flow2__invoice ${paid ? "is-paid" : ""}`}>
          <div className="flow2__spine" aria-hidden="true" />
          <div className="flow2__body">
            <div className="flow2__head">
              <span>Invoice <b>{INVOICE.id}</b></span>
              <span className={`flow2__status ${paid ? "is-paid" : ""}`}>{paid ? "Paid" : step === 1 ? "Payment arriving…" : "Waiting for payment"}</span>
            </div>
            <p className="flow2__client">{INVOICE.client}</p>
            <p className="flow2__work">{INVOICE.work}</p>
            <p className="flow2__amt">{INVOICE.amount} <span>USDC</span></p>
          </div>
          {paid && <div key={`s-${cycle}`} className="flow2__stamp" aria-hidden="true">PAID</div>}
        </div>

        {step === 1 && (
          <div key={`c-${cycle}`} className="flow2__coin" aria-hidden="true">
            <b>+320 USDC</b>
            <small>from Kite Studio · invoice {INVOICE.id}</small>
          </div>
        )}
        <p className="flow2__caption">{STEPS[step].body}</p>
      </div>
    </div>
  );
}
