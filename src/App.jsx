import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import PayPage from "./pages/PayPage";

// Tiny hash router: #/ (landing), #/app (freelancer dashboard), #/pay/<token> (client pays).
function useRoute() {
  const read = () => window.location.hash.replace(/^#/, "") || "/";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  let page;
  if (route.startsWith("/pay/")) page = <PayPage token={route.slice(5)} />;
  else if (route.startsWith("/app")) page = <Dashboard />;
  else page = <Landing />;

  return (
    <>
      <nav className="topbar">
        <a href="#/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          SettleSync
        </a>
        <span className="topbar__net">Stellar testnet</span>
        {!route.startsWith("/app") && (
          <a href="#/app" className="btn btn--ghost">Open app</a>
        )}
      </nav>
      <main>{page}</main>
      <footer className="footer">
        <p>SettleSync is non-custodial: payments go straight from your client's wallet to yours.</p>
        <p>Built on Stellar. Testnet pilot, no real funds.</p>
      </footer>
    </>
  );
}
