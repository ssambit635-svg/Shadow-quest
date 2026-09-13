import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { FaultLine } from "./components/FaultLine";
import { initMotion } from "./lib/motion";
import { isNativeApp } from "./lib/native";
import { initTheme } from "./lib/theme";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/dashboard.css";
import "./styles/stats.css";
import "./styles/login.css";
import "./styles/app.css";
import "./styles/arena.css";
import "./styles/admin.css";
/* Paper mode — the light theme. Loaded after every desktop stylesheet so
   its token overrides win; the phone face's own tokens are untouched. */
import "./styles/theme-light.css";
/* Last, and therefore decisive: the phone face of the app. Every rule
   inside is breakpoint-scoped, so the laptop never sees it. */
import "./styles/mobile.css";
/* The mobile-native shell's own design system. Every selector in it is
   scoped under `.m-app` or `.m-login`, so it cannot reach the desktop —
   and it is loaded last so the phone face wins outright on a phone. */
import "./styles/mobile-ui.css";

if (isNativeApp()) document.documentElement.classList.add("sq-native");

// Theme before first paint, so a remembered "paper" choice never flickers.
initTheme();

initMotion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FaultLine>
      <App />
    </FaultLine>
  </StrictMode>,
);
