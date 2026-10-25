import { useEffect, useState } from "react";

// Opening sequence, once per browser session: the ledger mark is stitched,
// the wordmark rises, a payment is stamped "Settled", then the curtain lifts.
// Click or press any key to skip. Skipped entirely for reduced-motion users.
const KEY = "settlesync:intro-seen";
const DURATION = 2600;

export default function Intro() {
  const [show, setShow] = useState(() => {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
      if (sessionStorage.getItem(KEY)) return false;
      const r = window.location.hash.replace(/^#/, "") || "/";
      return !r.startsWith("/pay/") && !r.startsWith("/claim/") && !r.startsWith("/owner");
    } catch {
      return false;
    }
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    document.body.classList.add("no-scroll");
    const leave = () => setLeaving(true);
    const t = setTimeout(leave, DURATION);
    window.addEventListener("keydown", leave, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", leave);
    };
  }, [show]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setShow(false);
      document.body.classList.remove("no-scroll");
    }, 750);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!show) return null;
  const word = "SettleSync";
  return (
    <div className={`intro ${leaving ? "is-leaving" : ""}`} onClick={() => setLeaving(true)} role="presentation">
      <div className="intro__curtain intro__curtain--top" />
      <div className="intro__curtain intro__curtain--bottom" />
      <div className="intro__center">
        <div className="intro__mark" aria-hidden="true">
          <span className="intro__spine" />
          <span className="intro__line" style={{ "--i": 0 }} />
          <span className="intro__line" style={{ "--i": 1 }} />
          <span className="intro__line" style={{ "--i": 2 }} />
        </div>
        <p className="intro__word" aria-label="SettleSync">
          {[...word].map((ch, i) => (
            <span key={i} style={{ "--i": i }} aria-hidden="true">{ch}</span>
          ))}
        </p>
        <p className="intro__tag">Invoices that mark themselves paid</p>
        <span className="intro__stamp" aria-hidden="true">Settled</span>
      </div>
      <button className="intro__skip" onClick={() => setLeaving(true)}>Skip</button>
    </div>
  );
}
