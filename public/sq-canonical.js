/* sq-canonical.js — one address, one app.
 *
 * ShadowQuest is deployed on Render as a single service that answers both the
 * page and the API (render.yaml, service `shadowquest`), and that service
 * lives at
 *
 *     https://shadowquest.onrender.com        ← the live address
 *
 * An older Render *static site* still exists at
 *
 *     https://shadow-quest.onrender.com       ← one hyphen: retired
 *
 * and it deploys this same repository, so it looks identical while every
 * `/api` call behind it 404s — a static host answers unknown paths with its
 * own 404 page, and nothing there can proxy to the API. That is exactly the
 * "This build points at an address with no ShadowQuest API behind it" the
 * sign-in gate reports, and why "Continue with Google" stops working even
 * though nothing in the app changed.
 *
 * So a retired address forwards to the live one, carrying the whole address:
 * path, `?query` and `#fragment`. The fragment is not decoration — the OAuth
 * callback parks its one-time handoff code in `#/login?sq_auth=ok&code=…`,
 * so a forward that dropped it would silently throw away a finished sign-in.
 *
 * What it deliberately does NOT do:
 *   · touch any host except the exact ones in RETIRED. localhost, the dev and
 *     preview servers, `*.e2b.app` and the APK's `https://localhost` are all
 *     left alone, so nothing about local development or the installed app
 *     changes.
 *   · forward from LIVE itself, whatever RETIRED says. That one rule makes a
 *     redirect loop impossible: the live address is a dead end for this file.
 *   · run on an address carrying `sq_stay=1` — an escape hatch for looking at
 *     the retired page as it is, without editing anything.
 *
 * It is an external file, never inline, because the production CSP is
 * `script-src 'self'` (vite.config.ts and public/_headers both say so) and an
 * inlined script would simply never run.
 *
 * If the services are ever merged the other way — static site deleted and the
 * Web Service renamed to reclaim the old subdomain — swap the two values
 * below and change nothing else.
 *
 * Verified by `npm run smoke:canonical`.
 */
(function () {
  "use strict";

  /** The service that serves the page and the API. Never forwards. */
  var LIVE = "shadowquest.onrender.com";

  /** Retired addresses → where they live now. */
  var RETIRED = { "shadow-quest.onrender.com": LIVE };

  var here = String(window.location.hostname || "")
    .toLowerCase()
    .replace(/\.+$/, "");

  /** The decision, readable from the console (and asserted by the smoke). */
  var decision = { live: LIVE, from: here, to: null, reason: "not-retired" };
  try {
    window.__SQ_CANONICAL = decision;
  } catch (e) {
    /* a frozen window is not a reason to stop */
  }

  if (!here) return;

  // The live address is where this file stops, whatever RETIRED contains.
  if (here === LIVE) {
    decision.reason = "live";
    return;
  }

  var live = RETIRED[here];
  if (!live || live === here) return;

  var suffix = window.location.search + window.location.hash;
  if (/(^|[?&#])sq_stay=1(&|#|$)/.test(suffix)) {
    decision.reason = "stayed";
    return;
  }

  var to =
    "https://" + live + window.location.pathname + window.location.search + window.location.hash;
  if (to === window.location.href) {
    decision.reason = "same";
    return;
  }

  decision.to = to;
  decision.reason = "forward";

  // `replace`, not `assign`: the retired address leaves no history entry, so
  // Back does not bounce the operator straight into the forward again.
  window.location.replace(to);
})();
