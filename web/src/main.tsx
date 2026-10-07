import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Account, Connected, Home, Pricing, SignIn } from "./pages";
import "./styles.css";
import { Link, Logo } from "./ui";

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  const page = path === "/pricing" ? <Pricing /> : path === "/signin" ? <SignIn /> : path === "/account" ? <Account />
    : path === "/connected" ? <Connected /> : <Home />;
  return (
    <>
      <header className="nav">
        <Link to="/" className="brand"><Logo />Peguin</Link>
        <nav>
          <Link to="/pricing">Pricing</Link>
          <Link to="/account" className="btn small">Account</Link>
        </nav>
      </header>
      <main>{page}</main>
      <footer className="foot">
        <span>Peguin always tells the meeting it's an AI assistant.</span>
        <span>© {new Date().getFullYear()} Peguin</span>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
