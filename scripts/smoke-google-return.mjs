/* smoke-google-return.mjs — the return leg, through the REAL app shell.
 *
 * smoke-oauth.mjs proves the backend verifies Google's ID token and bounces
 * the browser back with a one-time code. smoke-google-client.mjs proves the
 * client modules read that code and trade it for a session. Neither one proves
 * the two halves MEET: that a page loaded at the address the backend bounces
 * to actually signs the operator in and carries them inside.
 *
 * That gap is where the bug lived. The bounce lands on
 *
 *     https://host/#/login?sq_auth=ok&code=<handoff>
 *
 * and the shell's route reader matched fragments by exact string, so it read
 * that as the LANDING PAGE. The gate — the only component that redeems the
 * code — never mounted. The operator had chosen their Google account, pressed
 * Continue, been verified by the backend, and been shown the sign-in screen
 * again with no error anywhere. Inside the APK the boot redirect then rewrote
 * the fragment and destroyed the code outright.
 *
 * So this script renders the shipping App.tsx in a window whose address is
 * exactly that bounce URL, with a scripted network, and asserts where the
 * operator ends up. Nothing here re-implements the flow.
 *
 * Run it with `npm run smoke:return`.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ESBUILD = join(ROOT, "node_modules", ".bin", "esbuild");
const API = "https://api.shadowquest.test";
const APP = "https://shadowquest.test";
/** The address the backend's 302 leaves the browser on. */
const BOUNCE = `${APP}/#/login?sq_auth=ok&code=handoff-e2e`;

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

/** Bundle the real shell: App.tsx and the renderer it needs, one React copy. */
async function bundleApp() {
  // Inside the repo, so esbuild resolves react/react-dom/gsap from the very
  // node_modules the app itself builds against.
  await mkdir(join(ROOT, "node_modules", ".cache"), { recursive: true });
  const dir = await mkdtemp(join(ROOT, "node_modules", ".cache", "sq-return-"));
  const entry = join(dir, "entry.tsx");
  await writeFile(
    entry,
    [
      `export { default as App } from "${join(ROOT, "src/App.tsx")}";`,
      `export { createElement, act } from "react";`,
      `export { createRoot } from "react-dom/client";`,
      `export { currentUser } from "${join(ROOT, "src/lib/auth.ts")}";`,
      `export { readHash } from "${join(ROOT, "src/lib/route.ts")}";`,
      `export {`,
      `  hasGoogleReturn,`,
      `  signedInGoogleProfile,`,
      `} from "${join(ROOT, "src/lib/googleAuth.ts")}";`,
      `export { initMotion } from "${join(ROOT, "src/lib/motion.ts")}";`,
      `export { isNativeApp } from "${join(ROOT, "src/lib/native.ts")}";`,
    ].join("\n"),
  );
  const out = join(dir, "bundle.mjs");
  execFileSync(
    ESBUILD,
    [
      entry,
      "--bundle",
      "--format=esm",
      "--platform=browser",
      "--jsx=automatic",
      "--loader:.css=empty",
      `--outfile=${out}`,
      "--log-level=error",
      // Development React: the production build does not export `act`, and
      // `act` is what makes the shell's async redirects deterministic here.
      `--define:process.env.NODE_ENV="development"`,
      `--define:import.meta.env={"VITE_API_BASE_URL":${JSON.stringify(API)}}`,
    ],
    { stdio: "inherit" },
  );
  return { out, dir };
}

/**
 * A window parked on `url`, with a scripted network. `calls` records every
 * request so the test can say what the shell actually did.
 */
function makeWindow(url, answer, { native = false, width = 1280 } = {}) {
  const win = new Window({ url, width, height: 900 });
  if (native) win.Capacitor = { isNativePlatform: () => true };
  const calls = [];
  win.fetch = async (input, init = {}) => {
    const u = String(typeof input === "string" ? input : input.url);
    calls.push({ url: u, method: (init.method ?? "GET").toUpperCase() });
    const res = await answer(u, init);
    if (res instanceof Error) throw res;
    return res;
  };
  win.document.body.innerHTML = '<div id="root"></div>';
  // The boot curtain is a film; this test is about routing. Mark it seen.
  win.sessionStorage.setItem("sq.boot.seen.v3", "1");
  // happy-dom leaves a few browser APIs unimplemented, and GSAP/the shell ask
  // for them. Stubs, not reimplementations — none of them decide a route.
  if (typeof win.scrollTo !== "function") win.scrollTo = () => {};
  win.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  win.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };

  globalThis.window = win;
  globalThis.document = win.document;
  // Node 22 ships its own getter-only `navigator`; redefine rather than assign.
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: win.navigator,
      configurable: true,
      writable: true,
    });
  } catch {
    /* Node's own navigator is close enough for a routing test. */
  }
  globalThis.location = win.location;
  globalThis.history = win.history;
  globalThis.localStorage = win.localStorage;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.fetch = win.fetch;
  globalThis.URLSearchParams = win.URLSearchParams;
  globalThis.Response = win.Response;
  globalThis.Event = win.Event;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.HashChangeEvent = win.HashChangeEvent;
  globalThis.requestAnimationFrame = (cb) => win.requestAnimationFrame(cb);
  globalThis.cancelAnimationFrame = (id) => win.cancelAnimationFrame(id);
  globalThis.getComputedStyle = (el) => win.getComputedStyle(el);
  globalThis.ResizeObserver = win.ResizeObserver;
  globalThis.IntersectionObserver = win.IntersectionObserver;
  // GSAP and React DOM both reach for constructor globals by bare name.
  for (const key of [
    "Node",
    "Element",
    "HTMLElement",
    "SVGElement",
    "Document",
    "DocumentFragment",
    "HTMLCanvasElement",
    "MouseEvent",
    "PointerEvent",
    "KeyboardEvent",
    "DOMParser",
    "matchMedia",
  ]) {
    if (typeof win[key] !== "undefined") globalThis[key] = win[key];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return { win, calls };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Backend up, Google live, the handoff code valid exactly once. */
function network({ spentAfter = 1 } = {}) {
  let redemptions = 0;
  return (url) => {
    if (url.includes("/v1/auth/providers")) return json(200, { password: true, google: true });
    if (url.includes("/v1/auth/google/exchange")) {
      redemptions += 1;
      if (redemptions > spentAfter) return json(401, { error: "sign in again" });
      return json(200, {
        token: "t-e2e",
        mode: "created",
        user: { email: "ada@example.com", handle: "Ada", picture: "", role: "operator" },
      });
    }
    if (url.includes("/v1/health")) return json(200, { ok: true });
    return json(200, {});
  };
}

/** Pump the event loop inside `act` until `done()` or the budget runs out. */
async function settle(act, done, budgetMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (done()) return true;
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  }
  return done();
}

/* ------------------------------------------------------------------ */

console.log("— bundling the real shell (App.tsx) —");
const app = await bundleApp();

// 1. THE WHOLE POINT. A page load at the backend's bounce address must end
//    with the operator inside the ledger — not back at the sign-in screen.
{
  const m = await import(`${pathToFileURL(app.out).href}?v=web`);
  const { win, calls } = makeWindow(BOUNCE, network());
  m.initMotion();

  check(m.readHash() === "login", "the bounce address reads as the gate", m.readHash());
  check(m.hasGoogleReturn() === true, "and the shell can see the code waiting in it");

  const root = m.createRoot(win.document.getElementById("root"));
  await m.act(async () => {
    root.render(m.createElement(m.App));
  });

  const arrived = await settle(m.act, () => win.location.hash === "#/app" && m.currentUser() !== null);
  const who = m.currentUser();

  check(arrived, "the operator is carried INSIDE (#/app) after the redirect", win.location.hash);
  check(who?.email === "ada@example.com", "signed in as the identity the server verified", who?.email ?? "nobody");
  check(
    calls.some((c) => c.url.startsWith(`${API}/v1/auth/google/exchange`) && c.method === "POST"),
    "the handoff code was actually redeemed against the API",
    calls.map((c) => `${c.method} ${c.url}`).join(", "),
  );
  check(!win.location.href.includes("handoff-e2e"), "no code left in the address bar", win.location.href);
  check(m.hasGoogleReturn() === false, "nothing pending once the session exists");
  check(
    m.signedInGoogleProfile()?.email === "ada@example.com",
    "Profile can show the Google identity afterwards",
    JSON.stringify(m.signedInGoogleProfile()),
  );

  await m.act(async () => root.unmount());
}

// 2. The same landing inside the APK, where a boot redirect used to rewrite
//    the fragment and delete the code before anything could read it.
{
  const m = await import(`${pathToFileURL(app.out).href}?v=apk`);
  const { win } = makeWindow("https://localhost/#/login?sq_auth=ok&code=handoff-apk", network(), {
    native: true,
    width: 412,
  });
  m.initMotion();
  const root = m.createRoot(win.document.getElementById("root"));
  await m.act(async () => {
    root.render(m.createElement(m.App));
  });
  const arrived = await settle(m.act, () => win.location.hash.startsWith("#/app") && m.currentUser() !== null);
  check(arrived, "APK: the WebView comes back from Google and lands in the ledger", win.location.hash);
  check(m.currentUser()?.email === "ada@example.com", "APK: signed in as the server's identity", m.currentUser()?.email ?? "nobody");
  await m.act(async () => root.unmount());
}

// 3. A spent code must be REPORTED, and must not strand the operator on a
//    screen that says nothing: the gate stays up with a sentence.
{
  const m = await import(`${pathToFileURL(app.out).href}?v=spent`);
  const { win } = makeWindow(BOUNCE, network({ spentAfter: 0 }));
  m.initMotion();
  const root = m.createRoot(win.document.getElementById("root"));
  await m.act(async () => {
    root.render(m.createElement(m.App));
  });
  await settle(m.act, () => !m.hasGoogleReturn(), 3000);
  const text = win.document.body.textContent ?? "";
  check(m.currentUser() === null, "a refused code signs nobody in", JSON.stringify(m.currentUser()));
  check(win.location.hash === "#/login", "and the operator stays on the gate", win.location.hash);
  check(
    /expired|again/i.test(text),
    "the gate says why, in words",
    text.replace(/\s+/g, " ").slice(0, 160),
  );
  await m.act(async () => root.unmount());
}

// 4. No return in the URL → the landing page, exactly as before. The fix must
//    not drag strangers to the gate.
{
  const m = await import(`${pathToFileURL(app.out).href}?v=plain`);
  const { win } = makeWindow(`${APP}/`, network());
  m.initMotion();
  const root = m.createRoot(win.document.getElementById("root"));
  await m.act(async () => {
    root.render(m.createElement(m.App));
  });
  await m.act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
  check(m.readHash() === "home", "a plain load still lands on the landing page", m.readHash());
  check(m.currentUser() === null, "and nobody is signed in by accident");
  await m.act(async () => root.unmount());
}

await rm(app.dir, { recursive: true, force: true });

console.log(
  fail === 0
    ? `\nRETURN LEG PASS — ${pass} passed, 0 failed`
    : `\nRETURN LEG FAIL — ${pass} passed, ${fail} failed`,
);
process.exit(fail === 0 ? 0 : 1);
