import {
  Horizon,
  Asset,
  Networks,
  TransactionBuilder,
  Operation,
  Memo,
  BASE_FEE,
  StrKey,
  Keypair,
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

// SettleSync's own treasury wallet: receives Pro subscriptions (testnet).
export const TREASURY = "GBVWXQHFINYU67NT2OATHHHNZTPVXN5VE5TPHVY65M3LQ5JHDIOY32C7";
export const PRO_PRICE = { USDC: "3", XLM: "30" };

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


// ---------- direct payments ----------
// Client pays someone without an invoice; an optional note rides in the memo.
export async function buildDirectPayment({ from, to, amount, assetCode, note }) {
  const tb = await builder(from);
  tb.addOperation(Operation.payment({ destination: to, asset: assetFor(assetCode), amount: String(amount) }));
  const memo = (note || "").trim();
  if (memo) tb.addMemo(Memo.text(clipBytes(memo, 28)));
  return tb.setTimeout(180).build().toXDR();
}

export function clipBytes(str, max) {
  const enc = new TextEncoder();
  let out = "";
  for (const ch of str) {
    if (enc.encode(out + ch).length > max) break;
    out += ch;
  }
  return out;
}

// ---------- claim codes ----------
// The payer locks money in a fresh one-time Stellar account. The "code" is that
// account's secret key. Whoever redeems it moves the money to their own wallet,
// and the small XLM deposit that kept the account open goes back to the payer.
const CODE_KEYS = { from: "ss.from", amt: "ss.amt", name: "ss.name", note: "ss.note" };

export function codeId(publicKey) {
  return publicKey.slice(1, 9);
}

export async function buildClaimCode({ from, amount, assetCode, note, fromName }) {
  const eph = Keypair.random();
  const e = eph.publicKey();
  const entries = 2 + (fromName ? 1 : 0) + (note ? 1 : 0);
  const reserve = 1 + entries * 0.5 + (assetCode === "USDC" ? 0.5 : 0) + 0.5; // base + entries + trustline + fee buffer
  const starting = assetCode === "XLM" ? (Number(amount) + reserve).toFixed(7) : reserve.toFixed(7);
  const tb = await builder(from);
  tb.addOperation(Operation.createAccount({ destination: e, startingBalance: starting }));
  tb.addOperation(Operation.manageData({ name: CODE_KEYS.from, value: from, source: e }));
  tb.addOperation(Operation.manageData({ name: CODE_KEYS.amt, value: `${amount} ${assetCode}`, source: e }));
  if (fromName) tb.addOperation(Operation.manageData({ name: CODE_KEYS.name, value: clipBytes(fromName, 60), source: e }));
  if (note) tb.addOperation(Operation.manageData({ name: CODE_KEYS.note, value: clipBytes(note, 60), source: e }));
  if (assetCode === "USDC") {
    tb.addOperation(Operation.changeTrust({ asset: assetFor("USDC"), source: e }));
    tb.addOperation(Operation.payment({ destination: e, asset: assetFor("USDC"), amount: String(amount) }));
  }
  const xdr = tb.addMemo(Memo.text(`C:${codeId(e)}`)).setTimeout(180).build().toXDR();
  return { xdr, secret: eph.secret(), publicKey: e };
}

// Adds the one-time account's signature after the payer's wallet has signed.
export function cosignWithCode(signedXdr, secret) {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase);
  tx.sign(Keypair.fromSecret(secret));
  return tx.toXDR();
}

export function isCodeSecret(s) {
  return typeof s === "string" && StrKey.isValidEd25519SecretSeed(s.trim());
}

// What a code holds, read straight from Stellar. null = already redeemed or invalid.
export async function readClaimCode(secret) {
  const pub = Keypair.fromSecret(secret.trim()).publicKey();
  let acc;
  try {
    acc = await horizon.loadAccount(pub);
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
  const d = (k) => (acc.data_attr?.[k] ? decodeB64(acc.data_attr[k]) : null);
  const [amount, assetCode] = (d(CODE_KEYS.amt) || "").split(" ");
  return {
    publicKey: pub,
    id: codeId(pub),
    from: d(CODE_KEYS.from),
    fromName: d(CODE_KEYS.name),
    note: d(CODE_KEYS.note),
    amount,
    assetCode,
  };
}

export async function buildRedeem({ secret, to }) {
  const code = await readClaimCode(secret);
  if (!code) throw new Error("This code has already been redeemed, or it isn't a SettleSync code.");
  const eph = Keypair.fromSecret(secret.trim());
  const acc = await horizon.loadAccount(code.publicKey);
  const tb = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase });
  tb.addOperation(Operation.payment({ destination: to, asset: assetFor(code.assetCode), amount: code.amount }));
  if (code.assetCode === "USDC") tb.addOperation(Operation.changeTrust({ asset: assetFor("USDC"), limit: "0" }));
  for (const k of Object.values(CODE_KEYS)) if (acc.data_attr?.[k]) tb.addOperation(Operation.manageData({ name: k, value: null }));
  tb.addOperation(Operation.accountMerge({ destination: code.from || to }));
  tb.addMemo(Memo.text(`K:${code.id}`));
  const tx = tb.setTimeout(180).build();
  tx.sign(eph);
  return { xdr: tx.toXDR(), code };
}

// ---------- Pro subscription ----------
export async function buildProPayment({ from, assetCode, publicName }) {
  const tb = await builder(from);
  if (publicName) tb.addOperation(Operation.manageData({ name: PROFILE_DATA_KEY, value: clipBytes(publicName, 60) }));
  return tb
    .addOperation(Operation.payment({ destination: TREASURY, asset: assetFor(assetCode), amount: PRO_PRICE[assetCode] }))
    .addMemo(Memo.text("PRO:1M"))
    .setTimeout(180)
    .build()
    .toXDR();
}

export function proStatus(payments, me) {
  const last = payments
    .filter((p) => p.direction === "out" && p.from === me && p.to === TREASURY && (p.memo || "").startsWith("PRO"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!last) return { active: false };
  const until = new Date(new Date(last.createdAt).getTime() + 30 * 864e5);
  return { active: until > new Date(), until: until.toISOString(), since: last.createdAt };
}

// Testnet only: swap test XLM for test USDC on Stellar's built-in exchange,
// so anyone can try USDC invoices without hunting for a faucet.
export async function buildTestUsdcSwap({ address, xlm = "100", addTrustline = false }) {
  const tb = await builder(address);
  if (addTrustline) tb.addOperation(Operation.changeTrust({ asset: assetFor("USDC") }));
  tb.addOperation(
    Operation.pathPaymentStrictSend({
      sendAsset: Asset.native(),
      sendAmount: xlm,
      destination: address,
      destAsset: assetFor("USDC"),
      destMin: "0.0000001",
    })
  );
  return tb.setTimeout(180).build().toXDR();
}
