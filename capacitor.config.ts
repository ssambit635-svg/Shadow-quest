import type { CapacitorConfig } from "@capacitor/cli";

/**
 * capacitor.config.ts — the Android shell for ShadowQuest.
 *
 * The APK is a thin WebView around the *same* build the site ships: `webDir`
 * is the Vite output, so whatever `npm run build` produced is exactly what
 * lands in `assets/public` inside the APK. "Same backend" is therefore
 * literal, not approximate — the bundle inside the APK is the bundle on the
 * site, and it picks its transport the same way:
 *
 *   · build with `VITE_API_BASE_URL` set  → the APK talks to that HTTP API.
 *   · build without it                    → the in-page mock engine runs,
 *                                           exactly like the un-configured
 *                                           web app.
 *
 * Live mode (optional): set `CAPACITOR_SERVER_URL` when running
 * `npx cap sync` and the shell stops bundling and instead loads a hosted
 * build, so the APK is always the deployed site — handy while the backend
 * is moving faster than the store build.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.replace(/\/+$/, "") || undefined;

/**
 * Hosts the WebView is allowed to navigate to itself.
 *
 * This is what makes "Continue with Google" work inside the APK. Capacitor's
 * Bridge.launchIntent hands any navigation to an unlisted host to the system
 * browser (Intent.ACTION_VIEW), so without this list the OAuth round trip
 * leaves the app: the human signs in in Chrome, Google bounces to the API,
 * the API bounces back to https://localhost/#/login?… — and Chrome has
 * nothing listening on localhost, so the code is dropped on the floor and the
 * app never sees it.
 *
 * Listed here, the whole trip stays in the WebView: out to Google, back to
 * the API, back to the app's own origin, where lib/googleAuth reads the
 * one-time code out of the hash and trades it for a session.
 *
 * The API host comes from VITE_API_BASE_URL — the same value the bundle is
 * built with, so the shell and the JS can never disagree about where the
 * backend is.
 */
function allowNavigation(): string[] {
  // The live service, always allowed: public/sq-canonical.js forwards a
  // retired address (shadow-quest.onrender.com, the old static site with no
  // API behind it) to this host, and a hosted-build APK must be able to
  // follow that inside the WebView instead of handing it to Chrome. Keep in
  // step with LIVE in public/sq-canonical.js.
  const hosts = ["accounts.google.com", "shadowquest.onrender.com"];
  const raw = (process.env.VITE_API_BASE_URL ?? "").trim();
  if (raw) {
    try {
      hosts.push(new URL(raw).hostname);
    } catch {
      console.warn(`[capacitor] ignoring unparsable VITE_API_BASE_URL: ${raw}`);
    }
  } else {
    console.warn(
      "[capacitor] VITE_API_BASE_URL is not set — the APK has no API address, so " +
        "sign-in (and every ledger call) cannot reach a backend. Set it before building.",
    );
  }
  return [...new Set(hosts)];
}

const config: CapacitorConfig = {
  appId: "app.arena.shadowquest",
  appName: "ShadowQuest",
  webDir: "dist",
  // Ink, not white: the WebView background matches the app ground so there
  // is no white flash between the splash and the first paint.
  backgroundColor: "#0c0b0a",
  android: {
    // The app is a full-screen instrument; let it draw under the status bar
    // and compensate with safe-area insets (the CSS already does).
    allowMixedContent: false,
    backgroundColor: "#0c0b0a",
  },
  server: serverUrl
    ? {
        url: serverUrl,
        // A hosted build is authoritative; never fall back to a stale bundle.
        cleartext: false,
        allowNavigation: allowNavigation(),
      }
    : {
        // Spelled out because it is a contract, not a default: the shell
        // serves the bundle from https://localhost, which is the origin the
        // backend's SQ_NATIVE_ORIGIN allows to receive a sign-in handoff.
        androidScheme: "https",
        allowNavigation: allowNavigation(),
      },
  plugins: {
    SplashScreen: {
      backgroundColor: "#0c0b0a",
      showSpinner: false,
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0c0b0a",
      overlaysWebView: false,
    },
  },
};

export default config;
