import { AppProvider, useApp } from "./lib/app";
import Header, { Footer } from "./components/Header";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import PayPage from "./pages/PayPage";
import ClaimPage from "./pages/ClaimPage";
import Plans from "./pages/Plans";
import Account from "./pages/Account";
import Admin from "./pages/Admin";

const LANDING_ROUTES = ["/", "/how", "/who", "/stellar", "/faq"];

function Routes() {
  const { route } = useApp();
  let page;
  if (route.startsWith("/pay/")) page = <PayPage token={route.slice(5)} />;
  else if (route.startsWith("/claim/")) page = <ClaimPage secret={decodeURIComponent(route.slice(7))} />;
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
      <main id="main" tabIndex={-1} className="page-in" key={pageKey}>{page}</main>
      <Footer />
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
