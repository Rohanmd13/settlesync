import { useEffect, useState } from "react";
import { useApp, go, ROLES } from "../lib/app";
import { shortAddr, NETWORK } from "../lib/stellar";
import { MenuIcon, CloseIcon, SunIcon, MoonIcon, WalletIcon, GithubIcon } from "./Icons";
import { useCopy } from "./bits";

const REPO = "https://github.com/Rohanmd13/settlesync";

export default function Header() {
  const { route, theme, toggleTheme, address, connect, disconnect, profile } = useApp();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [copied, copy] = useCopy();

  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    document.body.classList.toggle("no-scroll", open);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onConnect = async () => {
    setErr("");
    try {
      await connect();
      if (!route.startsWith("/dashboard") && !route.startsWith("/pay")) go("/dashboard");
    } catch (e) {
      if (!/closed|cancel/i.test(e.message)) setErr(e.message);
    }
  };

  const at = (p) => (p === "/" ? route === "/" : route.startsWith(p));
  const NavLink = ({ to, children }) => (
    <a href={`#${to}`} className={`nav__link ${at(to) ? "is-active" : ""}`} aria-current={at(to) ? "page" : undefined}>
      {children}
    </a>
  );

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand" aria-label="SettleSync home">
          <span className="brand__mark" aria-hidden="true" />
          <span>SettleSync</span>
        </a>

        <nav className="nav" aria-label="Main">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/how">How it works</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/dashboard/history">History</NavLink>
        </nav>

        <div className="topbar__tools">
          <button className="icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          {address ? (
            <a href="#/dashboard" className="wallet-chip" title={address}>
              <span className="wallet-chip__dot" aria-hidden="true" />
              {shortAddr(address)}
            </a>
          ) : (
            <button className="btn btn--primary btn--sm topbar__connect" onClick={onConnect}>
              <WalletIcon /> Connect wallet
            </button>
          )}
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="site-menu">
            <MenuIcon />
          </button>
        </div>
      </header>
      {err && <p className="alert alert--error topbar__err" role="alert">{err}</p>}

      <div className={`drawer-scrim ${open ? "is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="site-menu" className={`drawer ${open ? "is-open" : ""}`} aria-label="Menu" aria-hidden={!open} inert={!open}>
        <div className="drawer__head">
          <span className="brand"><span className="brand__mark" aria-hidden="true" />SettleSync</span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close menu"><CloseIcon /></button>
        </div>

        <div className="drawer__wallet">
          {address ? (
            <>
              <p className="drawer__label">Connected wallet</p>
              <p className="drawer__addr">{shortAddr(address)}</p>
              <p className="drawer__role">{ROLES[profile.role]?.label || "Role not chosen yet"}</p>
              <div className="drawer__row">
                <button className="btn btn--ghost btn--sm" onClick={() => copy(address, "addr")}>
                  {copied === "addr" ? "Copied" : "Copy address"}
                </button>
                <a className="btn btn--ghost btn--sm" href={NETWORK.explorerAccount(address)} target="_blank" rel="noreferrer">View on explorer</a>
              </div>
            </>
          ) : (
            <>
              <p className="drawer__label">Not connected</p>
              <button className="btn btn--primary btn--wide" onClick={onConnect}><WalletIcon /> Connect wallet</button>
            </>
          )}
        </div>

        <nav className="drawer__nav" aria-label="Site">
          <p className="drawer__group">Explore</p>
          <a href="#/">Home</a>
          <a href="#/how">How it works</a>
          <a href="#/who">Who it's for</a>
          <a href="#/stellar">Under the hood</a>
          <a href="#/faq">Questions</a>
          <p className="drawer__group">Your money</p>
          <a href="#/dashboard/invoices">Invoices</a>
          <a href="#/dashboard/bills">Bills to pay</a>
          <a href="#/dashboard/history">History</a>
          <a href="#/dashboard/settings">Profile and backup</a>
          <a href="#/plans">Plans</a>
        </nav>

        <div className="drawer__foot">
          <button className="drawer__theme" onClick={toggleTheme}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />} {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <a href={REPO} target="_blank" rel="noreferrer" className="drawer__theme"><GithubIcon /> Source code</a>
          {address && <button className="linkish" onClick={() => { disconnect(); setOpen(false); go("/"); }}>Disconnect wallet</button>}
        </div>
      </aside>
    </>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div>
          <p className="brand"><span className="brand__mark" aria-hidden="true" />SettleSync</p>
          <p className="footer__note">USDC invoicing for India's freelancers and builders. Non-custodial: payments go straight from your client's wallet to yours.</p>
        </div>
        <nav className="footer__links" aria-label="Footer">
          <a href="#/how">How it works</a>
          <a href="#/dashboard">Dashboard</a>
          <a href="#/plans">Plans</a>
          <a href="#/faq">Questions</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://stellar.org" target="_blank" rel="noreferrer">Built on Stellar</a>
        </nav>
      </div>
      <p className="footer__legal">Testnet pilot: no real funds move. INR figures are for record keeping, not tax advice.</p>
    </footer>
  );
}
