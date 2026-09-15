/* ============================================================================
 * sq-loader.js — THE site loader driver for ShadowQuest.
 *
 * SINGLE-LOADER ARCHITECTURE (read before touching):
 *  - The site loader lives ONLY in index.html:
 *      markup  ->  <div id="sq-initial-loader"> … </div>
 *      styles  ->  <style id="sq-critical-loader"> … </style>
 *  - This file is its ONLY driver: counter 000→100, stage text, skip,
 *    session (once per tab), blade + 5-panel exit.
 *  - React (src/components/Boot.tsx) renders NOTHING. It only waits for the
 *    `sq:initial-loader-done` event below, then reveals the app chrome.
 *    It must NEVER hide/remove this loader early or play its own animation —
 *    that was the bug that kept showing the old loader again and again.
 *
 * Why an external file instead of an inline <script> in index.html:
 *  - vite.config.ts injects `script-src 'self'` in production builds, which
 *    BLOCKS inline scripts. An inline loader script paints but never runs
 *    (frozen at 000 / stuck curtain) in the built site. /sq-loader.js is
 *    same-origin, so it always runs — dev, build, preview and the APK.
 *
 * Test helpers (query params):
 *  - ?loader     force-show the loader even if already seen this tab
 *  - ?noloader   force-skip the loader entirely
 * ========================================================================== */
(function () {
  "use strict";

  var KEY = "sq.boot.seen.v4";
  var DONE_EVENT = "sq:initial-loader-done";
  var SAFETY_MS = 4500;

  function markDone() {
    try {
      window.__SQ_LOADER_STATE = "done";
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent(DONE_EVENT));
    } catch (e) {
      try {
        // Very old WebViews without CustomEvent constructor.
        var ev = document.createEvent("Event");
        ev.initEvent(DONE_EVENT, false, false);
        window.dispatchEvent(ev);
      } catch (_) {
        /* listeners also poll for removal — nothing else to do */
      }
    }
  }

  var loader = document.getElementById("sq-initial-loader");
  if (!loader) {
    markDone();
    return;
  }

  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var forceShow = false;
  var forceHide = false;
  try {
    if (typeof URLSearchParams !== "undefined") {
      var params = new URLSearchParams(window.location.search);
      forceHide = params.has("noloader");
      forceShow = !forceHide && params.has("loader");
    } else {
      var q = window.location.search || "";
      forceHide = q.indexOf("noloader") !== -1;
      forceShow = !forceHide && q.indexOf("loader") !== -1;
    }
  } catch (e) {}

  var seen = false;
  try {
    seen = !!window.sessionStorage.getItem(KEY);
  } catch (e) {}

  if (forceShow) {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch (e) {}
    seen = false;
  }

  // Repeat visit in this tab, forced skip, or reduced motion: no curtain.
  if (forceHide || reduced || seen) {
    try {
      loader.remove();
    } catch (e) {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }
    try {
      document.documentElement.style.overflow = "";
    } catch (e) {}
    markDone();
    return;
  }

  try {
    window.__SQ_LOADER_STATE = "pending";
  } catch (e) {}

  var numEl = loader.querySelector("[data-boot-num]");
  var fillEl = loader.querySelector("[data-boot-fill]");
  var stageEl = loader.querySelector("[data-boot-stage]");
  var stages = [
    "stirring the ink",
    "summoning the shadows",
    "sharpening the blade",
    "aligning the ring",
    "sealing the ledger",
  ];

  var progress = 0;
  var raf = 0;
  var exiting = false;

  function setStageByProgress(p) {
    var idx = 0;
    if (p >= 84) idx = 4;
    else if (p >= 64) idx = 3;
    else if (p >= 44) idx = 2;
    else if (p >= 22) idx = 1;
    if (stageEl && stageEl.textContent !== stages[idx]) {
      stageEl.textContent = stages[idx];
    }
  }

  function tick() {
    if (exiting) return;
    // Ease: fast start, slow end.
    if (progress < 60) progress += 1.7 + Math.random() * 0.8;
    else if (progress < 85) progress += 0.7 + Math.random() * 0.5;
    else progress += 0.35 + Math.random() * 0.3;

    if (progress >= 100) progress = 100;

    if (numEl) numEl.textContent = String(Math.floor(progress)).padStart(3, "0");
    if (fillEl) fillEl.style.transform = "scaleX(" + progress / 100 + ")";
    setStageByProgress(progress);

    if (progress < 100) {
      raf = requestAnimationFrame(tick);
    } else {
      // Hold 320ms on 100, then exit.
      setTimeout(exit, 320);
    }
  }

  function exit() {
    if (exiting) return;
    exiting = true;
    try {
      cancelAnimationFrame(raf);
    } catch (e) {}
    loader.classList.add("is-exiting");
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch (e) {}
    try {
      document.documentElement.style.overflow = "";
    } catch (e) {}
    setTimeout(function () {
      try {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      } catch (e) {}
      // Tell React (Boot.tsx) the curtain is gone — it reveals the chrome.
      markDone();
    }, 900);
  }

  // Exposed so React's safety timer can force the exit if ever stuck.
  try {
    window.__SQ_EXIT_INITIAL_LOADER = exit;
  } catch (e) {}

  // Skippable: any interaction fast-forwards to the exit.
  function skip() {
    if (progress > 20) {
      progress = 100;
      if (numEl) numEl.textContent = "100";
      if (fillEl) fillEl.style.transform = "scaleX(1)";
    }
    exit();
  }
  window.addEventListener("pointerdown", skip, { once: true });
  window.addEventListener("keydown", skip, { once: true });

  // Absolute safety: the curtain can never trap the page.
  setTimeout(exit, SAFETY_MS);

  // Lock scroll until done — except inside the Capacitor WebView, where the
  // document scroller must stay owned by the native shell.
  try {
    if (!/Capacitor/.test(window.navigator.userAgent)) {
      document.documentElement.style.overflow = "hidden";
    }
  } catch (e) {}

  raf = requestAnimationFrame(tick);
})();
