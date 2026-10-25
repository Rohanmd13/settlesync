import { useEffect, useState } from "react";
import InvoiceSheet from "../components/InvoiceSheet";
import { printInvoice } from "../lib/printInvoice";
import { PrintIcon, WalletIcon, BackIcon } from "../components/Icons";
import { useApp, go } from "../lib/app";
import { decodePayLink, matchPayments, statusOf, formatAmount, remainingOf } from "../lib/invoices";
import { NETWORK, getAccountInfo, getIncomingPayments, shortAddr, sep7PayUri } from "../lib/stellar";
import { payInvoice } from "../lib/actions";

export default function PayPage({ token }) {
  const { address: payer, connect, network, walletNetwork, switchNetwork } = useApp();
  const invoice = decodePayLink(token);
  const linkNet = invoice?.net === "mainnet" ? "mainnet" : "testnet";
  useEffect(() => {
    if (invoice && linkNet !== network) switchNetwork(linkNet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkNet]);
  const netLabel = linkNet === "mainnet" ? "Main Net" : "Testnet";
  const walletMismatch = payer && walletNetwork && walletNetwork !== linkNet;
  const [state, setState] = useState(null);
  const [payerInfo, setPayerInfo] = useState(null);
  const [receiverOk, setReceiverOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [stampKey, setStampKey] = useState(null);

  useEffect(() => {
    if (!invoice) return;
    let alive = true;
    getIncomingPayments(invoice.to)
      .then((pays) => alive && setState(matchPayments([invoice], pays)[0]))
      .catch(() => alive && setState({ ...invoice, received: 0, payments: [] }));
    getAccountInfo(invoice.to)
      .then((i) => alive && setReceiverOk(invoice.assetCode === "XLM" ? i.exists : i.hasUsdcTrustline))
      .catch(() => alive && setReceiverOk(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!payer) return setPayerInfo(null);
    getAccountInfo(payer).then(setPayerInfo).catch(() => setPayerInfo(null));
  }, [payer, result]);

  if (!invoice) {
    return (
      <section className="page page--narrow">
        <h1>This pay link isn't complete</h1>
        <p className="lede">It may have been cut off when it was copied. Ask the sender to copy it again from SettleSync, or to send the request straight to your wallet.</p>
        <button className="btn btn--ghost" onClick={() => go("/")}>Go to SettleSync home</button>
      </section>
    );
  }

  const view = state || { ...invoice, received: 0, payments: [] };
  const status = statusOf(view);
  const remaining = remainingOf(view);
  const isSelf = payer && payer === invoice.to;
  const balance = payerInfo ? (invoice.assetCode === "XLM" ? Number(payerInfo.xlm) : Number(payerInfo.usdc ?? 0)) : null;
  const lacksTrust = invoice.assetCode === "USDC" && payerInfo?.exists && !payerInfo.hasUsdcTrustline;
  const tooLow = balance !== null && balance < Number(remaining);

  const onConnect = async () => {
    setError("");
    try {
      await connect();
    } catch (e) {
      if (!/closed|cancel/i.test(e.message)) setError(e.message);
    }
  };

  const pay = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await payInvoice({ payer, to: invoice.to, amount: remaining, assetCode: invoice.assetCode, invoiceId: invoice.id });
      setResult({ hash: res.hash });
      setState({ ...view, received: (view.received || 0) + Number(remaining), paidAt: new Date().toISOString() });
      setStampKey(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const lastHash = result?.hash || view.payments?.[view.payments.length - 1]?.hash;

  return (
    <section className="page pay">
      <div className="pay__crumbs">
        <button className="linkish" onClick={() => (window.history.length > 1 ? window.history.back() : go("/"))}><BackIcon /> Back</button>
        <span className="muted small">Invoice {invoice.id} from {invoice.fromName || shortAddr(invoice.to)}</span>
      </div>

      <div className="pay__grid">
        <div className="pay__doc">
          <InvoiceSheet inv={view} status={status} stampKey={stampKey} printable />
          <button className="btn btn--ghost btn--sm pay__print" onClick={() => printInvoice(view)}><PrintIcon /> Download PDF</button>
        </div>

        <div className="pay__side">
          {status === "paid" ? (
            <div className="pay__box pay__box--done">
              <h1>{result ? "Payment sent" : "This invoice is paid"}</h1>
              <p>
                {formatAmount(invoice.amount, invoice.assetCode)} reached {invoice.fromName || shortAddr(invoice.to)}
                {result ? ". They'll see it marked paid on their side automatically." : "."}
              </p>
              {lastHash && (
                <a className="btn btn--ghost btn--wide" href={NETWORK.explorerTx(lastHash)} target="_blank" rel="noreferrer">View the transaction on Stellar</a>
              )}
              {payer && <button className="btn btn--primary btn--wide" onClick={() => go("/dashboard/history")}>See it in your history</button>}
              <p className="small muted">Want invoices that mark themselves paid? <a href="#/">Try SettleSync</a></p>
            </div>
          ) : (
            <div className="pay__box">
              <p className="pay__eyebrow">Pay {invoice.fromName || "this invoice"}</p>
              <p className="pay__amount">{formatAmount(remaining, invoice.assetCode)}</p>
              {view.received > 0 && <p className="small">Already received {formatAmount(view.received, invoice.assetCode)} of {formatAmount(invoice.amount, invoice.assetCode)}.</p>}
              <p className="small muted">Sent straight to {shortAddr(invoice.to)} on Stellar. Settles in about 5 seconds; the fee is a fraction of a rupee.</p>
              <a className="sep7-link" href={sep7PayUri({ to: invoice.to, amount: remaining, assetCode: invoice.assetCode, memo: invoice.id, msg: `Invoice ${invoice.id}${invoice.fromName ? ` from ${invoice.fromName}` : ""}` })}>
                Paying from a phone? Open in your wallet app
              </a>

              <p className="pay__net"><span className={`net-chip ${linkNet === "mainnet" ? "net-chip--main" : ""}`}><i aria-hidden="true" />{netLabel}</span> {linkNet === "mainnet" ? "Real money on Stellar Main Net" : "Test money on Stellar Testnet"}</p>
              {walletMismatch && (
                <p className="alert alert--warn">This invoice is on Stellar {netLabel}, but your wallet is on {walletNetwork === "mainnet" ? "Main Net" : "Testnet"}. Switch your wallet's network to {netLabel} to pay it.</p>
              )}
              {receiverOk === false && (
                <p className="alert alert--warn">This wallet can't receive {invoice.assetCode} yet. Ask {invoice.fromName || "the sender"} to enable it in SettleSync first.</p>
              )}

              {!payer ? (
                <button className="btn btn--primary btn--wide btn--lg" onClick={onConnect}><WalletIcon /> Connect wallet to pay</button>
              ) : isSelf ? (
                <p className="alert alert--warn">You're connected with the wallet this invoice pays into. Switch to the paying wallet to continue.</p>
              ) : (
                <>
                  <p className="small">Paying from <b>{shortAddr(payer)}</b>{balance !== null && <>, balance {formatAmount(balance, invoice.assetCode)}</>}</p>
                  {payerInfo && !payerInfo.exists && <p className="alert alert--warn">Your wallet isn't active on Stellar yet. It needs a little XLM first.</p>}
                  {lacksTrust && (
                    <p className="alert alert--warn">Your wallet doesn't hold USDC yet. Enable USDC in your SettleSync dashboard and add some first.</p>
                  )}
                  {!lacksTrust && tooLow && payerInfo?.exists && <p className="alert alert--warn">Your balance is lower than the amount due.</p>}
                  <button className="btn btn--primary btn--wide btn--lg" onClick={pay} disabled={busy || lacksTrust || receiverOk === false || (payerInfo && !payerInfo.exists) || walletMismatch}>
                    {busy ? "Approve in your wallet…" : `Pay ${formatAmount(remaining, invoice.assetCode)}`}
                  </button>
                </>
              )}
              {error && <p className="alert alert--error">{error}</p>}
              <p className="small muted">Invoice number {invoice.id} travels with your payment, so it's matched to this invoice automatically. No SettleSync account needed.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
