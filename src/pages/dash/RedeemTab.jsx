import { useEffect, useState } from "react";
import { useApp } from "../../lib/app";
import { readClaimCode, isCodeSecret, shortAddr, NETWORK } from "../../lib/stellar";
import { redeemClaimCode } from "../../lib/actions";
import { extractSecret } from "../../lib/codes";
import { formatAmount } from "../../lib/invoices";

// Shared by the dashboard tab and the public /claim page.
export function RedeemBox({ initial = "", account, onRedeemed, compact = false }) {
  const { address, profile } = useApp();
  const [input, setInput] = useState(initial);
  const [code, setCode] = useState(undefined); // undefined = not checked, null = invalid/used
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  const secret = extractSecret(input);

  useEffect(() => {
    setErr("");
    setDone(null);
    if (!isCodeSecret(secret)) {
      setCode(undefined);
      return;
    }
    let alive = true;
    setChecking(true);
    readClaimCode(secret)
      .then((c) => alive && setCode(c))
      .catch(() => alive && setErr("Couldn't reach Stellar to check this code. Try again."))
      .finally(() => alive && setChecking(false));
    return () => { alive = false; };
  }, [secret]);

  const needsUsdc = code?.assetCode === "USDC" && account && !account.hasUsdcTrustline;

  const redeem = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await redeemClaimCode({ secret, to: address });
      setDone({ ...res, code });
      setCode(null);
      onRedeemed?.(res);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="redeem redeem--done">
        <div className="redeem__stamp" aria-hidden="true">Received</div>
        <h2>{formatAmount(done.code.amount, done.code.assetCode)} is in your wallet</h2>
        <p className="muted">From {done.code.fromName || shortAddr(done.code.from)}{done.code.note ? `: "${done.code.note}"` : ""}.</p>
        <a className="btn btn--ghost" href={NETWORK.explorerTx(done.hash)} target="_blank" rel="noreferrer">View the transaction</a>
      </div>
    );
  }

  return (
    <div className={`redeem ${compact ? "redeem--compact" : ""}`}>
      {!initial && (
        <label className="field">Claim code or link
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste the code (starts with S) or the claim link" spellCheck={false} autoFocus />
        </label>
      )}
      {input && !isCodeSecret(secret) && <p className="alert alert--warn">That doesn't look like a SettleSync claim code. Codes start with S and are 56 characters.</p>}
      {checking && <p className="muted">Checking the code on Stellar…</p>}
      {code === null && !checking && <p className="alert alert--warn">This code has already been redeemed or taken back, so there's nothing left to claim.</p>}
      {code && (
        <div className="redeem__preview">
          <p className="redeem__from">{code.fromName || shortAddr(code.from)} sent you</p>
          <p className="redeem__amt">{formatAmount(code.amount, code.assetCode)}</p>
          {code.note && <p className="redeem__note">"{code.note}"</p>}
          {needsUsdc && <p className="alert alert--warn">Your wallet needs USDC turned on first. Use the Enable USDC button above, then redeem.</p>}
          <button className="btn btn--primary btn--lg btn--wide" onClick={redeem} disabled={busy || needsUsdc || !address || account?.exists === false}>
            {busy ? "Redeeming…" : `Redeem to ${profile.name ? profile.name + "’s wallet" : shortAddr(address)}`}
          </button>
          <p className="small muted">No wallet signature needed: the code itself authorises the transfer. Takes about 5 seconds.</p>
        </div>
      )}
      {err && <p className="alert alert--error">{err}</p>}
    </div>
  );
}

export default function RedeemTab({ account, setNotice, onRedeemed }) {
  return (
    <div className="redeem-wrap">
      <RedeemBox
        account={account}
        onRedeemed={(res) => {
          setNotice({ kind: "success", text: "Claim code redeemed. The money is in your wallet." });
          onRedeemed(res);
        }}
      />
    </div>
  );
}
