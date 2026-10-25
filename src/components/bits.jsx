import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getLatestLedger, NETWORK } from "../lib/stellar";
import { useApp } from "../lib/app";

// Reveals children once when they scroll into view.
export function Reveal({ as: Tag = "div", className = "", children, delay = 0, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${shown ? "is-in" : ""} ${className}`} style={{ "--d": `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

// Latest closed ledger on the active Stellar network, refreshed every 6s.
export function useLatestLedger() {
  const [ledger, setLedger] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      getLatestLedger()
        .then((l) => alive && setLedger(l))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return ledger;
}

export function LivePill() {
  useApp(); // re-render when the network changes
  const ledger = useLatestLedger();
  return (
    <span className="live-pill" title={`Live data from Stellar ${NETWORK.label}`}>
      <span className={`live-pill__dot ${ledger ? "is-on" : ""}`} aria-hidden="true" />
      {ledger ? <>{NETWORK.label} ledger <b>#{Number(ledger.sequence).toLocaleString("en-US")}</b></> : "Connecting to Stellar…"}
    </span>
  );
}

export function QrImage({ text, size = 180 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: "#1c2541", light: "#ffffff" } })
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [text, size]);
  if (!src) return <div className="qr qr--loading" style={{ width: size, height: size }} />;
  return <img className="qr" src={src} width={size} height={size} alt="QR code of the pay link" />;
}

export function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = async (text, key = "default") => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this:", text);
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };
  return [copied, copy];
}

export function whatsappLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
