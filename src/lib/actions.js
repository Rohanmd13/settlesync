// Wallet-signed actions shared across pages.
import {
  buildInvoicePayment,
  buildPaymentRequest,
  buildUsdcTrustline,
  submitSigned,
  getAccountInfo,
  isValidAddress,
  requestMemoFits,
  buildDirectPayment,
  buildClaimCode,
  cosignWithCode,
  buildRedeem,
  buildProPayment,
  buildTestUsdcSwap,
  NETWORK,
} from "./stellar";
import { signWithWallet } from "./wallet";

export async function payInvoice({ payer, to, amount, assetCode, invoiceId }) {
  const xdr = await buildInvoicePayment({ from: payer, to, amount, assetCode, invoiceId });
  const signed = await signWithWallet(xdr, payer);
  return submitSigned(signed);
}

export async function sendPaymentRequest({ from, clientAddress, invoice, publicName }) {
  const to = clientAddress.trim();
  if (!isValidAddress(to)) throw new Error("That doesn't look like a Stellar address. It starts with G and is 56 characters long.");
  if (to === from) throw new Error("That's your own wallet. Enter your client's address.");
  if (!requestMemoFits(invoice.id, invoice.amount, invoice.assetCode)) {
    throw new Error("This amount has too many digits to fit in a request. Use fewer decimal places.");
  }
  const info = await getAccountInfo(to);
  if (!info.exists) throw new Error(`That wallet isn't active on Stellar ${NETWORK.label} yet. Ask your client to add a little XLM first, or send them the pay link instead.`);
  const xdr = await buildPaymentRequest({
    from,
    to,
    invoiceId: invoice.id,
    amount: invoice.amount,
    assetCode: invoice.assetCode,
    publicName,
  });
  const signed = await signWithWallet(xdr, from);
  return submitSigned(signed);
}

export async function enableUsdc(address) {
  const xdr = await buildUsdcTrustline(address);
  const signed = await signWithWallet(xdr, address);
  return submitSigned(signed);
}

export async function payDirect({ from, to, amount, assetCode, note }) {
  const dest = to.trim();
  if (!isValidAddress(dest)) throw new Error("That doesn't look like a Stellar address. It starts with G and is 56 characters long.");
  if (dest === from) throw new Error("That's your own wallet.");
  const info = await getAccountInfo(dest);
  if (!info.exists) throw new Error(`That wallet isn't active on Stellar ${NETWORK.label} yet. Send a claim code instead; it works for any wallet.`);
  if (assetCode === "USDC" && !info.hasUsdcTrustline) throw new Error("That wallet can't receive USDC yet. Send XLM, or a claim code they can redeem once USDC is enabled.");
  const xdr = await buildDirectPayment({ from, to: dest, amount, assetCode, note });
  return submitSigned(await signWithWallet(xdr, from));
}

export async function createClaimCode({ from, amount, assetCode, note, fromName }) {
  const { xdr, secret, publicKey } = await buildClaimCode({ from, amount, assetCode, note, fromName });
  const signed = await signWithWallet(xdr, from);
  const res = await submitSigned(cosignWithCode(signed, secret));
  return { secret, publicKey, hash: res.hash };
}

// Redeeming needs no wallet signature: the code itself signs.
export async function redeemClaimCode({ secret, to }) {
  const { xdr, code } = await buildRedeem({ secret, to });
  const res = await submitSigned(xdr);
  return { hash: res.hash, code };
}

export async function payPro({ from, assetCode, publicName }) {
  const xdr = await buildProPayment({ from, assetCode, publicName });
  return submitSigned(await signWithWallet(xdr, from));
}

export async function getTestUsdc({ address, hasTrustline }) {
  const xdr = await buildTestUsdcSwap({ address, addTrustline: !hasTrustline });
  return submitSigned(await signWithWallet(xdr, address));
}
