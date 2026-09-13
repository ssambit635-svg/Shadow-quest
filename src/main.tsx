import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initMotion } from "./lib/motion";
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

initMotion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
