import { AppProvider, useApp } from "./lib/app";
import Header, { Footer } from "./components/Header";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import PayPage from "./pages/PayPage";
import Plans from "./pages/Plans";

function Routes() {
  const { route } = useApp();
  let page;
  if (route.startsWith("/pay/")) page = <PayPage token={route.slice(5)} />;
  else if (route.startsWith("/dashboard") || route === "/app") page = <Dashboard />;
  else if (route.startsWith("/plans")) page = <Plans />;
  else page = <Landing />;
  const pageKey = route.startsWith("/dashboard") ? "/dashboard" : ["/", "/how", "/who", "/stellar", "/faq"].includes(route) ? "/" : route;

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
