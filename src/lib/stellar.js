import {
  Horizon,
  Asset,
  Networks,
  TransactionBuilder,
  Operation,
  Memo,
  BASE_FEE,
  StrKey,
} from "@stellar/stellar-sdk";

// SettleSync runs on Stellar testnet for the pilot. Switching to mainnet means
// changing these three values (and the USDC issuer) in one place.
export const NETWORK = {
  name: "TESTNET",
  passphrase: Networks.TESTNET,
  horizonUrl: "https://horizon-testnet.stellar.org",
  explorerTx: (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  explorerAccount: (a) => `https://stellar.expert/explorer/testnet/account/${a}`,
};

// Circle's testnet USDC issuer (developers.stellar.org, x402 quickstart).
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const horizon = new Horizon.Server(NETWORK.horizonUrl);

export function assetFor(code) {
  return code === "USDC" ? new Asset("USDC", USDC_ISSUER) : Asset.native();
}

export function isValidAddress(a) {
  return typeof a === "string" && StrKey.isValidEd25519PublicKey(a.trim());
}

export function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

// Account summary: does it exist, its XLM / USDC balances, and whether it can hold USDC.
export async function getAccountInfo(address) {
  try {
    const acc = await horizon.loadAccount(address);
    let xlm = "0";
    let usdc = null; // null = no trustline
    for (const b of acc.balances) {
      if (b.asset_type === "native") xlm = b.balance;
      if (b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER) usdc = b.balance;
    }
    return { exists: true, xlm, usdc, hasUsdcTrustline: usdc !== null };
  } catch (e) {
    if (e?.response?.status === 404) {
      return { exists: false, xlm: "0", usdc: null, hasUsdcTrustline: false };
    }
    throw e;
  }
}

// Payment from client to freelancer, carrying the invoice ID in the memo.
// The memo is what lets SettleSync match the payment to the invoice exactly.
export async function buildInvoicePayment({ from, to, amount, assetCode, invoiceId }) {
  const account = await horizon.loadAccount(from);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: to,
        asset: assetFor(assetCode),
        amount: String(amount),
      })
    )
    .addMemo(Memo.text(invoiceId))
    .setTimeout(180)
    .build();
  return tx.toXDR();
}

// One-time setup so an account can hold USDC.
export async function buildUsdcTrustline(address) {
  const account = await horizon.loadAccount(address);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: assetFor("USDC") }))
    .setTimeout(180)
    .build();
  return tx.toXDR();
}

export async function submitSigned(signedXdr) {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase);
  try {
    return await horizon.submitTransaction(tx);
  } catch (e) {
    const codes = e?.response?.data?.extras?.result_codes;
    throw new Error(explainResultCodes(codes) || e.message || "The network rejected the payment.");
  }
}

function explainResultCodes(codes) {
  if (!codes) return null;
  const op = codes.operations?.[0];
  const map = {
    op_underfunded: "Not enough balance to pay this invoice.",
    op_no_trust: "The receiving wallet hasn't enabled USDC yet.",
    op_src_no_trust: "Your wallet hasn't enabled USDC yet.",
    op_no_destination: "The receiving wallet doesn't exist on testnet yet.",
    op_line_full: "The receiving wallet can't accept this much USDC.",
  };
  if (op && map[op]) return map[op];
  if (codes.transaction === "tx_insufficient_balance") return "Not enough XLM to cover the network fee.";
  if (codes.transaction === "tx_bad_seq") return "Your wallet sent another transaction at the same time. Try again.";
  return `Payment failed (${[codes.transaction, op].filter(Boolean).join(", ")}).`;
}

// Recent incoming payments with their transaction memo, newest first.
export async function getIncomingPayments(address, limit = 200) {
  const page = await horizon
    .payments()
    .forAccount(address)
    .order("desc")
    .limit(limit)
    .join("transactions")
    .call();
  return page.records
    .filter((r) => r.type === "payment" && r.to === address)
    .map((r) => ({
      id: r.id,
      hash: r.transaction_hash,
      from: r.from,
      amount: r.amount,
      assetCode: r.asset_type === "native" ? "XLM" : r.asset_code,
      assetIssuer: r.asset_issuer || null,
      memo: r.transaction_attr?.memo_type === "text" ? r.transaction_attr.memo : null,
      createdAt: r.created_at,
    }));
}
