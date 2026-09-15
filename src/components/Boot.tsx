/**
 * Boot.tsx — passive handoff waiter for THE site loader.
 *
 * SINGLE-LOADER ARCHITECTURE — do NOT add a second animation here:
 *  - The site loader lives ONLY in index.html (`#sq-initial-loader` markup +
 *    `#sq-critical-loader` CSS) and is driven ONLY by /sq-loader.js.
 *  - This component renders NOTHING. It waits until that loader is gone, then
 *    calls onDone so App can reveal the chrome (body[data-booted]) and start
 *    section animations (ReadyContext).
 *
 * Why this file used to be the bug: the old Boot hid `#sq-initial-loader` on
 * mount (`display: none` + remove) and played its own GSAP copy instead — so
 * whatever loader index.html contained NEVER showed on screen, and the old
 * React animation appeared again and again ("baar baar purana loader").
 * That competing animation is deleted. index.html is now the single source
 * of truth: change it there and the site shows it. Guaranteed.
 *
 * Safety: the waiter can never trap the page. It finishes when ANY of these
 * happen: the loader element is already gone (repeat visit / reduced motion /
 * HMR), the `sq:initial-loader-done` event fires, the 200ms poll sees the
 * element removed, or the 6s safety timer force-exits the loader.
 */

import { useEffect, useRef } from "react";

const DONE_EVENT = "sq:initial-loader-done";
const SAFETY_MS = 6000;

declare global {
  interface Window {
    __SQ_LOADER_STATE?: "pending" | "done";
    __SQ_EXIT_INITIAL_LOADER?: () => void;
  }
}

export function Boot({ onDone }: { onDone: () => void }) {
  // onDone is an inline closure in App — pin it in a ref so the effect below
  // subscribes exactly once instead of re-running on every App render.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      // Defensive: the loader script owns the scroll lock and releases it on
      // every exit path — this only matters if something removed the curtain
      // without running its exit (e.g. HMR, forced DOM edits).
      document.documentElement.style.overflow = "";
      doneRef.current();
    };

    const gone = () =>
      window.__SQ_LOADER_STATE === "done" ||
      !document.getElementById("sq-initial-loader") ||
      !!document.getElementById("sq-initial-loader")?.classList.contains("is-exiting");

    // Loader already gone (repeat visit in this tab, reduced motion, HMR,
    // ?noloader): boot is trivially done — no waiting, no curtain flash.
    if (gone()) {
      finish();
      return;
    }

    const onDoneEvent = () => finish();
    window.addEventListener(DONE_EVENT, onDoneEvent);
    // Start the app entrance UNDER the opening curtain, not after removal.
    window.addEventListener("sq:initial-loader-exiting", onDoneEvent);

    // Belt + suspenders: if the element disappears without the event, finish.
    const poll = window.setInterval(() => {
      if (gone()) finish();
    }, 200);

    // Absolute safety: never trap the user behind the curtain.
    const safety = window.setTimeout(() => {
      try {
        if (typeof window.__SQ_EXIT_INITIAL_LOADER === "function") {
          window.__SQ_EXIT_INITIAL_LOADER();
        } else {
          document.getElementById("sq-initial-loader")?.remove();
        }
      } catch {
        try {
          document.getElementById("sq-initial-loader")?.remove();
        } catch {
          /* element already gone */
        }
      }
      finish();
    }, SAFETY_MS);

    return () => {
      window.removeEventListener(DONE_EVENT, onDoneEvent);
      window.removeEventListener("sq:initial-loader-exiting", onDoneEvent);
      window.clearInterval(poll);
      window.clearTimeout(safety);
    };
  }, []);

  // This component intentionally renders nothing — the loader is pure HTML.
  return null;
}
