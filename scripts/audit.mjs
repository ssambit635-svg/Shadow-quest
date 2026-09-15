/* audit.mjs — a crash + hardening probe against the REAL built bundle.
 *
 * Nothing here re-implements app logic. Every scenario boots dist/assets/index-*.js
 * inside a fresh happy-dom window, seeds localStorage with hostile or corrupt
 * state, drives the actual UI (clicks, input events, pointer events) and then
 * reports whether the app survived and what it wrote.
 *
 *   node scripts/audit.mjs            run every probe
 *   node scripts/audit.mjs squad auth run only the named probes
 *
 * Exit code is 1 when any probe reports FAIL, so it can sit in CI next to the
 * smoke scripts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const html = readFileSync("dist/index.html", "utf8");
const entry =
  /src="\/assets\/(index-[^"]+\.js)"/.exec(html)?.[1] ??
  readdirSync("dist/assets").find((f) => f.startsWith("index-") && f.endsWith(".js"));
if (!entry) {
  console.error("no built entry — run `npm run build` first");
  process.exit(2);
}
const BUNDLE = pathToFileURL(resolve("dist/assets", entry)).href;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The frame rate the harness rebacks requestAnimationFrame onto. */
const FRAME_MS = 16.7;

const results = [];
function record(probe, ok, detail) {
  results.push({ probe, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${probe} — ${detail}`);
}

let bootCount = 0;

/**
 * happy-dom answers every media query `false`, which would silently disable
 * the pointer-gated effects under test (the ink ripple, the wash, the tilt).
 * Evaluate the handful this app actually asks about instead.
 */
function installMatchMedia(win, { width, hover }) {
  const mq = (query) => {
    const q = query.trim();
    let matches = false;
    if (/max-width:\s*(\d+)px/.test(q)) matches = width <= Number(/max-width:\s*(\d+)px/.exec(q)[1]);
    if (/min-width:\s*(\d+)px/.test(q)) matches = width >= Number(/min-width:\s*(\d+)px/.exec(q)[1]);
    if (/hover:\s*hover/.test(q)) matches = matches || hover;
    if (/pointer:\s*fine/.test(q)) matches = matches || hover;
    if (/hover:\s*hover/.test(q) && /pointer:\s*fine/.test(q)) matches = hover;
    if (/prefers-reduced-motion:\s*reduce/.test(q)) matches = false;
    return {
      matches,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    };
  };
  win.matchMedia = mq;
}

/**
 * Boot one isolated page. `seed` runs against the window before the bundle is
 * imported, so corrupt storage is already in place when the app reads it.
 * `mutate` lets a probe break the storage API itself (private-mode behaviour).
 */
async function boot({ width = 420, height = 860, hash = "#/login", hover, seed, mutate } = {}) {
  const win = new Window({ url: `http://localhost/${hash}`, width, height });
  installMatchMedia(win, { width, hover: hover ?? width > 860 });
  bootCount += 1;

  // A no-op IntersectionObserver would be a lie: a real browser fires the
  // first callback on observe, and this app pauses its one idle loop on that
  // callback. Report "in view" so the app's own pause path actually runs.
  class IO {
    constructor(cb) {
      this.cb = cb;
      this.targets = new Set();
    }
    observe(el) {
      this.targets.add(el);
      this.cb(
        [
          {
            target: el,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: el.getBoundingClientRect?.() ?? {},
            intersectionRect: {},
            rootBounds: null,
            time: Date.now(),
          },
        ],
        this,
      );
    }
    unobserve(el) {
      this.targets.delete(el);
    }
    disconnect() {
      this.targets.clear();
    }
    takeRecords() {
      return [];
    }
  }
  win.IntersectionObserver = IO;
  win.ResizeObserver = win.ResizeObserver ?? IO;

  const errors = [];
  win.addEventListener("error", (e) => errors.push(String(e.message ?? e)));
  const origErr = console.error;

  const g = globalThis;
  g.window = win;
  g.document = win.document;
  for (const k of [
    "navigator",
    "localStorage",
    "sessionStorage",
    "location",
    "history",
    "matchMedia",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "getComputedStyle",
    "IntersectionObserver",
    "ResizeObserver",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "HashChangeEvent",
    "KeyboardEvent",
    "MouseEvent",
    "PointerEvent",
    "CustomEvent",
    "DOMParser",
    "MutationObserver",
    "getSelection",
    "innerWidth",
    "innerHeight",
    "devicePixelRatio",
    "scrollTo",
    "addEventListener",
    "removeEventListener",
  ]) {
    try {
      if (win[k] !== undefined) g[k] = win[k];
    } catch {
      /* read-only global */
    }
  }
  g.IntersectionObserver = IO;

  // Count rAF ticks so the idle-cost claim is a measurement, not an assertion.
  // Installed before the bundle loads so GSAP's ticker captures the wrapper.
  // happy-dom backs rAF with an unthrottled timer, so it spins at ~950k/s and
  // a raw tick count measures the runtime rather than the app. Reback it on a
  // real 16.7ms frame and the count becomes physical: callbacks per frame.
  // One permanent chain (GSAP's ticker) reads ~1; a pile of leaked loops
  // reads as many as there are chains.
  const raf = { count: 0, frames: 0, inFlight: 0, peak: 0 };
  const timers = new Set();
  const caught = [];
  win.requestAnimationFrame = (cb) => {
    raf.count += 1;
    raf.inFlight += 1;
    raf.peak = Math.max(raf.peak, raf.inFlight);
    const id = setTimeout(() => {
      timers.delete(id);
      raf.inFlight = Math.max(0, raf.inFlight - 1);
      // A browser logs a throwing rAF callback and keeps going. happy-dom has
      // no SVG transform matrix, so GSAP's SVG path throws here; swallowing it
      // matches the browser instead of killing the run.
      try {
        cb(win.performance?.now?.() ?? Date.now());
      } catch (e) {
        caught.push(String(e?.message ?? e));
      }
    }, FRAME_MS);
    timers.add(id);
    return id;
  };
  win.cancelAnimationFrame = (id) => {
    if (timers.delete(id)) raf.inFlight = Math.max(0, raf.inFlight - 1);
    clearTimeout(id);
  };
  // The globals snapshot above ran before the wrapper existed — refresh both.
  g.requestAnimationFrame = win.requestAnimationFrame;
  g.cancelAnimationFrame = win.cancelAnimationFrame;

  const root = win.document.createElement("div");
  root.id = "root";
  win.document.body.appendChild(root);

  // Catch anything React or a timer throws past the window error event.
  console.error = (...a) => {
    const s = a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ");
    if (/uncaught|cannot read|is not a function|NaN|undefined is not/i.test(s)) errors.push(s);
    origErr(...a);
  };

  try {
    seed?.(win);
    mutate?.(win);
  } catch (e) {
    console.error = origErr;
    throw e;
  }

  // Each boot must re-evaluate the bundle: a plain import URL is cached by
  // the ESM loader, so the second page would render nothing at all.
  await import(`${BUNDLE}?boot=${bootCount}`);
  await sleep(1500); // boot curtain + first paint

  const api = {
    win,
    errors,
    raf,
    /** Deduped rAF-callback throws — reported, not fatal. */
    rafErrors: () => [...new Set(caught)],
    q: (s) => win.document.querySelector(s),
    qa: (s) => [...win.document.querySelectorAll(s)],
    text: (s) => win.document.querySelector(s)?.textContent ?? null,
    sleep,
    /** React-controlled input: write through the prototype setter, then notify. */
    type(sel, value) {
      const el = win.document.querySelector(sel);
      if (!el) throw new Error(`no element at ${sel}`);
      const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
      set.call(el, value);
      el.dispatchEvent(new win.Event("input", { bubbles: true }));
      return el;
    },
    /** Drive the local (name+email+passphrase) sign-in form. */
    async signInLocal(name, email, password = "ProbePass123!") {
      const fields = win.document.querySelectorAll(".m-login__form .m-field input");
      if (fields.length < 3) throw new Error(`sign-in form has ${fields.length} inputs`);
      const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
      const put = (el, v) => {
        set.call(el, v);
        el.dispatchEvent(new win.Event("input", { bubbles: true }));
      };
      put(fields[0], name);
      put(fields[1], email);
      put(fields[2], password);
      await sleep(80);
      win.document.querySelector('.m-login__form button[type="submit"]')?.click();
      await sleep(1800);
    },
    go(hash) {
      win.location.hash = hash;
      win.dispatchEvent(new win.HashChangeEvent("hashchange"));
    },
  };
  api.stop = () => {
    console.error = origErr;
  };
  return api;
}

const probes = {};

/* ------------------------------------------------------------------ *
 * auth: hostile and oversize sign-in input
 * ------------------------------------------------------------------ */
probes.auth = async () => {
  const p = await boot();

  // 1. A 20k-character email must not be accepted and stored verbatim.
  await p.signInLocal("Probe", `a@${"x".repeat(20000)}.com`);
  const stored = p.win.localStorage.getItem("sq.user.v1");
  const parsed = stored ? JSON.parse(stored) : null;
  const len = parsed?.email?.length ?? 0;
  record(
    "auth/oversize-email",
    !parsed || len <= 254,
    parsed ? `stored email length ${len} (RFC 5321 cap is 254)` : "rejected before storage",
  );

  // 2. Markup and control characters in the name must never reach the DOM as
  //    anything but text, and must not survive into the identity record.
  const p2 = await boot();
  const payload = '<img src=x onerror="window.__pwned=1">';
  await p2.signInLocal(payload, "probe@local.device");
  const u = p2.win.localStorage.getItem("sq.user.v1");
  const injected = p2.win.document.querySelectorAll("img[src='x']").length;
  record(
    "auth/markup-name-inert",
    injected === 0 && p2.win.__pwned === undefined && !/<img/i.test(u ?? ""),
    injected
      ? `${injected} injected <img> in the DOM`
      : `no node injected, identity stored as ${JSON.stringify(JSON.parse(u ?? "{}").handle)}`,
  );

  // 3. A tampered identity record must not take the profile screen down.
  const p3 = await boot({
    hash: "#/app/profile",
    seed: (win) => {
      win.localStorage.setItem(
        "sq.user.v1",
        JSON.stringify({ handle: { evil: true }, email: "TAMPER@Example.COM", joinedAt: "not-a-date" }),
      );
    },
  });
  await p3.sleep(600);
  const mounted = Boolean(p3.q(".m-profile") || p3.q(".m-login") || p3.q(".m-app"));
  record(
    "auth/tampered-identity",
    mounted && !p3.errors.length,
    mounted
      ? `survived; screen=${p3.q(".m-profile") ? "profile" : p3.q(".m-login") ? "gate" : "app"}${
          p3.errors.length ? ` errors: ${p3.errors[0]}` : ""
        }`
      : `blank screen; ${p3.errors[0] ?? "no error captured"}`,
  );

  // 4. Case must not fork the data scope: TAMPER@X and tamper@x are one ledger.
  const upper = await scopeProbe("A@B.com");
  const lower = await scopeProbe("a@b.com");
  record("auth/scope-case-stable", upper === lower, `scope(A@B.com)=${upper} vs scope(a@b.com)=${lower}`);

  // 5. A browser that refuses storage (Safari private mode, disabled cookies)
  //    must not throw out of the sign-in path.
  const p5 = await boot({
    mutate: (win) => {
      const orig = win.localStorage.setItem.bind(win.localStorage);
      win.localStorage.setItem = (k, v) => {
        if (String(k).startsWith("sq.")) throw new win.DOMException("QuotaExceededError");
        return orig(k, v);
      };
    },
  });
  let threw = null;
  try {
    await p5.signInLocal("Blocked", "blocked@local.device");
  } catch (e) {
    threw = e;
  }
  record(
    "auth/storage-refused",
    !threw && !p5.errors.length,
    threw
      ? `sign-in threw: ${threw.message}`
      : p5.errors.length
        ? `error surfaced: ${p5.errors[0]}`
        : "sign-in path did not throw with storage disabled",
  );
};

/**
 * The data scope is whatever key fragment the running app hangs the ledger
 * off — read it back rather than re-deriving it, so the probe tests the real
 * `scopeOf`.
 */
async function scopeProbe(email) {
  const p = await boot({
    hash: "#/app/squad",
    seed: (win) => {
      win.localStorage.setItem(
        "sq.user.v1",
        JSON.stringify({ handle: "Probe", email, joinedAt: Date.now() }),
      );
    },
  });
  await p.sleep(700);
  const key = Object.keys(p.win.localStorage).find((k) => /^sq\.(profile|tasks|squad|friends)\./.test(k));
  p.stop();
  return key ? key.replace(/^sq\.[a-z]+\./, "") : "(none)";
}

/** Build the exact PBKDF2 record the app stores, so the harness can seed a
 *  device verifier it knows the password of. */
async function localPwRecord(password) {
  const { webcrypto } = await import("node:crypto");
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt, iterations: 210_000, hash: "SHA-256" },
    key,
    256,
  );
  const b64 = (u8) => Buffer.from(u8).toString("base64");
  return { v: 1, iters: 210_000, salt: b64(salt), hash: b64(new Uint8Array(bits)) };
}

/* ------------------------------------------------------------------ *
 * gate: the hard-password policy and the device verifier
 * ------------------------------------------------------------------ */
probes.gate = async () => {
  // 1. A weak password never leaves the form: no identity, one clear line.
  const p = await boot();
  await p.signInLocal("Weak", "weak@local.device", "weak");
  const stored = p.win.localStorage.getItem("sq.user.v1");
  const err = p.text(".m-login__err");
  record(
    "gate/weak-password-refused",
    !stored && /passphrase/i.test(err ?? ""),
    stored ? "weak password created an identity" : err ? `refused: "${err}"` : "no error line",
  );
  p.stop();

  // 2. The device verifier: the wrong key stays out, the right key opens.
  const email = "gate@local.device";
  const scope = email.replace(/[^a-z0-9]/g, "");
  const password = "RightKey#42x!";
  const rec = await localPwRecord(password);
  const p2 = await boot({
    seed: (win) => {
      win.localStorage.setItem(`sq.pw.${scope}`, JSON.stringify(rec));
    },
  });
  await p2.signInLocal("Gate", email, "WrongKey#42x!");
  const afterWrong = p2.win.localStorage.getItem("sq.user.v1");
  const err2 = p2.text(".m-login__err");
  record(
    "gate/wrong-password-refused",
    !afterWrong && /passphrase/i.test(err2 ?? ""),
    afterWrong ? "wrong password opened the ledger" : err2 ? `refused: "${err2}"` : "no error line",
  );
  await p2.signInLocal("Gate", email, password);
  const afterRight = p2.win.localStorage.getItem("sq.user.v1");
  record(
    "gate/right-password-opens",
    Boolean(afterRight) && !p2.errors.length,
    afterRight ? "identity stored with the right key" : "right key did not open the ledger",
  );
  p2.stop();
};

/* ------------------------------------------------------------------ *
 * admin: the control panel is closed to everyone but the owner
 * ------------------------------------------------------------------ */
probes.admin = async () => {
  // 1. A plain operator sees the sealed gate — no console, nothing else.
  const p = await boot({
    hash: "#/app/admin",
    width: 1280,
    height: 900,
    seed: (win) => {
      win.localStorage.setItem(
        "sq.user.v1",
        JSON.stringify({ handle: "Oper", email: "oper@local.device", joinedAt: Date.now() }),
      );
    },
  });
  await p.sleep(900);
  const sealed = Boolean(p.q(".admin__seal")) && !p.q(".admin__pin") && !p.q(".admin__grid");
  record(
    "admin/non-admin-sealed",
    sealed && !p.errors.length,
    sealed
      ? "sealed notice only — no gate, no console"
      : `unexpected surface: ${p.errors[0] ?? "console or gate rendered"}`,
  );
  p.stop();

  // 2. A locally-tampered admin role cannot open the console — the backend
  //    (away, here) is what mints access, so the PIN gate must stand.
  const p2 = await boot({
    hash: "#/app/admin",
    width: 1280,
    height: 900,
    seed: (win) => {
      win.localStorage.setItem(
        "sq.user.v1",
        JSON.stringify({
          handle: "Owner",
          email: "owner@local.device",
          joinedAt: Date.now(),
          role: "admin",
        }),
      );
    },
  });
  await p2.sleep(900);
  const pinGate = Boolean(p2.q(".admin__pin"));
  const noConsole = !p2.q(".admin__grid");
  record(
    "admin/tampered-role-still-pin-gated",
    pinGate && noConsole && !p2.errors.length,
    pinGate
      ? "PIN gate stands; console closed"
      : `tampered role opened something: ${p2.errors[0] ?? "console rendered"}`,
  );
  // A PIN with the backend away: honest refusal, no crash, no console.
  const input = p2.q(".admin__pin-form input");
  if (input) {
    const set = Object.getOwnPropertyDescriptor(p2.win.HTMLInputElement.prototype, "value").set;
    set.call(input, "12345678");
    input.dispatchEvent(new p2.win.Event("input", { bubbles: true }));
    p2.q('.admin__pin-form button[type="submit"]')?.click();
  }
  await p2.sleep(800);
  const err = p2.text(".admin__pin-err");
  record(
    "admin/pin-offline-honest",
    /unreachable/i.test(err ?? "") && !p2.q(".admin__grid"),
    err ? `refused honestly: "${err}"` : "no honest offline refusal",
  );
  p2.stop();
};

/* ------------------------------------------------------------------ *
 * squad: corrupt formation data
 * ------------------------------------------------------------------ */
probes.squad = async () => {
  const email = "squadprobe@local.device";
  const scope = email.replace(/[^a-z0-9]/g, "");

  const shapes = {
    "members-are-numbers": JSON.stringify({ name: "Bad", members: [1, 2, 3] }),
    "member-missing-name": JSON.stringify({
      name: "Bad",
      members: [{ id: "x", role: "captain" }],
    }),
    "members-not-array": JSON.stringify({ name: "Bad", members: { a: 1 } }),
    "not-even-json": "}{ nope",
  };

  for (const [label, raw] of Object.entries(shapes)) {
    const p = await boot({
      hash: "#/app/squad",
      seed: (win) => {
        win.localStorage.setItem(
          "sq.user.v1",
          JSON.stringify({ handle: "Probe", email, joinedAt: Date.now() }),
        );
        win.localStorage.setItem(`sq.squad.${scope}`, raw);
      },
    });
    await p.sleep(700);
    const rendered = Boolean(p.q(".m-squad"));
    const slots = p.qa(".m-slot").length;
    record(
      `squad/corrupt:${label}`,
      rendered && !p.errors.length,
      rendered
        ? `.m-squad rendered with ${slots} formation slots`
        : `screen did not render; ${p.errors[0] ?? "no error captured"}`,
    );
    p.stop();
  }

  // The healthy path still has to work: four slots, operator present, one
  // member per slot.
  const p = await boot({
    hash: "#/app/squad",
    seed: (win) => {
      win.localStorage.setItem(
        "sq.user.v1",
        JSON.stringify({ handle: "Probe", email, joinedAt: Date.now() }),
      );
    },
  });
  await p.sleep(700);
  const slots = p.qa(".m-slot");
  const roles = slots.map((s) => s.querySelector(".m-slot__role")?.textContent.trim());
  const reachable = Boolean(p.q(".m-squad")) && slots.length === 4;
  record(
    "squad/formation-present",
    reachable && Boolean(p.q(".m-mem.is-self")),
    `${slots.length} slots [${roles.join(" / ")}], operator ${
      p.q(".m-mem.is-self") ? "present" : "MISSING"
    }`,
  );
  p.stop();
};

/* ------------------------------------------------------------------ *
 * circle: the ensō clock under a corrupt persisted session
 * ------------------------------------------------------------------ */
probes.circle = async () => {
  const email = "ringprobe@local.device";
  const seedUser = (win) =>
    win.localStorage.setItem(
      "sq.user.v1",
      JSON.stringify({ handle: "Probe", email, joinedAt: Date.now() }),
    );

  const corrupt = JSON.stringify({
    techniqueId: "pomodoro",
    phase: "focus",
    cycle: "x",
    running: true,
    // every numeric field deliberately absent or wrong-typed
    phaseLenMs: null,
    phaseEndsAt: "soon",
    pausedMs: null,
    focusMs: "lots",
    log: "not-an-array",
  });

  const p = await boot({
    hash: "#/app/field",
    width: 1280,
    height: 900,
    seed: (win) => {
      seedUser(win);
      win.localStorage.setItem("sq.session.v2", corrupt);
    },
  });
  await p.sleep(1200);
  const ring = p.q(".sring");
  const time = p.text(".sring__time");
  const value = p.q(".sring__value");
  const dash = value?.getAttribute("stroke-dashoffset");
  const sane =
    Boolean(ring) &&
    /^\d{2}:\d{2}$|^完$/.test(time ?? "") &&
    (dash === null || !Number.isNaN(Number(dash)));
  record(
    "circle/ensō-corrupt-session",
    sane && !p.errors.length,
    ring
      ? `ring rendered, time="${time}", stroke-dashoffset=${dash}${
          p.errors.length ? `, errors: ${p.errors[0]}` : ""
        }`
      : `no ring; ${p.errors[0] ?? "no error captured"}`,
  );
  p.stop();

  // A healthy session must fill the arc and read a real clock.
  const p2 = await boot({ hash: "#/app/field", width: 1280, height: 900, seed: seedUser });
  await p2.sleep(900);
  p2.q('[data-tech="pomodoro"]')?.click();
  await p2.sleep(200);
  p2.q(".pick__go button")?.click();
  await p2.sleep(800);
  const t2 = p2.text(".sring__time");
  const dash2 = p2.q(".sring__value")?.getAttribute("stroke-dashoffset");
  record(
    "circle/ensō-healthy",
    Boolean(p2.q(".sring")) && /^\d{2}:\d{2}$/.test(t2 ?? "") && !Number.isNaN(Number(dash2)),
    `time="${t2}", stroke-dashoffset=${dash2}`,
  );
  p2.stop();

  // Radar rings on the character sheet must survive a zeroed profile.
  const p3 = await boot({
    hash: "#/app/progress",
    seed: (win) => {
      seedUser(win);
      win.localStorage.setItem(
        `sq.profile.${email.replace(/[^a-z0-9]/g, "")}`,
        JSON.stringify({ factors: null, totalProgress: null }),
      );
    },
  });
  await p3.sleep(700);
  const radar = p3.q(".m-radar");
  const rings = p3.qa(".m-radar__ring").length;
  const pts = p3.qa(".m-radar__ring").map((r) => r.getAttribute("points"));
  const nanPts = pts.some((s) => /NaN/.test(s ?? ""));
  record(
    "circle/radar-null-profile",
    Boolean(radar) && rings === 4 && !nanPts && !p3.errors.length,
    radar
      ? `${rings} rings, points ${nanPts ? "contain NaN" : "all finite"}`
      : `no radar; ${p3.errors[0] ?? "no error captured"}`,
  );
  p3.stop();
};

/* ------------------------------------------------------------------ *
 * motion: the click ring under a burst, and what idle actually costs
 *
 * GSAP is a shared, cached chunk, so every boot in a process adds tweens to
 * the same global timeline — and tweens whose targets belong to a window that
 * is already gone still keep the ticker busy. Measured alongside other boots,
 * that pollution reads as the page's own idle cost (it inflated one
 * measurement here from ~1.5 to ~19 callbacks per frame). So each measurement
 * below runs alone, in its own process, and reports back.
 * ------------------------------------------------------------------ */

/**
 * How many animation chains are alive when nobody is touching the page?
 *
 * Reported as rAF callbacks *per frame*, which is the physical quantity: a
 * single permanent loop reads about 1, and every leaked or forgotten loop adds
 * another. Two equal windows back to back also show whether work is still
 * finishing or has settled.
 */
async function idleGrowth(p, windowMs = 700) {
  await p.sleep(windowMs); // let entry animations run down
  const a0 = p.raf.count;
  await p.sleep(windowMs);
  const a1 = p.raf.count;
  await p.sleep(windowMs);
  const a2 = p.raf.count;
  const frames = windowMs / FRAME_MS;
  return { first: (a1 - a0) / frames, second: (a2 - a1) / frames };
}

const MOTION_STEPS = ["motion:ripple", "motion:landing", "motion:phone"];

probes.motion = async () => {
  if (process.env.SQ_AUDIT_STEP) return; // we ARE the isolated child
  for (const step of MOTION_STEPS) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), step], {
      env: { ...process.env, SQ_AUDIT_STEP: step },
      encoding: "utf8",
    });
    const out = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
    const lines = out.split("\n").filter((l) => /^(ok|FAIL)\s/.test(l));
    if (!lines.length) {
      record(step, false, `isolated run produced no result:\n${out.slice(0, 500)}`);
      continue;
    }
    for (const line of lines) {
      const m = /^(ok|FAIL)\s+(\S+)\s+—\s+(.*)$/.exec(line);
      if (m) record(m[2], m[1] === "ok", m[3]);
    }
  }
};

probes["motion:ripple"] = async () => {
  const p = await boot({ width: 1280, height: 900, hash: "#/", hover: true });

  const before = p.qa(".ink-ripple").length;
  for (let i = 0; i < 400; i++) {
    p.win.dispatchEvent(
      new p.win.MouseEvent("pointerdown", { clientX: 100 + (i % 50), clientY: 200, button: 0 }),
    );
  }
  await p.sleep(900);
  const after = p.qa(".ink-ripple").length;
  // `after <= 1` only means something if the effect actually attached; assert
  // the ring was really created, so this cannot pass by never running.
  record(
    "motion/ripple-no-leak",
    after === 1 && !p.errors.length,
    `${before} ripple node(s) before, ${after} after 400 clicks — pooled to one as designed`,
  );
  p.stop();
};

probes["motion:landing"] = async () => {
  const p = await boot({ width: 1280, height: 900, hash: "#/", hover: true });
  const landing = await idleGrowth(p);
  record(
    "motion/landing-idle",
    !p.errors.length && landing.second < 8,
    `${landing.second.toFixed(1)} rAF callback(s) per frame while idle on the landing page — this is the one surface with deliberate infinite loops (the ink under the field, the marquee)`,
  );
  p.stop();
};

probes["motion:phone"] = async () => {
  // The phone face is the surface that has to be cheap: it is the one that
  // runs inside a WebView on a mid-range handset. It contains no
  // requestAnimationFrame and no infinite tween of its own, so idle cost there
  // must be GSAP's single ticker plus at most one chain, and no more.
  const email = "motionprobe@local.device";
  const m = await boot({
    hash: "#/app",
    seed: (win) => {
      win.localStorage.setItem(
        "sq.user.v1",
        JSON.stringify({ handle: "Probe", email, joinedAt: Date.now() }),
      );
    },
  });
  const phone = await idleGrowth(m);
  const rafErrors = m.rafErrors();
  record(
    "motion/phone-face-idle",
    phone.second <= 3 && !m.errors.length && !rafErrors.length,
    `${phone.second.toFixed(1)} rAF callback(s) per frame while idle inside the signed-in app — GSAP's ticker plus one chain is the whole budget${
      m.errors.length || rafErrors.length
        ? `, errors: ${(m.errors[0] ?? rafErrors[0]).slice(0, 120)}`
        : ""
    }`,
  );
  m.stop();
};

/* ------------------------------------------------------------------ *
 * landing: the hero's black hole degrades instead of breaking the page
 * ------------------------------------------------------------------ */
probes["landing:void"] = async () => {
  // 1440px is above the component's mount breakpoint, so the real path runs:
  // request a context, probe the renderer, build five shaders. This harness has
  // no canvas context at all, which is exactly the machine the fallback exists
  // for — the hero must lose the backdrop and keep every other thing, quietly.
  const p = await boot({ width: 1440, height: 900, hash: "#/", hover: true });

  const box = p.q(".hero__void");
  const host = p.q(".hero__hole");
  const canvas = p.q(".blackhole__canvas");
  const headline = p.q("[data-hero-title]")?.textContent ?? "";
  const hidden = canvas
    ? (canvas.style.display || p.win.getComputedStyle(canvas).display) === "none"
    : false;
  const why = host?.dataset.blackhole ?? "";

  record(
    "landing/void-fallback",
    Boolean(box && host && canvas) && hidden && why === "unsupported" &&
      /Real action\.[\s\S]*Real growth\./.test(headline) && !p.errors.length,
    canvas
      ? `hole mounted, canvas hidden (data-blackhole="${why || "—"}"), ` +
        `headline intact, ${p.errors.length} page error(s)`
      : "the void was never mounted — the hero's right half is empty again",
  );
  p.stop();
};

/* ------------------------------------------------------------------ *
 * weight: what actually ships
 * ------------------------------------------------------------------ */
probes.weight = async () => {
  const { statSync } = await import("node:fs");
  const assets = readdirSync("dist/assets");
  let js = 0;
  let css = 0;
  for (const f of assets) {
    const s = statSync(resolve("dist/assets", f)).size;
    if (f.endsWith(".js")) js += s;
    if (f.endsWith(".css")) css += s;
  }
  const jsKb = Math.round(js / 1024);
  const cssKb = Math.round(css / 1024);
  record(
    "weight/bundle",
    jsKb < 700 && cssKb < 200,
    `js ${jsKb} kB + css ${cssKb} kB across ${assets.length} assets`,
  );
};

/* ------------------------------------------------------------------ */

const wanted = process.argv.slice(2);
const names = wanted.length
  ? wanted
  : Object.keys(probes).filter((n) => !n.startsWith("motion:"));
for (const n of names) {
  if (!probes[n]) {
    console.error(`unknown probe "${n}" — have: ${Object.keys(probes).join(", ")}`);
    process.exit(2);
  }
  console.log(`\n--- ${n} ---`);
  try {
    await probes[n]();
  } catch (e) {
    record(`${n}/harness`, false, `probe threw: ${e.message}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} probes passed`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.probe).join(", "));
  process.exit(1);
}
process.exit(0);
