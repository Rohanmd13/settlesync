import { useEffect, useState } from "react";

// Animated explainer: a payment leaves a client's wallet carrying its invoice
// number, travels down the rail, and the matching ledger line marks itself paid.
const ROWS = [
  { client: "Lumen Labs DAO", place: "DAO, remote", amount: "1,200", id: "SS-K7QM4X" },
  { client: "Build Grant 2026", place: "Grant program", amount: "450", id: "SS-9PRT2C" },
  { client: "Kite Studio", place: "Agency, Berlin", amount: "320", id: "SS-H4WQ8N" },
];

const STEP_MS = 3000;

export default function HeroFlow() {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [active, setActive] = useState(reduced ? -1 : 0);
  const [paid, setPaid] = useState(reduced ? ROWS.length : 0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const arrive = setTimeout(() => setPaid((p) => Math.max(p, active + 1)), 1500);
    const next = setTimeout(() => {
      if (active + 1 < ROWS.length) setActive(active + 1);
      else {
        setActive(-1);
        setTimeout(() => {
          setPaid(0);
          setCycle((c) => c + 1);
          setActive(0);
        }, 1600);
      }
    }, STEP_MS);
    return () => {
      clearTimeout(arrive);
      clearTimeout(next);
    };
  }, [active, reduced]);

  const row = ROWS[active];

  return (
    <div className="flow" aria-label="Animation: a USDC payment carrying invoice number SS-K7QM4X arrives and the matching invoice marks itself paid">
      <div className="flow__clients" aria-hidden="true">
        {ROWS.map((r, i) => (
          <div key={r.id} className={`flow__client ${i === active ? "is-active" : ""}`}>
            <span className="flow__avatar">{r.client[0]}</span>
            <span>
              <b>{r.client}</b>
              <small>{r.place}</small>
            </span>
          </div>
        ))}
      </div>

      <div className="flow__rail" aria-hidden="true">
        {row && (
          <div key={`${cycle}-${active}`} className="flow__slip">
            <b>+{row.amount} USDC</b>
            <span>memo {row.id}</span>
          </div>
        )}
      </div>

      <div className="flow__ledger">
        <div className="flow__ledger-head">
          <span>Your ledger</span>
          <span className="flow__watch"><i aria-hidden="true" /> watching Stellar</span>
        </div>
        <ul>
          {ROWS.map((r, i) => {
            const isPaid = i < paid;
            return (
              <li key={r.id} className={isPaid ? "is-paid" : ""}>
                <span className="flow__row-client">
                  <b>{r.client}</b>
                  <small>{r.id}</small>
                </span>
                <span className="flow__row-amt">{r.amount} USDC</span>
                <span className="flow__row-status">
                  {isPaid ? <span key={`p-${cycle}`} className="mini-stamp">Paid</span> : "Awaiting"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
