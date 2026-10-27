import { useEffect, useState } from "react";
import { useApp } from "../../lib/app";
import { createClaimCode, redeemClaimCode } from "../../lib/actions";
import { readClaimCode, NETWORK, isValidAddress, getAccountInfo, estimateConversion } from "../../lib/stellar";
import PayBox from "../../components/PayBox";
import { loadCodes, saveCodes, claimLinkFor } from "../../lib/codes";
import { formatAmount, relativeTime } from "../../lib/invoices";
import { QrImage, useCopy, whatsappLink } from "../../components/bits";
import { CopyIcon, ChatIcon, QrIcon } from "../../components/Icons";

export default function SendTab({ account, setNotice, onSent }) {
  const [mode, setMode] = useState("code");
  return (
    <div className="send">
      <div className="seg seg--wide" role="tablist" aria-label="How to pay">
        <button role="tab" aria-selected={mode === "code"} className={mode === "code" ? "is-on" : ""} onClick={() => setMode("code")}>Create a claim code</button>
        <button role="tab" aria-selected={mode === "direct"} className={mode === "direct" ? "is-on" : ""} onClick={() => setMode("direct")}>Pay a wallet address</button>
      </div>
      <div className="send__grid">
        {mode === "code" ? <CodeForm account={account} setNotice={setNotice} onSent={onSent} /> : <DirectForm account={account} setNotice={setNotice} onSent={onSent} />}
        <aside className="send__explain">
          {mode === "code" ? (
            <>
              <h3>How claim codes work</h3>
              <ol className="mini-steps">
                <li>You lock the amount in a one-time code on Stellar. It leaves your wallet now.</li>
                <li>Send the code or link on WhatsApp, email, anywhere.</li>
                <li>They paste it in SettleSync and the money moves to their wallet. No request needed from them.</li>
                <li>Not redeemed? Take it back any time with one click.</li>
              </ol>
              <p className="small muted">Treat a code like cash: anyone who has it can redeem it. A small XLM deposit keeps the code open on Stellar and comes back to you when it's redeemed.</p>
            </>
          ) : (
            <>
              <h3>Paying a wallet directly</h3>
              <p className="small muted">Use this when you already know their Stellar address. Add a note like "Logo, October" and it travels with the payment, so both of you can see what it was for. Choose what they receive (USDC or XLM) and what you pay with: if you only hold XLM, Stellar converts it inside the payment and they still get the exact amount.</p>
            </>
          )}
        </aside>
      </div>
      <MyCodes setNotice={setNotice} onChange={onSent} />
    </div>
  );
}

function AmountFields({ f, set }) {
  return (
    <div className="form__row">
      <label className="field">Amount
        <input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="20" required />
      </label>
      <label className="field">In
        <select value={f.assetCode} onChange={set("assetCode")}>
          <option value="USDC">USDC</option>
          <option value="XLM">XLM</option>
        </select>
      </label>
    </div>
  );
}

function validAmount(a) {
  const amount = a.trim().replace(/,/g, "");
  if (!(Number(amount) > 0) || !/^\d+(\.\d{1,7})?$/.test(amount)) return null;
  return amount;
}

function CodeForm({ account, setNotice, onSent }) {
  const { address, profile } = useApp();
  const [f, setF] = useState({ amount: "", assetCode: "USDC", note: "" });
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const amount = validAmount(f.amount);
    if (!amount) return setNotice({ kind: "error", text: "Enter an amount greater than zero, with up to 7 decimals." });
    if (f.assetCode === "USDC" && !account?.hasUsdcTrustline) return setNotice({ kind: "error", text: "This wallet doesn't hold USDC yet. Use Get test USDC above, or send XLM." });
    setBusy(true);
    try {
      const res = await createClaimCode({ from: address, amount, assetCode: f.assetCode, note: f.note.trim(), fromName: profile.name });
      const code = { secret: res.secret, publicKey: res.publicKey, amount, assetCode: f.assetCode, note: f.note.trim(), createdAt: new Date().toISOString(), hash: res.hash };
      saveCodes(address, [code, ...loadCodes(address)]);
      setMade(code);
      setF({ amount: "", assetCode: f.assetCode, note: "" });
      setNotice({ kind: "success", text: `Claim code for ${formatAmount(amount, f.assetCode)} is ready. Share it with the person you're paying.` });
      onSent();
    } catch (err) {
      setNotice({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (made) return <CodeCard code={made} fresh onDone={() => setMade(null)} />;

  return (
    <form className="form" onSubmit={submit}>
      <h2>Create a claim code</h2>
      <AmountFields f={f} set={set} />
      <label className="field">Note for them <span className="muted">(optional)</span>
        <input value={f.note} onChange={set("note")} maxLength={60} placeholder="Advance for the website, thank you!" />
      </label>
      <button className="btn btn--primary btn--lg" disabled={busy}>{busy ? "Approve in your wallet…" : "Create code"}</button>
    </form>
  );
}

function DirectForm({ account, setNotice, onSent }) {
  const { address } = useApp();
  const [f, setF] = useState({ to: "", amount: "", assetCode: "USDC", note: "" });
  const [dest, setDest] = useState(null); // recipient's account info
  const [estimate, setEstimate] = useState(null);
  const [round, setRound] = useState(0); // resets the pay box after a payment
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const to = f.to.trim();
  const amount = validAmount(f.amount);
  const toOk = isValidAddress(to) && to !== address;

  useEffect(() => {
    if (!toOk) return setDest(null);
    let alive = true;
    getAccountInfo(to).then((i) => alive && setDest(i)).catch(() => alive && setDest(null));
    return () => { alive = false; };
  }, [to, toOk]);

  // How much of the chosen currency the wallet's spare XLM could become.
  const spareXlm = Math.max(0, Number(account?.xlm || 0) - 2);
  useEffect(() => {
    setEstimate(null);
    if (f.assetCode === "XLM" || spareXlm < 1) return;
    let alive = true;
    estimateConversion({ fromCode: "XLM", amount: spareXlm.toFixed(7), toCode: f.assetCode })
      .then((v) => alive && setEstimate(v))
      .catch(() => {});
    return () => { alive = false; };
  }, [f.assetCode, spareXlm]);

  const destProblem = !toOk
    ? (to && to === address ? "That's your own wallet." : "")
    : dest && !dest.exists
      ? `That wallet isn't active on Stellar ${NETWORK.label} yet. Send a claim code instead; it works for any wallet.`
      : dest && f.assetCode === "USDC" && !dest.hasUsdcTrustline
        ? "That wallet can't receive USDC yet. Send XLM instead (you can still pay with anything you hold), or a claim code."
        : "";

  const own = f.assetCode === "USDC" ? Number(account?.usdc || 0) : Number(account?.xlm || 0);
  const paid = ({ amount: a, paidWith }) => {
    setNotice({ kind: "success", text: `Sent ${formatAmount(a, f.assetCode)}${paidWith ? ` (paid with ${paidWith}, converted on Stellar)` : ""}. It arrives in about 5 seconds.` });
    setF({ to: "", amount: "", assetCode: f.assetCode, note: "" });
    setRound((r) => r + 1);
    onSent();
  };

  return (
    <div className="form">
      <h2>Pay a wallet address</h2>
      <label className="field">Their Stellar address
        <input value={f.to} onChange={set("to")} placeholder="G…" spellCheck={false} required />
        {to && !isValidAddress(to) && <small className="field__err">A Stellar address starts with G and is 56 characters long.</small>}
      </label>
      <div className="form__row">
        <label className="field">Amount they receive
          <input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="20" required />
        </label>
        <label className="field">In
          <select value={f.assetCode} onChange={set("assetCode")}>
            <option value="USDC">USDC</option>
            <option value="XLM">XLM</option>
          </select>
        </label>
      </div>
      <p className="send__have small">
        In your wallet: <b>{formatAmount(account?.usdc || 0, "USDC")}</b> · <b>{formatAmount(Number(account?.xlm || 0).toFixed(2), "XLM")}</b>
        {amount && own < Number(amount) ? (
          <span className="send__tip">
            You don't have enough {f.assetCode}, but that's fine: pay with {f.assetCode === "USDC" ? "XLM" : "another currency"} below and Stellar converts it, so they still get exactly {formatAmount(amount, f.assetCode)}.
            {f.assetCode === "USDC" && estimate ? ` Your XLM is worth about ${formatAmount(estimate.toFixed(2), "USDC")}.` : ""}
          </span>
        ) : null}
      </p>
      <label className="field">What it's for <span className="muted">(optional, up to 28 characters)</span>
        <input value={f.note} onChange={set("note")} maxLength={28} placeholder="Logo, October" />
      </label>
      {destProblem && <p className="alert alert--warn">{destProblem}</p>}
      {toOk && amount && dest?.exists && !destProblem ? (
        <PayBox
          key={round}
          inv={{ direct: true, id: f.note.trim(), to, amount, assetCode: f.assetCode }}
          remaining={amount}
          payer={address}
          payerInfo={account}
          verb="Send"
          blocked={!account?.exists}
          onPaid={paid}
        />
      ) : (
        <button className="btn btn--primary btn--lg" disabled>{!toOk ? "Enter their address" : !amount ? "Enter an amount" : "Checking their wallet…"}</button>
      )}
    </div>
  );
}

function CodeCard({ code, fresh = false, onDone }) {
  const link = claimLinkFor(code.secret);
  const [copied, copy] = useCopy();
  const [qr, setQr] = useState(false);
  const msg = `I've sent you ${formatAmount(code.amount, code.assetCode)} on SettleSync${code.note ? ` ("${code.note}")` : ""}. Claim it here: ${link}`;
  return (
    <div className="code-card">
      <div className="code-card__top">
        <span className="code-card__amt">{formatAmount(code.amount, code.assetCode)}</span>
        {code.note && <span className="code-card__note">"{code.note}"</span>}
      </div>
      <p className="code-card__label">Claim code</p>
      <code className="code-card__code">{code.secret}</code>
      <div className="actions">
        <button className="btn btn--primary btn--sm" onClick={() => copy(link, "link")}><CopyIcon /> {copied === "link" ? "Copied" : "Copy claim link"}</button>
        <button className="btn btn--ghost btn--sm" onClick={() => copy(code.secret, "code")}>{copied === "code" ? "Copied" : "Copy code only"}</button>
        <a className="btn btn--ghost btn--sm" href={whatsappLink(msg)} target="_blank" rel="noreferrer"><ChatIcon /> WhatsApp</a>
        <button className="btn btn--ghost btn--sm" onClick={() => setQr((q) => !q)}><QrIcon /> QR</button>
      </div>
      {qr && <QrImage text={link} />}
      {fresh && (
        <>
          <p className="small muted">This code is also saved below, so you can share it again or take the money back later.</p>
          <button className="linkish small" onClick={onDone}>Create another code</button>
        </>
      )}
    </div>
  );
}

function MyCodes({ setNotice, onChange }) {
  const { address } = useApp();
  const [codes, setCodes] = useState(() => loadCodes(address));
  const [state, setState] = useState({});
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setCodes(loadCodes(address)), 3000);
    return () => clearInterval(t);
  }, [address]);

  useEffect(() => {
    let alive = true;
    Promise.all(codes.map(async (c) => [c.publicKey, await readClaimCode(c.secret).then((r) => (r ? "waiting" : "redeemed")).catch(() => "unknown")])).then(
      (pairs) => alive && setState(Object.fromEntries(pairs))
    );
    return () => { alive = false; };
  }, [codes]);

  if (!codes.length) return null;

  const takeBack = async (c) => {
    if (!window.confirm(`Take back ${formatAmount(c.amount, c.assetCode)}? The code will stop working.`)) return;
    setBusy(c.publicKey);
    try {
      const res = await redeemClaimCode({ secret: c.secret, to: address });
      setState((s) => ({ ...s, [c.publicKey]: "redeemed" }));
      saveCodes(address, loadCodes(address).map((x) => (x.publicKey === c.publicKey ? { ...x, tookBack: true, closedHash: res.hash } : x)));
      setCodes(loadCodes(address));
      setNotice({ kind: "success", text: `${formatAmount(c.amount, c.assetCode)} is back in your wallet.` });
      onChange();
    } catch (e) {
      setNotice({ kind: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="my-codes">
      <h2>Your claim codes</h2>
      <ul>
        {codes.map((c) => {
          const st = c.tookBack ? "returned" : state[c.publicKey] || "checking";
          return (
            <li key={c.publicKey} className="my-codes__item">
              <button className="my-codes__row" onClick={() => setOpen(open === c.publicKey ? null : c.publicKey)} aria-expanded={open === c.publicKey}>
                <span>
                  <b>{formatAmount(c.amount, c.assetCode)}</b>
                  <small>{c.note ? `"${c.note}" · ` : ""}created {relativeTime(c.createdAt)}</small>
                </span>
                <span className={`pill pill--${st === "waiting" ? "pending" : st === "redeemed" ? "paid" : "partial"}`}>
                  {st === "waiting" ? "Not redeemed yet" : st === "redeemed" ? "Redeemed" : st === "returned" ? "Taken back" : "Checking…"}
                </span>
              </button>
              {open === c.publicKey && (
                <div className="my-codes__more">
                  {st === "waiting" && <CodeCard code={c} />}
                  <div className="actions">
                    {st === "waiting" && <button className="btn btn--ghost btn--sm" onClick={() => takeBack(c)} disabled={busy === c.publicKey}>{busy === c.publicKey ? "Taking back…" : "Take the money back"}</button>}
                    <a className="btn btn--ghost btn--sm" href={NETWORK.explorerAccount(c.publicKey)} target="_blank" rel="noreferrer">See the code on Stellar</a>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
