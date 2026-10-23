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
// changing these values (and the USDC issuer) in one place.
export const NETWORK = {
  name: "TESTNET",
  passphrase: Networks.TESTNET,
  horizonUrl: "https://horizon-testnet.stellar.org",
  explorerTx: (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  explorerAccount: (a) => `https://stellar.expert/explorer/testnet/account/${a}`,
};

// Circle's testnet USDC issuer (developers.stellar.org, x402 quickstart).
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// Smallest possible XLM amount. A payment request is a 0.0000001 XLM
// transfer to the client whose memo carries the invoice ID and amount.
export const REQUEST_NUDGE = "0.0000001";
export const PROFILE_DATA_KEY = "ss.name";

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

// ---------- request memos ----------
// Format: R:<invoiceId>:<amount>:<U|X>   (must fit Stellar's 28-byte text memo)
export function requestMemo(invoiceId, amount, assetCode) {
  return `R:${invoiceId}:${amount}:${assetCode === "USDC" ? "U" : "X"}`;
}

export function parseRequestMemo(memo) {
  if (!memo || !memo.startsWith("R:")) return null;
  const [, invoiceId, amount, a] = memo.split(":");
  if (!invoiceId || !amount || !a) return null;
  return { invoiceId, amount, assetCode: a === "U" ? "USDC" : "XLM" };
}

export function requestMemoFits(invoiceId, amount, assetCode) {
  return new TextEncoder().encode(requestMemo(invoiceId, amount, assetCode)).length <= 28;
}

// ---------- accounts ----------
export async function getAccountInfo(address) {
  try {
    const acc = await horizon.loadAccount(address);
    let xlm = "0";
    let usdc = null; // null = no trustline
    for (const b of acc.balances) {
      if (b.asset_type === "native") xlm = b.balance;
      if (b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER) usdc = b.balance;
    }
    const nameB64 = acc.data_attr?.[PROFILE_DATA_KEY];
    return {
      exists: true,
      xlm,
      usdc,
      hasUsdcTrustline: usdc !== null,
      publicName: nameB64 ? decodeB64(nameB64) : null,
    };
  } catch (e) {
    if (e?.response?.status === 404) {
      return { exists: false, xlm: "0", usdc: null, hasUsdcTrustline: false, publicName: null };
    }
    throw e;
  }
}

function decodeB64(b64) {
  try {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

const nameCache = new Map();
export async function getPublicName(address) {
  if (nameCache.has(address)) return nameCache.get(address);
  try {
    const info = await getAccountInfo(address);
    nameCache.set(address, info.publicName);
    return info.publicName;
  } catch {
    return null;
  }
}

// ---------- transactions ----------
async function builder(from) {
  const account = await horizon.loadAccount(from);
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase });
}

// Client pays freelancer; the invoice ID rides in the memo for exact matching.
export async function buildInvoicePayment({ from, to, amount, assetCode, invoiceId }) {
  const tb = await builder(from);
  return tb
    .addOperation(Operation.payment({ destination: to, asset: assetFor(assetCode), amount: String(amount) }))
    .addMemo(Memo.text(invoiceId))
    .setTimeout(180)
    .build()
    .toXDR();
}

// Freelancer sends a payment request straight to the client's wallet.
// Optionally publishes the freelancer's display name on their own account
// (manageData) so the client sees who is asking.
export async function buildPaymentRequest({ from, to, invoiceId, amount, assetCode, publicName }) {
  const tb = await builder(from);
  tb.addOperation(Operation.payment({ destination: to, asset: Asset.native(), amount: REQUEST_NUDGE }));
  if (publicName) {
    tb.addOperation(Operation.manageData({ name: PROFILE_DATA_KEY, value: publicName.slice(0, 60) }));
  }
  return tb.addMemo(Memo.text(requestMemo(invoiceId, amount, assetCode))).setTimeout(180).build().toXDR();
}

export async function buildUsdcTrustline(address) {
  const tb = await builder(address);
  return tb.addOperation(Operation.changeTrust({ asset: assetFor("USDC") })).setTimeout(180).build().toXDR();
}

export async function submitSigned(signedXdr) {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase);
  try {
    return await horizon.submitTransaction(tx);
  } catch (e) {
    const codes = e?.response?.data?.extras?.result_codes;
    throw new Error(explainResultCodes(codes) || e.message || "The network rejected the transaction.");
  }
}

function explainResultCodes(codes) {
  if (!codes) return null;
  const op = (codes.operations || []).find((c) => c !== "op_success");
  const map = {
    op_underfunded: "Not enough balance for this payment.",
    op_no_trust: "The receiving wallet hasn't enabled USDC yet.",
    op_src_no_trust: "Your wallet hasn't enabled USDC yet.",
    op_no_destination: "That wallet isn't active on Stellar testnet yet. It needs a little XLM first.",
    op_line_full: "The receiving wallet can't accept this much USDC.",
    op_low_reserve: "Your wallet needs a bit more XLM to cover Stellar's minimum balance.",
  };
  if (op && map[op]) return map[op];
  if (codes.transaction === "tx_insufficient_balance") return "Not enough XLM to cover the network fee.";
  if (codes.transaction === "tx_bad_seq") return "Your wallet sent another transaction at the same time. Try again.";
  return `Transaction failed (${[codes.transaction, op].filter(Boolean).join(", ")}).`;
}

// ---------- reading payments ----------
// All payments touching this account, newest first, with memo and direction.
export async function getAccountPayments(address, limit = 200) {
  const page = await horizon
    .payments()
    .forAccount(address)
    .order("desc")
    .limit(limit)
    .join("transactions")
    .call();
  return page.records
    .filter((r) => r.type === "payment" || r.type === "create_account")
    .map((r) => {
      const isCreate = r.type === "create_account";
      const to = isCreate ? r.account : r.to;
      const from = isCreate ? r.funder : r.from;
      return {
        id: r.id,
        hash: r.transaction_hash,
        from,
        to,
        direction: to === address ? "in" : "out",
        amount: isCreate ? r.starting_balance : r.amount,
        assetCode: isCreate || r.asset_type === "native" ? "XLM" : r.asset_code,
        memo: r.transaction_attr?.memo_type === "text" ? r.transaction_attr.memo : null,
        createdAt: r.created_at,
      };
    });
}

export async function getIncomingPayments(address, limit = 200) {
  return (await getAccountPayments(address, limit)).filter((p) => p.direction === "in");
}

export async function getLatestLedger() {
  const page = await horizon.ledgers().order("desc").limit(1).call();
  const l = page.records[0];
  return { sequence: l.sequence, closedAt: l.closed_at };
}

export async function fundWithFriendbot(address) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
  if (!r.ok) throw new Error("Friendbot didn't respond. Try again in a minute.");
}
