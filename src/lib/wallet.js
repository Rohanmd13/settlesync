import {
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
} from "@stellar/freighter-api";
import { NETWORK } from "./stellar";

export class WalletError extends Error {}

export async function freighterInstalled() {
  try {
    const r = await isConnected();
    return !!r.isConnected;
  } catch {
    return false;
  }
}

// Returns the address if this site was already allowed, without a popup.
export async function getConnectedAddress() {
  if (!(await freighterInstalled())) return null;
  const { address, error } = await getAddress();
  if (error || !address) return null;
  return address;
}

export async function connectWallet() {
  if (!(await freighterInstalled())) {
    throw new WalletError("Freighter isn't installed. Add it from freighter.app, then reload this page.");
  }
  const { address, error } = await requestAccess();
  if (error) throw new WalletError(error.message || "Freighter didn't share your address.");
  return address;
}

export async function checkNetwork() {
  const { networkPassphrase, error } = await getNetwork();
  if (error) return { ok: false, message: "Couldn't read Freighter's network." };
  if (networkPassphrase !== NETWORK.passphrase) {
    return { ok: false, message: "Freighter is on the wrong network. Open Freighter → Settings → Network and choose Testnet." };
  }
  return { ok: true };
}

export async function signWithWallet(xdr, address) {
  const net = await checkNetwork();
  if (!net.ok) throw new WalletError(net.message);
  const { signedTxXdr, error } = await signTransaction(xdr, {
    networkPassphrase: NETWORK.passphrase,
    address,
  });
  if (error) throw new WalletError(error.message || "The transaction wasn't signed.");
  return signedTxXdr;
}
