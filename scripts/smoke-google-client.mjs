/* smoke-google-client.mjs — the BROWSER/APK half of Google sign-in, checked
 * against the same failure shapes a real deployment produces.
 *
 * smoke-oauth.mjs proves the server verifies Google's ID token correctly. This
 * one proves the other end: when the app taps "Continue with Google", does it
 * reach the backend, and when something goes wrong does it tell the operator
 * THE TRUTH instead of blaming their wifi?
 *
 * It bundles and runs the shipping client modules — src/api/ledger.ts,
 * src/lib/googleAuth.ts, src/hooks/useGoogleAuth.ts — unmodified, inside a
 * happy-dom window whose origin and whose network answers we control. Nothing
 * here re-implements the flow; it imports it.
 *
 * Run it with `npm run smoke:client`.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ESBUILD = join(ROOT, "node_modules", ".bin", "esbuild");

let pass = 0;
let fail = 0;
const ok = (label) => {
  pass += 1;
  console.log(`ok  ${label}`);
};
const bad = (label, extra = "") => {
  fail += 1;
  console.log(`FAIL ${label}${extra ? ` — ${extra}` : ""}`);
};
const check = (cond, label, extra = "") => (cond ? ok(label) : bad(label, extra));

/** Bundle the real client modules once per VITE_API_BASE_URL value. */
async function bundleClient(apiBaseUrl) {
  const dir = await mkdtemp(join(tmpdir(), "sq-client-"));
  const entry = join(dir, "entry.ts");
  await writeFile(
    entry,
    [
      `export { fetchAuthProviders, exchangeGoogleCode, API_BASE, API_BASE_IS_ABSOLUTE } from "${join(ROOT, "src/api/ledger.ts")}";`,
      `export {`,
      `  completeGoogleSignIn,`,
      `  googleErrorMessage,`,
      `  googleFailureReason,`,
      `  hasGoogleReturn,`,
      `  probeFailureReason,`,
      `  GoogleAuthError,`,
      `  readGoogleReturn,`,
      `  startGoogleSignIn,`,
      `} from "${join(ROOT, "src/lib/googleAuth.ts")}";`,
      `export { useGoogleAuth } from "${join(ROOT, "src/hooks/useGoogleAuth.ts")}";`,
      // The shell's routing, because where a sign-in return LANDS decides
      // whether the code is ever redeemed at all.
      `export { routeFromHash, readHash, hashForRoute, hashPath } from "${join(ROOT, "src/lib/route.ts")}";`,
      `export { currentUser, login } from "${join(ROOT, "src/lib/auth.ts")}";`,
    ].join("\n"),
  );
  const out = join(dir, "bundle.mjs");
  const args = [
    entry,
    "--bundle",
    "--format=esm",
    "--platform=browser",
    `--outfile=${out}`,
    "--log-level=error",
    "--define:process.env.NODE_ENV=\"production\"",
  ];
  if (apiBaseUrl === undefined) {
    args.push("--define:import.meta.env={}");
  } else {
    args.push(`--define:import.meta.env={"VITE_API_BASE_URL":${JSON.stringify(apiBaseUrl)}}`);
  }
  execFileSync(ESBUILD, args, { stdio: "inherit" });
  return { out, dir };
}

/**
 * A happy-dom window pinned to `origin`, with a scripted fetch.
 * `answer(path)` returns a Response, or throws to mean "no connection".
 * `native` injects window.Capacitor, which is what the installed APK does.
 */
function makeWindow(origin, answer, { native = false, url = null } = {}) {
  // `url` boots the window at an exact address — how a real page load arrives
  // back from Google, fragment and all.
  const win = new Window({ url: url ?? `${origin}/` });
  if (native) win.Capacitor = { isNativePlatform: () => true };
  const calls = [];
  win.fetch = async (input, init = {}) => {
    const url = String(typeof input === "string" ? input : input.url);
    calls.push({ url, method: (init.method ?? "GET").toUpperCase() });
    const res = await answer(url, init);
    if (res instanceof Error) throw res;
    return res;
  };
  // The bundle reads these as bare globals, exactly as it does in a browser.
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.history = win.history;
  globalThis.location = win.location;
  globalThis.fetch = win.fetch;
  globalThis.URLSearchParams = win.URLSearchParams;
  globalThis.Response = win.Response;
  // lib/auth dispatches `new Event(...)` on the happy-dom window; the
  // constructor must be that window's own or happy-dom rejects the dispatch.
  globalThis.Event = win.Event;
  globalThis.CustomEvent = win.CustomEvent;
  return { win, calls };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Every way a deployment answers `/v1/auth/providers`. */
const scenarios = {
  /** The APK's WebView: there is no server behind the app's own origin. */
  apkShell: (url) => {
    if (url.includes("/v1/auth/providers")) return json(404, { error: "not found" });
    if (url.includes("/v1/auth/google/exchange")) return json(404, { error: "not found" });
    return json(200, {});
  },
  /** A static website with no /api rewrite in front of it. */
  noProxy: (url) => {
    if (url.startsWith("/api") || url.includes("/api/")) return json(404, { error: "no route" });
    return json(200, {});
  },
  /** Backend up, Google OAuth not configured on it. */
  unconfigured: (url) => {
    if (url.includes("/v1/auth/providers")) return json(200, { password: true, google: false });
    if (url.includes("/v1/auth/google/exchange")) return json(503, { error: "google sign-in is not configured" });
    return json(200, {});
  },
  /** Backend up, Google live, everything works. */
  healthy: (url) => {
    if (url.includes("/v1/auth/providers")) return json(200, { password: true, google: true });
    if (url.includes("/v1/auth/google/exchange")) {
      return json(200, {
        token: "t-1",
        mode: "created",
        user: { email: "ada@example.com", handle: "Ada", picture: "", role: "operator" },
      });
    }
    return json(200, {});
  },
  /** The handoff code was already spent, or outlived its two minutes. */
  spent: (url) => {
    if (url.includes("/v1/auth/providers")) return json(200, { password: true, google: true });
    if (url.includes("/v1/auth/google/exchange")) return json(401, { error: "sign in again" });
    return json(200, {});
  },
  /** Rate limited. */
  throttled: (url) => {
    if (url.includes("/v1/auth/providers")) return json(200, { password: true, google: true });
    if (url.includes("/v1/auth/google/exchange")) return json(429, { error: "too many" });
    return json(200, {});
  },
  /** The device is genuinely offline. */
  offline: () => new Error("network down"),
};

/* ------------------------------------------------------------------ */

console.log("— bundling the real client modules —");
const bare = await bundleClient(undefined); // BASE = "/api"  (site + APK default)
const pointed = await bundleClient("https://api.shadowquest.test"); // APK with a base

console.log("\n— what the operator is told when they tap Continue with Google —");

// 1. The APK built WITHOUT an API address. There is no HTTP server behind
//    https://localhost, so the same-origin /api probe cannot answer — and no
//    amount of wifi-checking will change that. Say so, and name the fix.
{
  const m = await import(`${pathToFileURL(bare.out).href}?v=apk`);
  const { win } = makeWindow("https://localhost", scenarios.apkShell, { native: true });
  check(m.API_BASE === "/api", "APK build without a base: BASE is relative", m.API_BASE);
  check(m.API_BASE_IS_ABSOLUTE === false, "APK build without a base: not absolute");
  const p = await m.fetchAuthProviders();
  check(p.reachable === false, "APK shell: /api probe reported unreachable", JSON.stringify(p));
  check(p.status === 404, "APK shell: probe carried the 404", String(p.status));
  const reason = m.probeFailureReason(p.status);
  check(reason === "misbuilt", "APK shell: diagnosed as a build problem", reason);
  const msg = m.googleErrorMessage(reason);
  check(/VITE_API_BASE_URL/.test(msg), "APK shell: message names the missing setting", msg);
  check(!/check your connection/i.test(msg), "APK shell: does not blame the connection", msg);
  // And the tap must not drive the WebView off to a dead end.
  let thrown = null;
  try {
    m.startGoogleSignIn();
  } catch (err) {
    thrown = err;
  }
  check(
    thrown instanceof m.GoogleAuthError && thrown.reason === "misbuilt",
    "APK shell: tapping Google refuses instead of navigating nowhere",
    thrown ? String(thrown.reason ?? thrown.message) : "no throw",
  );
  check(!win.location.href.includes("/v1/auth/google/start"), "APK shell: no navigation attempted", win.location.href);
}

// 1b. The APK built WITH an API address — the supported build. The probe is
//     pointed at the real origin, and the tap is allowed to navigate.
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=apk-ok`);
  const { win } = makeWindow("https://localhost", scenarios.healthy, { native: true });
  check(m.API_BASE_IS_ABSOLUTE === true, "APK build with a base: absolute", m.API_BASE);
  m.startGoogleSignIn();
  check(
    win.location.href.startsWith("https://api.shadowquest.test/v1/auth/google/start?return_to=https%3A%2F%2Flocalhost%2F"),
    "APK build with a base: navigates to the API, returning to the shell",
    win.location.href,
  );
}

// 2. Static website with no /api rewrite — a 404 from something that is not
//    the ShadowQuest API. Not a connection problem, and not a build problem.
{
  const m = await import(`${pathToFileURL(bare.out).href}?v=noproxy`);
  makeWindow("https://shadowquest.test", scenarios.noProxy);
  const p = await m.fetchAuthProviders();
  check(p.reachable === false && p.status === 404, "static host: probe carried the 404", JSON.stringify(p));
  const reason = m.probeFailureReason(p.status);
  check(reason === "missing", "static host: diagnosed as a missing API route", reason);
  check(!/check your connection/i.test(m.googleErrorMessage(reason)), "static host: does not blame the connection");
}

// 2b. A website whose API really is down: no answer at all.
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=down`);
  makeWindow("https://shadowquest.test", scenarios.offline);
  const p = await m.fetchAuthProviders();
  check(p.reachable === false && p.status === undefined, "API down: probe has no status", JSON.stringify(p));
  check(m.probeFailureReason(p.status) === "unreachable", "API down: diagnosed as unreachable");
}

// 3. Backend reachable but Google off: must be "not configured", never "network".
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=uncfg`);
  makeWindow("https://localhost", scenarios.unconfigured);
  const p = await m.fetchAuthProviders();
  check(p.reachable === true && p.google === false, "unconfigured: reachable but Google off");
  check(
    /not configured/i.test(m.googleErrorMessage("unconfigured")),
    "unconfigured: honest sentence",
    m.googleErrorMessage("unconfigured"),
  );
}

// 4. Happy path: the code is redeemed and the session is the server's.
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=healthy`);
  const { calls } = makeWindow("https://localhost", scenarios.healthy);
  const out = await m.completeGoogleSignIn("handoff-1");
  check(out.user.email === "ada@example.com", "healthy: signed in as the server's user", out.user.email);
  check(out.mode === "created", "healthy: mode passed through");
  check(
    calls.some((c) => c.url.startsWith("https://api.shadowquest.test/v1/auth/google/exchange")),
    "healthy: exchange hit the configured API base",
    calls.map((c) => c.url).join(", "),
  );
  check(
    globalThis.localStorage.getItem("sq.auth.provider.v1")?.includes("google") === true,
    "healthy: provider marker written",
  );
}

// 5. Spent/expired handoff code → must ask for a fresh sign-in, not "check wifi".
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=spent`);
  makeWindow("https://localhost", scenarios.spent);
  let reason = "none";
  try {
    await m.completeGoogleSignIn("used-code");
  } catch (err) {
    reason = err instanceof m.GoogleAuthError ? err.reason : `raw:${err.message}`;
  }
  check(reason === "expired", "spent code → reason 'expired'", reason);
  check(
    !/check your connection/i.test(m.googleErrorMessage(reason)),
    "spent code: does not blame the connection",
    m.googleErrorMessage(reason),
  );
}

// 6. Throttled → its own sentence.
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=throttled`);
  makeWindow("https://localhost", scenarios.throttled);
  let reason = "none";
  try {
    await m.completeGoogleSignIn("c");
  } catch (err) {
    reason = err instanceof m.GoogleAuthError ? err.reason : `raw:${err.message}`;
  }
  check(reason === "throttled", "429 → reason 'throttled'", reason);
}

// 7. Genuinely offline → still the connection sentence (that one is honest).
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=offline`);
  makeWindow("https://localhost", scenarios.offline);
  let reason = "none";
  try {
    await m.completeGoogleSignIn("c");
  } catch (err) {
    reason = err instanceof m.GoogleAuthError ? err.reason : `raw:${err.message}`;
  }
  check(reason === "network", "offline → reason 'network'", reason);
  check(
    /check your connection/i.test(m.googleErrorMessage("network")),
    "offline: the connection sentence belongs here",
  );
}

// 8. The return URL the backend bounces to: read once, then erased.
{
  const m = await import(`${pathToFileURL(bare.out).href}?v=return`);
  const { win } = makeWindow("https://shadowquest.test", scenarios.healthy);
  win.location.hash = "#/login?sq_auth=ok&code=abc123";
  const first = m.readGoogleReturn();
  check(first.status === "pending" && first.code === "abc123", "return URL: code read", JSON.stringify(first));
  const second = m.readGoogleReturn();
  check(second.status === "none", "return URL: code erased after one read", JSON.stringify(second));
  check(
    !win.location.hash.includes("abc123"),
    "return URL: no code left in the address bar",
    win.location.hash,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n— the return leg: does a finished sign-in actually get you in? —");

// 9. THE REGRESSION. The backend bounces to `<origin>/#/login?sq_auth=ok&code=…`.
//    The shell used to match that fragment as an exact string, fail, and fall
//    back to the LANDING PAGE — so the gate that owns `readGoogleReturn` never
//    mounted, the one-time code expired unread, and an operator who had just
//    picked their account and pressed Continue was shown the sign-in screen
//    again with no error to explain it. In the APK the boot redirect then
//    rewrote the fragment and destroyed the code outright.
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=return-leg`);
  const BACK = "https://shadowquest.test/#/login?sq_auth=ok&code=handoff-return";
  const { win } = makeWindow("https://shadowquest.test", scenarios.healthy, { url: BACK });

  check(
    m.routeFromHash("#/login?sq_auth=ok&code=handoff-return") === "login",
    "the bounce URL routes to the GATE (this was 'home' — the bug)",
    m.routeFromHash("#/login?sq_auth=ok&code=handoff-return"),
  );
  check(m.routeFromHash("#/app/tasks?sq_auth=ok") === "app", "a phone sub-tab keeps its route through a query");
  check(m.routeFromHash("#/login") === "login", "plain #/login still routes to the gate");
  check(m.routeFromHash("#/") === "home", "the landing page is still the landing page");
  check(m.routeFromHash("#/app/field") === "field", "deep work still routes to field");
  check(m.hashForRoute("login") === "#/login", "hashForRoute agrees with routeFromHash");

  check(m.readHash() === "login", "a page loaded at the bounce URL renders the gate", m.readHash());
  check(m.hasGoogleReturn() === true, "the shell can see the pending return without spending it");

  const back = m.readGoogleReturn();
  check(
    back.status === "pending" && back.code === "handoff-return",
    "the gate redeems the code the backend left",
    JSON.stringify(back),
  );
  check(m.hasGoogleReturn() === false, "nothing pending afterwards — the shell is free to navigate again");
  check(!win.location.href.includes("handoff-return"), "the code is erased from the address bar", win.location.href);

  const out = await m.completeGoogleSignIn(back.code);
  check(out.user.email === "ada@example.com", "the session is the server's verified identity", out.user.email);
  check(
    m.currentUser()?.email === "ada@example.com",
    "the identity is written down: a refresh stays signed in",
    JSON.stringify(m.currentUser()),
  );
}

// 10. The same verdict parked in the query instead of the fragment — a host
//     that rewrites fragments must not strand the code either.
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=search-leg`);
  const { win } = makeWindow("https://shadowquest.test", scenarios.healthy, {
    url: "https://shadowquest.test/?sq_auth=ok&code=handoff-search#/login",
  });
  check(m.hasGoogleReturn() === true, "a return parked in ?search is seen too");
  const back = m.readGoogleReturn();
  check(back.status === "pending" && back.code === "handoff-search", "?search: code redeemed", JSON.stringify(back));
  check(!win.location.href.includes("handoff-search"), "?search: the code is erased", win.location.href);
  check(win.location.hash === "#/login", "?search: the route survives the clean-up", win.location.href);
}

// 11. Cancelling at Google must still land on a screen that can SAY so.
{
  const m = await import(`${pathToFileURL(pointed.out).href}?v=cancel-leg`);
  makeWindow("https://shadowquest.test", scenarios.healthy, {
    url: "https://shadowquest.test/#/login?sq_auth=cancelled",
  });
  check(m.readHash() === "login", "a cancelled return lands on the gate, not the landing page", m.readHash());
  const back = m.readGoogleReturn();
  check(back.status === "cancelled", "cancellation is reported as cancellation", JSON.stringify(back));
  check(m.hasGoogleReturn() === false, "cancellation leaves nothing pending");
}

await rm(bare.dir, { recursive: true, force: true });
await rm(pointed.dir, { recursive: true, force: true });

console.log(
  fail === 0
    ? `\nCLIENT AUTH PASS — ${pass} passed, 0 failed`
    : `\nCLIENT AUTH FAIL — ${pass} passed, ${fail} failed`,
);
process.exit(fail === 0 ? 0 : 1);
