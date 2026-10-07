import { StrictMode, useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { Footer, Nav } from "./components/Sections";
import { Account, Connected, Pricing, SignIn } from "./pages/Account";
import { Home } from "./pages/Home";
import "./styles.css";
import { scrollToHash } from "./ui";

const PAGES: Record<string, () => JSX.Element | null> = { "/pricing": Pricing, "/signin": SignIn, "/account": Account, "/connected": Connected };
const TITLES: Record<string, string> = { "/pricing": "Pricing", "/signin": "Sign in", "/account": "Account", "/connected": "Signed in" };

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  useEffect(() => {
    document.title = TITLES[path] ? `${TITLES[path]} · Peguin` : "Peguin · Your standup, covered";
    if (location.hash) requestAnimationFrame(() => scrollToHash(location.hash));
  }, [path]);
  const Page = PAGES[path] ?? Home;
  const bare = path === "/signin" || path === "/connected";
  return (
    <>
      <Nav />
      <main className={bare ? "bare" : ""}><Page /></main>
      {!bare && <Footer />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
