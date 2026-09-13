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
      }
    : undefined,
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
