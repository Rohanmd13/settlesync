import { useEffect, useState } from "react";
import InvoiceSheet from "../components/InvoiceSheet";
import { decodePayLink, matchPayments, statusOf, formatAmount } from "../lib/invoices";
import {
  NETWORK,
  getAccountInfo,
  getIncomingPayments,
  buildInvoicePayment,
  submitSigned,
  shortAddr,
} from "../lib/stellar";
import { connectWallet, getConnectedAddress, signWithWallet, checkNetwork } from "../lib/wallet";

export default function PayPage({ token }) {
  const invoice = decodePayLink(token);
  const [state, setState] = useState(null); // matched invoice (received / paidAt)
  const [payer, setPayer] = useState(null);
  const [payerInfo, setPayerInfo] = useState(null);
  const [receiverOk, setReceiverOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [stampKey, setStampKey] = useState(null);

  // Has this invoice already been paid? Check the freelancer's incoming payments.
  useEffect(() => {
    if (!invoice) return;
    let alive = true;
    const check = async () => {
      try {
        const pays = await getIncomingPayments(invoice.to);
        if (alive) setState(matchPayments([invoice], pays)[0]);
      } catch {
        if (alive) setState({ ...invoice, received: 0, payments: [] });
      }
    };
    check();
    getAccountInfo(invoice.to)
      .then((i) => alive && setReceiverOk(invoice.assetCode === "XLM" ? i.exists : i.hasUsdcTrustline))
      .catch(() => alive && setReceiverOk(null));
    getConnectedAddress().then((a) => alive && a && setPayer(a));
    return () => { alive = false; };
    // token identifies the invoice; re-run only if the link changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!payer) return;
    getAccountInfo(payer).then(setPayerInfo).catch(() => setPayerInfo(null));
  }, [payer, result]);

  if (!invoice) {
    return (
      <section className="page page--narrow">
        <h1>This pay link isn't valid</h1>
        <p>The link may have been cut off when it was copied. Ask the sender to copy it again from SettleSync.</p>
      </section>
    );
  }

  const view = state || { ...invoice, received: 0, payments: [] };
  const status = statusOf(view);
  const remaining = Math.max(0, Number(invoice.amount) - (view.received || 0));
  const remainingStr = remaining.toFixed(7).replace(/\.?0+$/, "");
  const isSelf = payer && payer === invoice.to;

  const balance = payerInfo ? (invoice.assetCode === "XLM" ? Number(payerInfo.xlm) : Number(payerInfo.usdc ?? 0)) : null;
  const lacksTrust = invoice.assetCode === "USDC" && payerInfo?.exists && !payerInfo.hasUsdcTrustline;
  const tooLow = balance !== null && balance < remaining;

  const connect = async () => {
    setError("");
    try {
      setPayer(await connectWallet());
    } catch (e) {
      setError(e.message);
    }
  };

  const pay = async () => {
    setError("");
    setBusy(true);
    try {
      const net = await checkNetwork();
      if (!net.ok) throw new Error(net.message);
      const xdr = await buildInvoicePayment({
        from: payer,
        to: invoice.to,
        amount: remainingStr,
        assetCode: invoice.assetCode,
        invoiceId: invoice.id,
      });
      const signed = await signWithWallet(xdr, payer);
      const res = await submitSigned(signed);
      setResult({ hash: res.hash });
      const received = (view.received || 0) + remaining;
      setState({ ...view, received, paidAt: new Date().toISOString() });
      setStampKey(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page pay">
      <div className="pay__doc">
        <InvoiceSheet inv={view} status={status} stampKey={stampKey} />
      </div>

      <div className="pay__side">
        {status === "paid" ? (
          <div className="pay__done">
            <h1>{result ? "Payment sent" : "This invoice is paid"}</h1>
            <p>
              {formatAmount(invoice.amount, invoice.assetCode)} reached {invoice.fromName || shortAddr(invoice.to)}
              {result ? ". They'll see it marked as paid automatically." : "."}
            </p>
            {(result?.hash || view.payments?.length > 0) && (
              <a
                className="btn btn--ghost"
                href={NETWORK.explorerTx(result?.hash || view.payments[view.payments.length - 1].hash)}
                target="_blank"
                rel="noreferrer"
              >
                View the transaction on Stellar
              </a>
            )}
          </div>
        ) : (
          <div className="pay__box">
            <h1>Pay {invoice.fromName || "this invoice"}</h1>
            <p className="pay__amount">{formatAmount(remainingStr, invoice.assetCode)}</p>
            <p className="muted small">
              Sent directly to {shortAddr(invoice.to)} on Stellar. Settles in about 5 seconds; the network fee is a fraction of a cent.
            </p>

            {receiverOk === false && (
              <p className="alert alert--warn">
                This wallet can't receive {invoice.assetCode} yet. Ask the sender to enable it in SettleSync before you pay.
              </p>
            )}

            {!payer ? (
              <button className="btn btn--primary btn--wide" onClick={connect}>Connect Freighter to pay</button>
            ) : isSelf ? (
              <p className="alert alert--warn">
                You're connected with the wallet this invoice pays into. Switch Freighter to the client's account to pay it.
              </p>
            ) : (
              <>
                <p className="small">Paying from <strong>{shortAddr(payer)}</strong>
                  {balance !== null && <> · balance {formatAmount(balance, invoice.assetCode)}</>}
                </p>
                {payerInfo && !payerInfo.exists && (
                  <p className="alert alert--warn">Your wallet isn't active on testnet yet. Use the Fund button in Freighter first.</p>
                )}
                {lacksTrust && (
                  <p className="alert alert--warn">
                    Your wallet doesn't hold USDC yet. Get testnet USDC from <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a> (choose Stellar testnet).
                  </p>
                )}
                {!lacksTrust && tooLow && payerInfo?.exists && (
                  <p className="alert alert--warn">Your balance is lower than the amount due.</p>
                )}
                <button
                  className="btn btn--primary btn--wide"
                  onClick={pay}
                  disabled={busy || lacksTrust || receiverOk === false || (payerInfo && !payerInfo.exists)}
                >
                  {busy ? "Confirm in Freighter…" : `Pay ${formatAmount(remainingStr, invoice.assetCode)}`}
                </button>
              </>
            )}
            {error && <p className="alert alert--error">{error}</p>}
            <p className="muted small">The invoice number {invoice.id} travels with the payment, so it's matched to this invoice automatically.</p>
          </div>
        )}
      </div>
    </section>
  );
}
