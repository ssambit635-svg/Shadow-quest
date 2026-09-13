import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initMotion } from "./lib/motion";
import { isNativeApp } from "./lib/native";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/dashboard.css";
import "./styles/login.css";
import "./styles/app.css";
import "./styles/arena.css";
/* Last, and therefore decisive: the phone face of the app. Every rule
   inside is breakpoint-scoped, so the laptop never sees it. */
import "./styles/mobile.css";
/* The mobile-native shell's own design system. Every selector in it is
   scoped under `.m-app` or `.m-login`, so it cannot reach the desktop —
   and it is loaded last so the phone face wins outright on a phone. */
import "./styles/mobile-ui.css";

if (isNativeApp()) document.documentElement.classList.add("sq-native");

initMotion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
