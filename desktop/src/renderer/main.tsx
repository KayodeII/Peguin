import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CopilotPanel } from "./copilot";
import "./styles.css";

// The copilot window loads this same page at #copilot and shows only its panel
// (#copilot-out when the panel is in its own window).
const Root = location.hash.startsWith("#copilot") ? CopilotPanel : App;
createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
