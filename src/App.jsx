import { useEffect } from "react";
import { AppProvider, useApp } from "./lib/app";
import Header, { Footer } from "./components/Header";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import PayPage from "./pages/PayPage";
import ClaimPage from "./pages/ClaimPage";
import Plans from "./pages/Plans";
import Account from "./pages/Account";
import Admin from "./pages/Admin";
import Intro from "./components/Intro";
import EdgeGlow from "./components/EdgeGlow";

const LANDING_ROUTES = ["/", "/why", "/how", "/who", "/stellar", "/faq"];

function Routes() {
  const { route, network } = useApp();

  // Tapping anywhere on a date field opens the calendar (it starts at today).
  useEffect(() => {
    const open = (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === "date" && typeof el.showPicker === "function") {
        try { el.showPicker(); } catch { /* not allowed in this context */ }
      }
    };
    document.addEventListener("click", open);
    return () => document.removeEventListener("click", open);
  }, []);

  let page;
  if (route.startsWith("/pay/")) page = <PayPage token={route.slice(5)} />;
  else if (route.startsWith("/claim/")) {
    const [secret, query = ""] = decodeURIComponent(route.slice(7)).split("?");
    page = <ClaimPage secret={secret} net={new URLSearchParams(query).get("n") === "mainnet" ? "mainnet" : "testnet"} />;
  }
  else if (route.startsWith("/dashboard") || route === "/app") page = <Dashboard />;
  else if (route.startsWith("/account")) page = <Account />;
  else if (route.startsWith("/plans")) page = <Plans />;
  else if (route.startsWith("/owner")) page = <Admin />;
  else page = <Landing />;
  const pageKey = route.startsWith("/dashboard") ? "/dashboard" : LANDING_ROUTES.includes(route) ? "/" : route;

  return (
    <>
      <button className="skip" onClick={() => document.getElementById("main")?.focus()}>Skip to content</button>
      <Header />
      <main id="main" tabIndex={-1} className="page-in" key={`${pageKey}:${network}`}>{page}</main>
      <Footer />
      <EdgeGlow />
      <Intro />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}
