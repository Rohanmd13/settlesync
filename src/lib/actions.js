// Wallet-signed actions shared across pages.
import {
  buildInvoicePayment,
  buildPaymentRequest,
  buildUsdcTrustline,
  submitSigned,
  getAccountInfo,
  isValidAddress,
  requestMemoFits,
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
  if (!info.exists) throw new Error("That wallet isn't active on Stellar testnet yet. Ask your client to fund it first, or send them the pay link instead.");
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
