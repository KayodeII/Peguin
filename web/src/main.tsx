import Lenis from "lenis";
import { StrictMode, useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { HelpPenguin } from "./components/HelpPenguin";
import { Footer, Nav } from "./components/Sections";
import { Account, Connected, Pricing, SignIn, Waitlist } from "./pages/Account";
import { Home } from "./pages/Home";
import { Privacy, Terms } from "./pages/Legal";
import "./styles.css";
import { reducedMotion, scrollToHash, useRevealAll } from "./ui";

// Smooth, slightly weighted scrolling (off for reduced motion).
if (!reducedMotion()) {
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  (window as unknown as { __lenis: Lenis }).__lenis = lenis;
  const raf = (t: number) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

const PAGES: Record<string, () => JSX.Element | null> = { "/pricing": Pricing, "/signin": SignIn, "/account": Account, "/connected": Connected, "/waitlist": Waitlist, "/privacy": Privacy, "/terms": Terms };
const TITLES: Record<string, string> = { "/pricing": "Pricing", "/signin": "Sign in", "/account": "Account", "/connected": "Connected", "/waitlist": "Join the waitlist", "/privacy": "Privacy Policy", "/terms": "Terms of Service" };

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
  useRevealAll(path);
  const Page = PAGES[path] ?? Home;
  const bare = path === "/signin" || path === "/connected" || path === "/waitlist";
  return (
    <>
      {!bare && <Nav />}
      <main className={bare ? "bare" : ""}><Page /></main>
      {!bare && <Footer />}
      {path !== "/connected" && <HelpPenguin />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
