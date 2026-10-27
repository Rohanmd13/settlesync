import { useEffect, useMemo, useState } from "react";
import { formatAmount, partAmountError, matchPayments, remainingOf } from "../lib/invoices";
import { quoteConversions, assetKey, USDC_ISSUER, CONVERSION_BUFFER, getIncomingPayments } from "../lib/stellar";
import { payInvoice } from "../lib/actions";

const trim7 = (n) => Number(n).toFixed(7).replace(/\.?0+$/, "");

// The paying side of an invoice or bill: how much (when part payments are allowed)
// and what to pay with (the invoice's own currency, or any other asset in the
// payer's wallet that Stellar can convert on the way).
// `inv.direct` = a plain payment to a wallet (Send money), not an invoice: no remaining-amount check.
export default function PayBox({ inv, remaining, payer, payerInfo, payeeName, blocked, onPaid, onError, onStale, verb = "Pay" }) {
  const [amount, setAmount] = useState(remaining);
  const [payWith, setPayWith] = useState(null); // asset key; null = invoice's own asset
  const [quotes, setQuotes] = useState(null); // null = loading, [] = none
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setAmount(remaining), [remaining]);

  const part = !!inv.part;
  const amt = part ? String(amount).trim().replace(/,/g, "") : remaining;
  const amtErr = part ? partAmountError(inv, amt) : "";
  const ownKey = assetKey(inv.assetCode, inv.assetCode === "USDC" ? USDC_ISSUER : null);

  // Fresh conversion prices whenever the amount changes (debounced).
  useEffect(() => {
    if (!payer || !payerInfo?.exists || amtErr) return setQuotes([]);
    setQuotes(null);
    let alive = true;
    const t = setTimeout(() => {
      quoteConversions({ payer, assetCode: inv.assetCode, amount: amt })
        .then((q) => alive && setQuotes(q))
        .catch(() => alive && setQuotes([]));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [payer, payerInfo?.exists, amt, amtErr, inv.assetCode]);

  const balanceOf = (key) => Number(payerInfo?.balances?.find((b) => b.key === key)?.amount ?? 0);
  const holdsOwn = inv.assetCode === "XLM" ? payerInfo?.exists : payerInfo?.hasUsdcTrustline;
  const ownBalance = balanceOf(ownKey);

  // Options: the invoice's own asset (if held) + every convertible asset the wallet holds.
  const options = useMemo(() => {
    const list = [];
    if (holdsOwn) list.push({ key: ownKey, code: inv.assetCode, direct: true, enough: ownBalance + 1e-7 >= Number(amt) });
    for (const q of quotes || []) {
      // XLM must also cover the 1 XLM minimum balance and the fee.
      const spare = q.code === "XLM" ? balanceOf("XLM") - 1.5 : balanceOf(q.key);
      list.push({ ...q, direct: false, enough: spare + 1e-7 >= Number(q.sendMax) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, holdsOwn, ownBalance, amt, payerInfo]);

  // Pick a sensible default: own asset if there's enough, else the first convertible one that covers it.
  useEffect(() => {
    if (!options.length) return;
    const cur = options.find((o) => o.key === (payWith || ownKey));
    if (cur && cur.enough) return;
    const pick = options.find((o) => o.direct && o.enough) || options.find((o) => o.enough) || options[0];
    setPayWith(pick.key === ownKey ? null : pick.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.map((o) => `${o.key}${o.enough}`).join()]);

  const chosen = options.find((o) => o.key === (payWith || ownKey)) || null;
  const converting = chosen && !chosen.direct;

  const pay = async () => {
    setErr("");
    if (amtErr) return setErr(amtErr);
    if (!chosen) return setErr(`Your wallet has nothing Stellar can turn into ${inv.assetCode} right now. Add ${inv.assetCode} or XLM first.`);
    if (!chosen.enough) return setErr(`Not enough ${chosen.code} in your wallet for this payment.`);
    setBusy(true);
    try {
      // Re-check what's left on Stellar right before paying, so an invoice can't be
      // paid twice (another tab, another device, or a page that hadn't refreshed yet).
      if (!inv.direct) {
        let fresh = null;
        try {
          fresh = matchPayments([inv], await getIncomingPayments(inv.to))[0];
        } catch {
          /* network hiccup: fall back to what the page shows */
        }
        if (fresh) {
          const left = Number(remainingOf(fresh));
          if (left <= 1e-7) {
            onStale?.(fresh);
            throw new Error("This invoice has already been paid in full. Nothing more to pay.");
          }
          if (Number(amt) > left + 1e-7) {
            onStale?.(fresh);
            throw new Error(`Some of this was paid in the meantime. Only ${formatAmount(left, inv.assetCode)} is left, so the amount has been updated. Check it and pay again.`);
          }
        }
      }
      const via = converting ? { code: chosen.code, issuer: chosen.issuer, sendMax: chosen.sendMax, sourceAmount: chosen.sourceAmount, path: chosen.path } : undefined;
      const res = await payInvoice({ payer, to: inv.to, amount: amt, assetCode: inv.assetCode, invoiceId: inv.id, via });
      onPaid?.({ amount: Number(amt), hash: res.hash, paidWith: converting ? chosen.code : null });
    } catch (e) {
      setErr(e.message);
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const label = (o) => (o.code === "USDC" || o.code === "XLM" ? o.code : `${o.code} (${o.issuer?.slice(0, 4)}…)`);
  const payLabel = busy
    ? "Approve in your wallet…"
    : `${verb} ${formatAmount(amt || 0, inv.assetCode)}${converting ? ` with ${chosen.code}` : ""}`;

  return (
    <div className="paybox">
      {part && (
        <div className="paybox__part">
          <label className="field">
            How much are you paying now?
            <span className="paybox__amt">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-invalid={!!amtErr} />
              <b>{inv.assetCode}</b>
            </span>
          </label>
          <div className="paybox__quick">
            <button type="button" className="chip" onClick={() => setAmount(remaining)}>Full {trim7(remaining)}</button>
            {Number(remaining) / 2 >= Number(inv.minPart || 0) && Number(remaining) > 0 && (
              <button type="button" className="chip" onClick={() => setAmount(trim7(Number(remaining) / 2))}>Half {trim7(Number(remaining) / 2)}</button>
            )}
            {Number(inv.minPart) > 0 && Number(inv.minPart) < Number(remaining) && (
              <button type="button" className="chip" onClick={() => setAmount(trim7(inv.minPart))}>Minimum {trim7(inv.minPart)}</button>
            )}
          </div>
          {Number(inv.minPart) > Number(remaining) && (
            <p className="small paybox__last">Only {formatAmount(remaining, inv.assetCode)} is left. That's below the {formatAmount(inv.minPart, inv.assetCode)} minimum, which is fine: the last payment can be smaller.</p>
          )}
          <p className="small muted">
            {payeeName || "The sender"} accepts part payments{Number(inv.minPart) > 0 ? ` of at least ${formatAmount(inv.minPart, inv.assetCode)}` : ""}. Pay the rest later with this same link.
          </p>
          {amtErr && amount !== "" && <p className="alert alert--warn">{amtErr}</p>}
        </div>
      )}

      {payerInfo?.exists && (
        <div className="paybox__with" role="radiogroup" aria-label="Pay with">
          <p className="paybox__label">Pay with</p>
          {quotes === null && !options.length ? (
            <p className="small muted">Checking your wallet…</p>
          ) : !options.length ? (
            <p className="alert alert--warn">Your wallet has nothing Stellar can turn into {inv.assetCode} right now. Add {inv.assetCode} or XLM first.</p>
          ) : (
            <div className="paybox__opts">
              {options.map((o) => {
                const on = (payWith || ownKey) === o.key;
                return (
                  <button key={o.key} type="button" role="radio" aria-checked={on} className={`paybox__opt ${on ? "is-on" : ""} ${o.enough ? "" : "is-short"}`} onClick={() => setPayWith(o.key === ownKey ? null : o.key)}>
                    <b>{label(o)}</b>
                    <span>
                      {o.direct ? `Balance ${formatAmount(balanceOf(o.key), o.code)}` : `About ${formatAmount(o.sourceAmount, o.code)}`}
                      {!o.enough && " · not enough"}
                    </span>
                  </button>
                );
              })}
              {quotes === null && <span className="small muted paybox__loading">Checking prices…</span>}
            </div>
          )}
          {converting && (
            <p className="paybox__conv">
              Stellar converts it inside the payment: {payeeName ? `${payeeName} receives` : "they receive"} exactly <b>{formatAmount(amt, inv.assetCode)}</b>, and you spend about{" "}
              <b>{formatAmount(chosen.sourceAmount, chosen.code)}</b> (at most {formatAmount(chosen.sendMax, chosen.code)}, a {CONVERSION_BUFFER * 100}% buffer in case the price moves).
            </p>
          )}
        </div>
      )}

      <button className="btn btn--primary btn--wide btn--lg" onClick={pay} disabled={busy || blocked || !!amtErr || !chosen || !chosen.enough}>
        {payLabel}
      </button>
      {err && <p className="alert alert--error">{err}</p>}
    </div>
  );
}
