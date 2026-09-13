import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The origin the app is allowed to talk to, when a real API is configured.
 * A build without VITE_API_BASE_URL runs the in-page mock engine and makes no
 * network calls at all, so the policy tightens to same-origin by itself.
 */
function apiOrigin(): string {
  const raw = (process.env.VITE_API_BASE_URL ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    console.warn(`[csp] ignoring unparsable VITE_API_BASE_URL: ${raw}`);
    return "";
  }
}

/**
 * Content-Security-Policy, injected at build time only.
 *
 * It is a `<meta>` rather than only a server header because the same bundle
 * ships inside the Capacitor APK, where nothing serves headers at all — the
 * WebView loads the files directly and would otherwise run with no policy.
 *
 * Dev is deliberately exempt: Vite injects an inline module preamble for HMR,
 * and a `script-src 'self'` would block it and break the dev server.
 *
 * `'unsafe-inline'` stays on `style-src` and nowhere else. GSAP writes inline
 * transforms on every frame and React writes inline `style` attributes, so
 * style attributes cannot be nonced — but that permission covers styles only.
 * `script-src` carries no `'unsafe-inline'` and no `'unsafe-eval'`, which is
 * the part that actually matters: an injected `<script>` or an `onerror=`
 * handler cannot execute.
 */
function csp(): Plugin {
  return {
    name: "shadowquest-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler() {
        const connect = ["'self'", apiOrigin()].filter(Boolean).join(" ");
        const policy = [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data:",
          `connect-src ${connect}`,
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "upgrade-insecure-requests",
        ].join("; ");
        return [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: policy },
            injectTo: "head-prepend",
          },
          // Do not hand the sign-in page's address to a third party.
          {
            tag: "meta",
            attrs: { name: "referrer", content: "strict-origin-when-cross-origin" },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

/**
 * The ShadowQuest backend (server/) listens on 8788. The browser only ever
 * calls the same-origin /api prefix and the dev/preview servers forward it,
 * so the page never needs to know the backend's real origin — and the APK /
 * production builds can point VITE_API_BASE_URL at the deployed API instead.
 *
 * When the backend is NOT running, http-proxy answers with a bare 500 and no
 * body — which is what used to reach the Milestones screen as an
 * unexplainable failure. The `error` hook below replaces that with an honest
 * JSON 503, so every screen can tell "the API is away" from "the API is
 * broken" and degrade accordingly.
 */
const BACKEND = process.env.SQ_BACKEND_URL ?? "http://127.0.0.1:8788";

function proxyError(
  err: Error & { code?: string },
  res: { writeHead?: unknown; end?: unknown; headersSent?: boolean },
) {
  const away = err.code === "ECONNREFUSED" || err.code === "ENOTFOUND";
  const body = JSON.stringify({
    ok: false,
    error: away ? "backend offline" : "proxy failure",
    detail: away
      ? `the ShadowQuest API is not listening on ${BACKEND} — run \`npm run dev\` (starts both halves) or \`npm run dev:api\` on its own`
      : err.message,
  });
  if (typeof res?.writeHead !== "function" || typeof res.end !== "function") return;
  if (res.headersSent) return;
  try {
    res.writeHead(503, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
    });
    res.end(body);
  } catch {
    /* socket already gone — nothing left to answer */
  }
}

const apiProxy: ProxyOptions = {
  target: BACKEND,
  changeOrigin: true,
  rewrite: (p: string) => p.replace(/^\/api/, ""),
  configure(proxy) {
    proxy.on("error", (err: Error, _req: unknown, res: unknown) =>
      proxyError(err, res as { writeHead?: unknown; end?: unknown; headersSent?: boolean }),
    );
  },
};

// Preview-safe: bind every interface, allow the Arena proxy host, and let the
// dev server talk to a real Shadow Quest API via VITE_API_ORIGIN without
// exposing that origin to the browser.
export default defineConfig({
  plugins: [react(), csp()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: [".e2b.app", "localhost"],
    cors: true,
    proxy: { "/api": apiProxy },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", "localhost"],
    proxy: { "/api": apiProxy },
  },
  build: {
    target: "es2022",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          gsap: ["gsap"],
        },
      },
    },
  },
});
