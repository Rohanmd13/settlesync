// Multi-wallet support through Stellar Wallets Kit (Freighter, xBull, Albedo,
// LOBSTR, Hana, Rabet, …). The kit remembers the chosen wallet in this browser.
import {
  StellarWalletsKit,
  Networks,
  KitEventType,
  SwkAppLightTheme,
  SwkAppDarkTheme,
} from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { NETWORK } from "./stellar";

let initialised = false;

function kitTheme(mode) {
  const base = mode === "dark" ? SwkAppDarkTheme : SwkAppLightTheme;
  return {
    ...base,
    primary: mode === "dark" ? "#e2474d" : "#a3161c",
    "primary-foreground": "#ffffff",
    "border-radius": "10px",
    "font-family": '"Archivo", system-ui, sans-serif',
  };
}

export function initWallets(mode = "light") {
  if (initialised) return;
  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
    theme: kitTheme(mode),
    authModal: { showInstallLabel: true },
  });
  initialised = true;
}

export function setWalletTheme(mode) {
  if (!initialised) return;
  try {
    StellarWalletsKit.setTheme(kitTheme(mode));
  } catch {
    /* cosmetic only */
  }
}

function message(e, fallback) {
  if (!e) return fallback;
  if (typeof e === "string") return e;
  return e.message || e.error?.message || fallback;
}

export async function connectWallet() {
  try {
    const { address } = await StellarWalletsKit.authModal();
    if (!address) throw new Error("No address was shared.");
    return address;
  } catch (e) {
    throw new Error(message(e, "The wallet didn't connect."));
  }
}

export async function restoreAddress() {
  try {
    const { address } = await StellarWalletsKit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export async function disconnectWallet() {
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    /* already disconnected */
  }
}

export function onWalletChange(cb) {
  const offs = [
    StellarWalletsKit.on(KitEventType.STATE_UPDATED, (e) => cb(e.payload?.address || null)),
    StellarWalletsKit.on(KitEventType.DISCONNECT, () => cb(null)),
  ];
  return () => offs.forEach((off) => typeof off === "function" && off());
}

export async function checkNetwork() {
  try {
    const { networkPassphrase } = await StellarWalletsKit.getNetwork();
    if (networkPassphrase && networkPassphrase !== NETWORK.passphrase) {
      return { ok: false, message: "Your wallet is on the wrong network. Switch it to Testnet in the wallet's settings." };
    }
  } catch {
    /* some wallets (e.g. Albedo) don't report a network; signing still targets testnet */
  }
  return { ok: true };
}

export async function signWithWallet(xdr, address) {
  const net = await checkNetwork();
  if (!net.ok) throw new Error(net.message);
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: NETWORK.passphrase,
      address,
    });
    if (!signedTxXdr) throw new Error("The transaction wasn't signed.");
    return signedTxXdr;
  } catch (e) {
    throw new Error(message(e, "The transaction wasn't signed."));
  }
}
