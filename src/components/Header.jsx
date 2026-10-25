import { useEffect, useRef, useState } from "react";
import { useApp, go, ROLES } from "../lib/app";
import { shortAddr, NETWORK } from "../lib/stellar";
import { MenuIcon, CloseIcon, SunIcon, MoonIcon, WalletIcon, GithubIcon, CopyIcon } from "./Icons";
import { useCopy } from "./bits";

const REPO = "https://github.com/Rohanmd13/settlesync";

export function Avatar({ name, address, size = 34 }) {
  const letter = (name || "").trim()[0]?.toUpperCase() || "₹";
  // A stable colour per wallet, from the address.
  const hue = address ? [...address].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7) : 0;
  return (
    <span className="avatar" style={{ width: size, height: size, "--h": hue }} aria-hidden="true">{letter}</span>
  );
}

export default function Header() {
  const { route, theme, toggleTheme, address, connect, disconnect, profile } = useApp();
  const [open, setOpen] = useState(false);
  const [acct, setAcct] = useState(false);
  const [err, setErr] = useState("");
  const [copied, copy] = useCopy();
  const acctRef = useRef(null);

  useEffect(() => {
    setOpen(false);
    setAcct(false);
  }, [route]);
  useEffect(() => {
    document.body.classList.toggle("no-scroll", open);
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAcct(false);
      }
    };
    const onClick = (e) => acct && acctRef.current && !acctRef.current.contains(e.target) && setAcct(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open, acct]);

  const onConnect = async () => {
    setErr("");
    try {
      await connect();
      if (!route.startsWith("/dashboard") && !route.startsWith("/pay") && !route.startsWith("/claim")) go("/dashboard");
    } catch (e) {
      if (!/closed|cancel/i.test(e.message)) setErr(e.message);
    }
  };

  const switchWallet = async () => {
    setAcct(false);
    setOpen(false);
    await disconnect();
    onConnect();
  };

  const at = (p) => (p === "/" ? route === "/" : route.startsWith(p));
  const NavLink = ({ to, children }) => (
    <a href={`#${to}`} className={`nav__link ${at(to) ? "is-active" : ""}`} aria-current={at(to) ? "page" : undefined}>
      {children}
    </a>
  );
  const displayName = profile.name || shortAddr(address);
  const roleLabel = ROLES[profile.role]?.label;

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand" aria-label="SettleSync home">
          <span className="brand__mark" aria-hidden="true" />
          <span>SettleSync</span>
        </a>

        <nav className="nav" aria-label="Main">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/why">Why us</NavLink>
          <NavLink to="/how">How it works</NavLink>
          <NavLink to="/plans">Plans</NavLink>
          <NavLink to="/faq">Questions</NavLink>
        </nav>

        <div className="topbar__tools">
          <button className="icon-btn topbar__theme" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          {address ? (
            <>
              {!route.startsWith("/dashboard") && (
                <a href="#/dashboard" className="btn btn--primary btn--sm topbar__dash">Dashboard</a>
              )}
              <div className="acct" ref={acctRef}>
                <button className="acct__btn" onClick={() => setAcct((a) => !a)} aria-expanded={acct} aria-haspopup="menu" title={address}>
                  <Avatar name={profile.name} address={address} size={28} />
                  <span className="acct__who">
                    <b>{displayName}</b>
                    {roleLabel && <small>{roleLabel}</small>}
                  </span>
                </button>
                {acct && (
                  <div className="acct__menu" role="menu">
                    <div className="acct__head">
                      <Avatar name={profile.name} address={address} size={40} />
                      <div>
                        <b>{profile.name || "Unnamed wallet"}</b>
                        <small>{roleLabel || "Role not chosen"}</small>
                      </div>
                    </div>
                    <button className="acct__addr" onClick={() => copy(address, "addr")} role="menuitem">
                      <span>{shortAddr(address)}</span>
                      <span className="acct__copy"><CopyIcon /> {copied === "addr" ? "Copied" : "Copy address"}</span>
                    </button>
                    <a href="#/dashboard" role="menuitem">Dashboard</a>
                    <a href="#/account" role="menuitem">Profile, currency and backup</a>
                    <a href={NETWORK.explorerAccount(address)} target="_blank" rel="noreferrer" role="menuitem">View on Stellar explorer</a>
                    <button onClick={switchWallet} role="menuitem">Switch wallet</button>
                    <button onClick={() => { disconnect(); go("/"); }} role="menuitem" className="acct__out">Disconnect</button>
                  </div>
                )}
              </div>
            </>
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
            <div className="drawer__who">
              <Avatar name={profile.name} address={address} size={44} />
              <div>
                <b>{profile.name || "Unnamed wallet"}</b>
                <small>{roleLabel || "Role not chosen"} · {shortAddr(address)}</small>
              </div>
            </div>
          ) : (
            <>
              <p className="drawer__label">Not connected</p>
              <button className="btn btn--primary btn--wide" onClick={onConnect}><WalletIcon /> Connect wallet</button>
            </>
          )}
        </div>

        <nav className="drawer__nav" aria-label="Site">
          <p className="drawer__group">Get paid</p>
          <a href="#/dashboard/invoices">Invoices</a>
          <a href="#/dashboard/redeem">Redeem a claim code</a>
          <p className="drawer__group">Pay others</p>
          <a href="#/dashboard/bills">Bills to pay</a>
          <a href="#/dashboard/send">Send money or a claim code</a>
          <p className="drawer__group">Records and account</p>
          <a href="#/dashboard/history">Payment history</a>
          <a href="#/account">Profile, currency and backup</a>
          <p className="drawer__group">About SettleSync</p>
          <a href="#/">Home</a>
          <a href="#/why">Why SettleSync</a>
          <a href="#/how">How it works</a>
          <a href="#/stellar">Under the hood</a>
          <a href="#/plans">Plans</a>
          <a href="#/faq">Questions</a>
        </nav>

        <div className="drawer__foot">
          <button className="drawer__theme" onClick={toggleTheme}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />} {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <a href={REPO} target="_blank" rel="noreferrer" className="drawer__theme"><GithubIcon /> Source code</a>
          {address && (
            <div className="drawer__row">
              <button className="btn btn--ghost btn--sm" onClick={switchWallet}>Switch wallet</button>
              <button className="btn btn--ghost btn--sm" onClick={() => { disconnect(); go("/"); }}>Disconnect</button>
            </div>
          )}
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
          <p className="footer__note">USDC invoicing for freelancers and the people who pay them. Built in India, for everywhere. Non-custodial: money goes straight from wallet to wallet.</p>
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
      <p className="footer__legal">Testnet pilot: no real funds move. Currency figures are for record keeping, not tax advice. <a href="#/owner" className="footer__owner">Team</a></p>
    </footer>
  );
}
