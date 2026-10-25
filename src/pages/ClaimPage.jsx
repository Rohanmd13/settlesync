import { useEffect, useState } from "react";
import { useApp, go } from "../lib/app";
import { getAccountInfo, readClaimCode, isCodeSecret, shortAddr } from "../lib/stellar";
import { formatAmount } from "../lib/invoices";
import { RedeemBox } from "./dash/RedeemTab";
import { WalletIcon } from "../components/Icons";

// Public page for a claim link: #/claim/<code>
export default function ClaimPage({ secret, net = "testnet" }) {
  const { address, connect, network, switchNetwork, walletNetwork } = useApp();
  useEffect(() => {
    if (net !== network) switchNetwork(net);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);
  const [account, setAccount] = useState(null);
  const [preview, setPreview] = useState(undefined);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isCodeSecret(secret)) return setPreview(null);
    readClaimCode(secret).then(setPreview).catch(() => setPreview(null));
  }, [secret]);

  useEffect(() => {
    if (address) getAccountInfo(address).then(setAccount).catch(() => setAccount(null));
  }, [address]);

  const onConnect = async () => {
    setErr("");
    try {
      await connect();
    } catch (e) {
      if (!/closed|cancel/i.test(e.message)) setErr(e.message);
    }
  };

  return (
    <section className="page page--narrow claim">
      <p className="claim__kicker">SettleSync claim code</p>
      {preview === undefined ? (
        <p className="muted">Checking the code on Stellar…</p>
      ) : preview === null ? (
        <>
          <h1>Nothing left to claim</h1>
          <p className="lede">This code has already been redeemed or taken back by the sender, or the link was cut off when it was copied.</p>
          <button className="btn btn--ghost" onClick={() => go("/")}>Go to SettleSync</button>
        </>
      ) : !address ? (
        <>
          <h1>{preview.fromName || shortAddr(preview.from)} sent you {formatAmount(preview.amount, preview.assetCode)}</h1>
          {preview.note && <p className="lede">"{preview.note}"</p>}
          <p className="lede">Connect the Stellar wallet you want it in. Redeeming takes about 5 seconds and costs you nothing.</p>
          <button className="btn btn--primary btn--lg" onClick={onConnect}><WalletIcon /> Connect wallet to claim</button>
          {err && <p className="alert alert--error">{err}</p>}
          <p className="small muted">No wallet yet? Albedo works in the browser with nothing to install.</p>
        </>
      ) : (
        <>
          <h1>Claim your payment</h1>
          {walletNetwork && walletNetwork !== net && <p className="alert alert--warn">This code is on Stellar {net === "mainnet" ? "Main Net" : "Testnet"}. Switch your wallet to the same network before redeeming.</p>}
          {account && !account.exists && <p className="alert alert--warn">This wallet isn't active on Stellar yet. It needs a little XLM first (on Testnet, use Add test XLM in your dashboard).</p>}
          <RedeemBox initial={secret} account={account} onRedeemed={() => getAccountInfo(address).then(setAccount)} />
          <p className="small muted"><a href="#/dashboard">Go to your dashboard</a></p>
        </>
      )}
    </section>
  );
}
