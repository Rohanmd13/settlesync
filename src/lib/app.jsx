// App-wide state: theme, connected wallet, the user's role/profile, and routing.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { initWallets, setWalletTheme, connectWallet, restoreAddress, disconnectWallet, onWalletChange } from "./wallet";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// ---------- routing (hash based: works on any static host) ----------
function readRoute() {
  return window.location.hash.replace(/^#/, "") || "/";
}
export function go(path) {
  if (readRoute() === path) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = path;
}

// ---------- theme ----------
const THEME_KEY = "settlesync:theme";
function systemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}
function initialTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch { /* ignore */ }
  return systemPrefersDark() ? "dark" : "light";
}

// ---------- profile ----------
const PROFILE_KEY = (addr) => `settlesync:profile:${addr}`;
export const ROLES = {
  freelancer: { label: "Freelancer", blurb: "I get paid for my work by clients, DAOs and grant programs." },
  business: { label: "Business or agency", blurb: "We invoice clients as a team and need GSTIN on invoices." },
  client: { label: "Client or company", blurb: "I pay freelancers and vendors and want every bill in one place." },
};
function loadProfile(addr) {
  if (!addr) return {};
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY(addr)) || "{}");
  } catch {
    return {};
  }
}

export function AppProvider({ children }) {
  const [route, setRoute] = useState(readRoute);
  const [theme, setTheme] = useState(initialTheme);
  const [address, setAddress] = useState(null);
  const [walletReady, setWalletReady] = useState(false);
  const [profile, setProfile] = useState({});

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setWalletTheme(theme);
  }, [theme]);

  useEffect(() => {
    initWallets(initialTheme());
    restoreAddress().then((a) => {
      setAddress(a);
      setWalletReady(true);
    });
    return onWalletChange((a) => setAddress(a));
  }, []);

  useEffect(() => setProfile(loadProfile(address)), [address]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const connect = useCallback(async () => {
    const a = await connectWallet();
    setAddress(a);
    return a;
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setAddress(null);
  }, []);

  const updateProfile = useCallback(
    (patch) => {
      setProfile((p) => {
        const next = { ...p, ...patch };
        if (address) {
          try { localStorage.setItem(PROFILE_KEY(address), JSON.stringify(next)); } catch { /* ignore */ }
        }
        return next;
      });
    },
    [address]
  );

  const value = useMemo(
    () => ({ route, theme, toggleTheme, address, walletReady, connect, disconnect, profile, updateProfile }),
    [route, theme, toggleTheme, address, walletReady, connect, disconnect, profile, updateProfile]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
