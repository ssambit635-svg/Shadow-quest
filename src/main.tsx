import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initMotion } from "./lib/motion";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/arena.css";

initMotion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
