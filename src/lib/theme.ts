/**
 * theme.ts — dark / light, for the site face only.
 *
 * The phone face (`.m-app` / `.m-login`) is built on its own `--m-*` tokens
 * and never reads the ones this toggle swaps, so the APK and the mobile
 * layout stay in ink no matter what the site does.
 *
 * Dark (the default) is the sumi ground the whole design is drawn on; light
 * is "paper mode" — the same palette, inverted, as if the ledger were
 * printed. The choice is remembered per browser.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "sq.theme";
const EVENT = "sq:theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return stored() ?? "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // Let the browser chrome (and the APK status bar) follow the page.
  document.documentElement.style.colorScheme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>("meta[name=theme-color]")) {
    meta.content = theme === "light" ? "#f2efe8" : "#0c0b0a";
  }
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* a private window simply forgets the choice */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/** Apply the remembered theme before first paint flickers against it. */
export function initTheme(): void {
  applyTheme(currentTheme());
}

/** Reactive theme for components (the toggle in the nav). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return theme;
}

/** Stable toggle handler. */
export function useToggleTheme(): () => void {
  return useCallback(() => toggleTheme(), []);
}
