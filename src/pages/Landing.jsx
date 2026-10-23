import { useEffect, useState } from "react";
import HeroFlow from "../components/HeroFlow";
import { Reveal, LivePill } from "../components/bits";
import { useApp, go, ROLES } from "../lib/app";

const SECTION_FOR_ROUTE = { "/how": "how", "/who": "who", "/stellar": "stellar", "/faq": "faq" };

export default function Landing() {
  const { route, address } = useApp();
  const [flow, setFlow] = useState("link");

  useEffect(() => {
    const id = SECTION_FOR_ROUTE[route];
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [route]);

  const pickRole = (role) => {
    try { sessionStorage.setItem("settlesync:pending-role", role); } catch { /* ignore */ }
    go(role === "client" ? "/dashboard/bills" : "/dashboard/invoices");
  };

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__copy">
          <LivePill />
          <h1 className="hero__title">
            <span>Get paid in USDC.</span>
            <span>Know which invoice</span>
            <span>it was for.</span>
          </h1>
          <p className="lede">
            SettleSync is invoicing for India's freelancers, studios and builders who get paid in USDC on Stellar.
            Every payment carries its invoice number, lands straight in your wallet, and marks the invoice paid by
            itself. At tax time, one export gives your CA every payment with its INR value.
          </p>
          <div className="hero__cta">
            <button className="btn btn--primary btn--lg" onClick={() => go("/dashboard")}>
              {address ? "Go to dashboard" : "Get started free"}
            </button>
            <a href="#/how" className="btn btn--ghost btn--lg">See how it works</a>
          </div>
          <p className="hero__fine">Works with Freighter, xBull, Albedo, LOBSTR and more. We never hold your money.</p>
        </div>
        <div className="hero__visual">
          <HeroFlow />
        </div>
      </section>

      <section className="band">
        <div className="band__inner">
          <Reveal as="h2">Where USDC payments get lost</Reveal>
          <div className="pains">
            <Reveal delay={0}>
              <h3>"Which invoice was this?"</h3>
              <p>A DAO sends you 1,200 USDC. Your wallet shows a number and an address, and nothing about the work it paid for.</p>
            </Reveal>
            <Reveal delay={90}>
              <h3>Late and partial payments</h3>
              <p>One client pays half, another pays three weeks late. You chase them with screenshots from a block explorer.</p>
            </Reveal>
            <Reveal delay={180}>
              <h3>March, with your CA</h3>
              <p>They need every payment with its INR value on the day it arrived. You rebuild a year of it by hand.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section__head">
          <h2>How it works</h2>
          <div className="seg" role="tablist" aria-label="Two ways to get paid">
            <button role="tab" aria-selected={flow === "link"} className={flow === "link" ? "is-on" : ""} onClick={() => setFlow("link")}>Send a pay link</button>
            <button role="tab" aria-selected={flow === "wallet"} className={flow === "wallet" ? "is-on" : ""} onClick={() => setFlow("wallet")}>Request from their wallet</button>
          </div>
        </div>
        <ol className="steps" key={flow}>
          {(flow === "link" ? LINK_STEPS : WALLET_STEPS).map((s, i) => (
            <li key={s.title} style={{ "--i": i }}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="section__note">
          {flow === "link"
            ? "Best when your client is new to Stellar: the link works on WhatsApp, email or Telegram, and they don't need a SettleSync account."
            : "Best for regular clients: no link to forward. The request is delivered on Stellar itself, so it shows up wherever they open SettleSync."}
        </p>
      </section>

      <section className="section" id="who">
        <h2>Who it's for</h2>
        <p className="section__lede">Pick what fits you. Your dashboard arranges itself around it, and you can switch any time.</p>
        <div className="roles">
          {Object.entries(ROLES).map(([key, r], i) => (
            <Reveal key={key} delay={i * 80} as="button" className={`role role--${key}`} onClick={() => pickRole(key)}>
              <span className="role__glyph" aria-hidden="true">{key === "freelancer" ? "₹" : key === "business" ? "§" : "✓"}</span>
              <h3>{r.label}</h3>
              <p>{r.blurb}</p>
              <span className="role__cta">{key === "client" ? "See bills to pay" : "Start invoicing"}</span>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section" id="stellar">
        <h2>Under the hood</h2>
        <p className="section__lede">No database of your money and no middleman. Everything that matters is on Stellar, where anyone can verify it.</p>
        <div className="arch">
          <div className="arch__flow" aria-label="Payment flow">
            <div className="arch__node"><b>Invoice</b><small>SS-K7QM4X, 1,200 USDC</small></div>
            <div className="arch__edge"><span>memo</span></div>
            <div className="arch__node arch__node--chain"><b>Stellar payment</b><small>settles in ~5 s, fee &lt; ₹0.01</small></div>
            <div className="arch__edge"><span>Horizon</span></div>
            <div className="arch__node"><b>Matched</b><small>invoice marks itself paid</small></div>
          </div>
          <dl className="arch__parts">
            <div><dt>Memo matching</dt><dd>Every Stellar payment can carry a short text memo. SettleSync puts the invoice number there, so a payment can only match one invoice.</dd></div>
            <div><dt>Requests on-chain</dt><dd>A wallet request is a tiny 0.0000001 XLM transfer whose memo carries the invoice number and amount. It reaches the client on any device, with no server in between.</dd></div>
            <div><dt>USDC</dt><dd>Circle's dollar stablecoin, native on Stellar. One click in SettleSync lets your wallet accept it.</dd></div>
            <div><dt>Any wallet</dt><dd>Stellar Wallets Kit connects Freighter, xBull, Albedo, LOBSTR, Hana, Rabet and more. Signing always happens inside your wallet.</dd></div>
            <div><dt>Your name, on your account</dt><dd>When you send a request, your display name is saved on your own Stellar account, so clients see who is asking.</dd></div>
          </dl>
        </div>
      </section>

      <section className="section" id="faq">
        <h2>Questions</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing">
        <div className="closing__inner">
          <h2>Send your next invoice with SettleSync</h2>
          <p>Free during the testnet pilot. Takes about a minute.</p>
          <button className="btn btn--light btn--lg" onClick={() => go("/dashboard")}>{address ? "Go to dashboard" : "Get started free"}</button>
        </div>
      </section>
    </div>
  );
}

const LINK_STEPS = [
  { title: "Create the invoice", body: "Client, amount in USDC, due date. SettleSync numbers it, like SS-K7QM4X." },
  { title: "Share the pay link", body: "Send it on WhatsApp, email, or as a QR code. Your client opens it and connects their wallet." },
  { title: "They pay in one click", body: "The invoice number travels in the payment's memo. It settles in about five seconds." },
  { title: "It marks itself paid", body: "SettleSync sees the payment on Stellar and stamps the right invoice. Export it all for your CA." },
];

const WALLET_STEPS = [
  { title: "Create the invoice", body: "Add your client's Stellar address to the invoice, the G… address their wallet shows." },
  { title: "Send the request", body: "One signature in your wallet sends the request to their wallet on Stellar. No link to forward." },
  { title: "It lands in Bills to pay", body: "When your client opens SettleSync, your request is waiting with your name, amount and invoice number." },
  { title: "Paid, matched, done", body: "They tap Pay. You see the invoice stamp itself paid on your side within seconds." },
];

const FAQ = [
  { q: "Does SettleSync ever hold my money?", a: "No. Payments go directly from your client's wallet to yours on Stellar. SettleSync only reads the public network to see which invoice a payment was for." },
  { q: "Does my client need a SettleSync account?", a: "No. With a pay link, they just open it and pay with any Stellar wallet. If they also use SettleSync, your requests can reach them directly, with no link at all." },
  { q: "Which wallets work?", a: "Freighter, xBull, Albedo, LOBSTR, Hana, Rabet and other wallets supported by Stellar Wallets Kit. Albedo works right in the browser with nothing to install." },
  { q: "Is this real money?", a: "Not yet. The pilot runs on Stellar testnet, where XLM and USDC are free test tokens. Mainnet comes after the pilot." },
  { q: "What does the CA export contain?", a: "One row per payment: invoice number, client, date, amount, the INR rate on that day from CoinGecko, the INR value, and a link to the transaction as proof. It's a record for your CA, not tax advice." },
  { q: "Where are my invoices stored?", a: "In your browser, tied to your wallet. Invoices you send as wallet requests are also recorded on Stellar and come back automatically on a new device. You can download a backup any time from Profile and backup." },
  { q: "What if a client pays only part of the invoice?", a: "SettleSync adds up every payment with that invoice number. The invoice shows 'Part paid' with the amount received until the rest arrives." },
];
