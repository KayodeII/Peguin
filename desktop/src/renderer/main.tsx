import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CopilotPanel } from "./copilot";
import "./styles.css";

// The copilot window loads this same page at #copilot and shows only its panel.
const Root = location.hash === "#copilot" ? CopilotPanel : App;
createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
