/**
 * ShadowQuest backend — Express entry.
 *
 * Real people, real data: every operator that signs in gets a document, the
 * frontend pushes its ledger (profile + tasks + habits) here, and the
 * leaderboard, stats and people roster are read back from what was actually
 * stored. No seeded rows, no demo people.
 *
 * Security posture (see docs/SECURITY.md for the full audit):
 *   · passwords are scrypt-hashed server-side, verified in constant time,
 *     never logged and never returned to the client
 *   · sign-in / sign-up are rate-limited per IP and per address, and the
 *     total user count is capped by SQ_MAX_USERS
 *   · every authed write is rate-limited per token
 *   · the admin surface is double-gated (ADMIN_EMAILS + ADMIN_PIN) and every
 *     admin route fails closed when it is not configured
 *   · all errors answer with a generic body — internals never leak
 *
 * Endpoints (all JSON):
 *   GET  /v1/health                        — liveness + which store is active
 *   POST /v1/auth/signin                   — sign in / sign up with password
 *   GET  /v1/auth/google/start             — begin real Google OAuth (302)
 *   GET  /v1/auth/google/callback          — Google's redirect back here
 *   POST /v1/auth/google/exchange          — trade the one-time code for a session
 *   GET  /v1/auth/providers                — which sign-in methods are live
 *   GET  /v1/ledger                        — the operator's stored ledger     (auth)
 *   PUT  /v1/ledger                        — replace the operator's ledger    (auth)
 *   GET  /v1/stats                         — aggregated stats for the operator(auth)
 *   GET  /v1/leaderboard                   — real operators, ranked
 *   GET  /v1/people                        — other registered operators       (auth)
 *   POST /v1/admin/elevate                 — PIN gate for the admin panel     (auth+role)
 *   GET  /v1/admin/overview                — control panel numbers            (admin)
 *   GET  /v1/admin/users                   — operator directory + search      (admin)
 *   DELETE /v1/admin/users/:email          — remove an operator               (admin)
 *   POST /v1/admin/sessions/revoke-all     — kill every active session        (admin)
 */
// Must be the first import: it puts a local `.env` into process.env before
// anything below reads it (admin, google, store, PORT).
import "./env.mjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createStore, publicUser } from "./store.mjs";
import {
  leaderRow,
  personOf,
  sanitizeLedger,
  statsFor,
} from "./engine.mjs";
import { adminConfig, adminVault, isAdminEmail, pinMatches, roleOf } from "./admin.mjs";
import {
  beginAuth,
  exchangeCode,
  googleConfig,
  mintHandoff,
  profileFromClaims,
  resolveReturn,
  takeHandoff,
  takePending,
  verifyIdToken,
} from "./google.mjs";
import {
  hashPassword,
  limiter,
  passwordProblems,
  passwordValid,
  refused,
  verifyPassword,
} from "./security.mjs";

const PORT = Number(process.env.PORT ?? 8788);
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Single-service production: with SQ_SERVE_WEB=1 this process also serves the
 * built web app (repo `dist/`), so one host answers both `/` (the page) and
 * the API. That is the whole Render deployment — see render.yaml.
 *
 * Unset (dev, `npm run dev`, the smoke scripts) the process stays API-only
 * and behaves exactly as before: the dev/preview servers own the page and
 * proxy `/api` here.
 */
const SERVE_WEB = process.env.SQ_SERVE_WEB === "1";
const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "dist",
);
const WEB_READY = SERVE_WEB && existsSync(path.join(WEB_ROOT, "index.html"));
if (SERVE_WEB && !WEB_READY) {
  console.warn(
    `[web] SQ_SERVE_WEB=1 but ${WEB_ROOT} has no index.html — ` +
      "API-only mode. Run `npm run build` first.",
  );
}

const admin = adminConfig();
if (!admin.enabled) {
  console.warn(
    "[admin] ADMIN_EMAILS / ADMIN_PIN not configured — the control panel stays closed",
  );
} else {
  console.log(`[admin] control panel enabled for ${[...admin.emails].join(", ")}`);
}

const google = googleConfig();
if (!google.enabled) {
  console.warn(
    "[google] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL not configured — " +
      "\"Continue with Google\" stays closed (email + password is unaffected)",
  );
} else {
  console.log(`[google] OAuth enabled — callback ${google.callbackUrl}`);
  if (!google.appOrigins.length) {
    console.warn(
      "[google] SQ_APP_ORIGIN not set — post-login redirects are limited to localhost. " +
        "Set it in production.",
    );
  }
}

const store = await createStore();

const app = express();
app.disable("x-powered-by");
// Rate limiting keys off req.ip — honour a trusted proxy when told to.
app.set("trust proxy", process.env.SQ_TRUST_PROXY === "1" ? 1 : false);

/**
 * Answer the API under both `/v1/*` and `/api/v1/*`.
 *
 * Web builds without VITE_API_BASE_URL call the relative `/api` prefix: in
 * dev the vite proxy strips it before forwarding, but single-service
 * production (SQ_SERVE_WEB=1) has no proxy in front — the strip happens
 * here instead. Clients pointed at an API origin (APK builds, direct API
 * users) call `/v1/*` at the root and pass through untouched.
 */
app.use((req, _res, next) => {
  if (req.url === "/api" || req.url.startsWith("/api/")) {
    req.url = req.url.slice(4) || "/";
  }
  next();
});

/* CORS: open by default (dev / APK builds that talk cross-origin), locked to
 * an explicit allowlist the moment SQ_CORS_ORIGIN is set.
 *
 * The installed APK is always included: its WebView serves the bundle from
 * https://localhost, so that is the Origin every one of its requests carries.
 * Locking CORS to the website's domain alone silently breaks the app — the
 * exchange POST is refused by the browser and the operator is told to check
 * their connection. Same list as SQ_NATIVE_ORIGIN, so `off` turns both off.
 */
const corsOrigins = (process.env.SQ_CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (corsOrigins.length) {
  const withShell = [...new Set([...corsOrigins, ...google.nativeOrigins])];
  console.log(`[cors] restricted to ${withShell.join(", ")}`);
  app.use(
    cors({
      origin: withShell,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );
} else {
  app.use(cors());
}
app.use(express.json({ limit: "512kb" }));

/* ------------------------------------------------------------------ *
 * limits — fixed windows, per key
 * ------------------------------------------------------------------ */

const signinByIp = limiter(12, 10 * 60_000); // 12 sign-in attempts / 10 min / IP
const failedPwByEmail = limiter(8, 15 * 60_000); // 8 wrong passwords / 15 min / address
const ledgerByToken = limiter(120, 60_000); // ledger pushes / min / token
const adminByIp = limiter(30, 5 * 60_000); // admin calls / 5 min / IP
const oauthByIp = limiter(20, 10 * 60_000); // Google authorizations / 10 min / IP

const ipOf = (req) => req.ip || req.socket?.remoteAddress || "unknown";
const tokenKey = (req) => `t:${req.user?.token ?? ""}`;

/* ------------------------------------------------------------------ *
 * auth — bearer token issued at sign-in
 * ------------------------------------------------------------------ */

async function authed(req, res, next) {
  // `x-sq-token` wins when present: admin calls carry BOTH identities —
  // the operator token here and the admin token in Authorization. Plain
  // operator calls carry only the Bearer token, which this still accepts.
  const header = req.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = req.get("x-sq-token") || bearer;
  const user = await store.byToken(token);
  if (!user) {
    return res.status(401).json({ error: "sign in again" });
  }
  req.user = user;
  await store.touch(user.email).catch(() => undefined);
  next();
}

/** Admin routes: a signed-in operator whose email is listed AND who holds a
 *  live admin token minted by the PIN gate. Fails closed, always. */
async function adminOnly(req, res, next) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const ipLimit = adminByIp(ipOf(req));
  if (!ipLimit.allowed) return refused(res, ipLimit.retryAfterMs, "too many admin calls");
  if (!admin.enabled) return res.status(403).json({ error: "control panel disabled" });
  if (!req.user || !isAdminEmail(admin, req.user.email)) {
    return res.status(403).json({ error: "not an admin" });
  }
  if (!adminVault.check(token)) {
    return res.status(403).json({ error: "present the PIN first" });
  }
  next();
}

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true, db: store.kind, name: "shadowquest", at: Date.now() });
});

/* ------------------------------------------------------------------ *
 * sign-in / sign-up — one gate, three honest branches
 * ------------------------------------------------------------------ */

app.post("/v1/auth/signin", async (req, res) => {
  const ipLimit = signinByIp(ipOf(req));
  if (!ipLimit.allowed) return refused(res, ipLimit.retryAfterMs, "too many sign-in attempts");

  const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 254);
  const handle = String(req.body?.handle ?? "").trim().slice(0, 32);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!EMAIL_SHAPE.test(email)) {
    return res.status(400).json({ error: "a valid email is required" });
  }

  const existing = await store.byEmail(email);

  // Branch 1 — new operator: the password policy is non-negotiable.
  if (!existing) {
    const problems = passwordProblems(password);
    if (problems.length) {
      return res.status(400).json({
        error: "weak password",
        detail: `needs ${problems.join(", ")}`,
      });
    }
    if ((await store.countUsers()) >= admin.maxUsers) {
      return res.status(503).json({ error: "registration is closed" });
    }
    const pw = hashPassword(password);
    const user = await store.upsertSignIn(
      email,
      handle || email.split("@")[0] || "Operator",
      { provider: "password" },
    );
    await store.setPassword(email, pw);
    return res.json({
      mode: "created",
      token: user.token,
      user: { ...publicUser(user), role: roleOf(admin, email) },
    });
  }

  // Branch 2 — returning operator with a password: verify it.
  if (existing.passwordHash) {
    const pwLimit = failedPwByEmail(`pw:${email}`);
    if (!pwLimit.allowed) return refused(res, pwLimit.retryAfterMs, "too many wrong passwords — wait a bit");
    if (!password || !verifyPassword(password, existing.passwordHash)) {
      return res.status(401).json({ error: "wrong password" });
    }
    const user = await store.upsertSignIn(email, handle || existing.handle || "Operator", {
      provider: "password",
    });
    return res.json({
      mode: "verified",
      token: user.token,
      user: { ...publicUser(user), role: roleOf(admin, email) },
    });
  }

  // Branch 3 — a legacy operator from before passwords existed: the first
  // valid password presented seals the account. Adopting is the only way an
  // older ledger stays reachable, and a wrong guess cannot seal it (policy
  // refuses weak guesses outright).
  const problems = passwordProblems(password);
  if (problems.length) {
    return res.status(409).json({ error: "this account needs a password to be sealed" });
  }
  const pw = hashPassword(password);
  await store.setPassword(email, pw);
  const user = await store.upsertSignIn(email, handle || existing.handle || "Operator", {
    provider: "password",
  });
  return res.json({
    mode: "sealed",
    token: user.token,
    user: { ...publicUser(user), role: roleOf(admin, email) },
  });
});

/* ------------------------------------------------------------------ *
 * Google OAuth — the real thing, start to finish
 *
 * Nothing about the operator is taken from the browser. The browser only
 * ever carries opaque, single-use, server-minted values: `state` out to
 * Google, and a handoff `code` back into the app. The identity itself is
 * established here, from an ID token whose signature this process verified
 * against Google's published keys.
 * ------------------------------------------------------------------ */

/** What the gate should render. The client asks before drawing the button. */
app.get("/v1/auth/providers", (_req, res) => {
  res.json({ password: true, google: google.enabled });
});

/** Step 1 — send the browser to Google's own consent screen. */
app.get("/v1/auth/google/start", (req, res) => {
  if (!google.enabled) {
    return res.status(503).json({ error: "google sign-in is not configured" });
  }
  const ipLimit = oauthByIp(`g:${ipOf(req)}`);
  if (!ipLimit.allowed) return refused(res, ipLimit.retryAfterMs, "too many sign-in attempts");

  // Where to land afterwards, validated against the allowlist before it is
  // ever stored — an open redirect here would leak the handoff code.
  const returnTo = resolveReturn(google, req.query?.return_to);
  const { url } = beginAuth(google, { returnTo });
  res.set("cache-control", "no-store");
  res.redirect(302, url);
});

/**
 * Step 2 — Google's redirect. Verifies everything, then reconciles the
 * verified profile with MongoDB:
 *
 *   googleId already known      → that account, always (email may have moved)
 *   email already registered    → LINK: same document, same ledger, same
 *                                 tasks / habits / progress / rewards. The
 *                                 password, if any, keeps working.
 *   neither                     → a brand new operator, empty ledger
 */
app.get("/v1/auth/google/callback", async (req, res) => {
  const cfg = google;
  const bounce = (base, params) => {
    const url = new URL(base);
    url.hash = `/login?${new URLSearchParams(params).toString()}`;
    res.set("cache-control", "no-store");
    return res.redirect(302, url.toString());
  };

  if (!cfg.enabled) return res.status(503).json({ error: "google sign-in is not configured" });

  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const parked = takePending(state);
  // No parked state → replayed, expired, or forged. There is nothing safe to
  // redirect to either, because returnTo lived in that state.
  if (!parked) {
    return bounce(resolveReturn(cfg, ""), { sq_auth: "error", reason: "expired" });
  }
  const home = resolveReturn(cfg, parked.returnTo);

  // The human pressed "cancel" (or Google refused): a first-class outcome,
  // not an error page.
  if (typeof req.query?.error === "string") {
    const cancelled = req.query.error === "access_denied";
    return bounce(home, { sq_auth: cancelled ? "cancelled" : "error", reason: "google" });
  }

  const code = typeof req.query?.code === "string" ? req.query.code : "";
  if (!code) return bounce(home, { sq_auth: "error", reason: "no_code" });

  let profile;
  try {
    const tokens = await exchangeCode(cfg, { code, codeVerifier: parked.codeVerifier });
    const claims = await verifyIdToken(cfg, tokens.id_token, parked.nonce);
    profile = profileFromClaims(claims);
  } catch (err) {
    // The reason stays in the server log; the browser gets a generic code.
    console.error("[google] verification failed:", err.message);
    return bounce(home, { sq_auth: "error", reason: "verify" });
  }

  try {
    const byGoogle = await store.byGoogleId(profile.googleId);
    const byMail = byGoogle ? null : await store.byEmail(profile.email);
    let mode;
    let email;

    if (byGoogle) {
      mode = "returning";
      email = byGoogle.email;
    } else if (byMail) {
      // ACCOUNT LINKING. The document is untouched apart from the provider
      // metadata, so every task, habit, life factor, reward, achievement and
      // point this person already earned stays exactly where it was.
      mode = "linked";
      email = byMail.email;
      await store.linkGoogle(email, {
        googleId: profile.googleId,
        picture: profile.picture,
        name: byMail.handle || profile.name,
      });
    } else {
      if ((await store.countUsers()) >= admin.maxUsers) {
        return bounce(home, { sq_auth: "error", reason: "closed" });
      }
      mode = "created";
      email = profile.email;
    }

    // One session, minted by the same code path a password sign-in uses:
    // the token the rest of the API already authenticates.
    const user = await store.upsertSignIn(
      email,
      byGoogle?.handle || byMail?.handle || profile.name,
      { provider: "google", googleId: profile.googleId, picture: profile.picture },
    );

    // The session token never travels in a URL. A one-time handoff code does,
    // and the app trades it for the token over POST within two minutes.
    const handoff = mintHandoff({
      token: user.token,
      email: user.email,
      handle: user.handle,
      picture: user.picture ?? "",
      role: roleOf(admin, user.email),
      mode,
    });
    return bounce(home, { sq_auth: "ok", code: handoff });
  } catch (err) {
    console.error("[google] account reconciliation failed:", err.message);
    return bounce(home, { sq_auth: "error", reason: "server" });
  }
});

/** Step 3 — the app redeems the one-time code for its session. */
app.post("/v1/auth/google/exchange", (req, res) => {
  if (!google.enabled) {
    return res.status(503).json({ error: "google sign-in is not configured" });
  }
  const ipLimit = signinByIp(ipOf(req));
  if (!ipLimit.allowed) return refused(res, ipLimit.retryAfterMs, "too many sign-in attempts");
  const payload = takeHandoff(typeof req.body?.code === "string" ? req.body.code : "");
  if (!payload) return res.status(401).json({ error: "sign in again" });
  res.set("cache-control", "no-store");
  res.json({
    token: payload.token,
    mode: payload.mode,
    user: {
      email: payload.email,
      handle: payload.handle,
      picture: payload.picture,
      role: payload.role,
      provider: "google",
    },
  });
});

app.get("/v1/ledger", authed, (req, res) => {
  const u = req.user;
  res.json({
    profile: u.profile ?? null,
    tasks: u.tasks ?? [],
    habits: u.habits ?? [],
    updatedAt: u.updatedAt ?? 0,
  });
});

app.put("/v1/ledger", authed, async (req, res) => {
  const writeLimit = ledgerByToken(tokenKey(req));
  if (!writeLimit.allowed) return refused(res, writeLimit.retryAfterMs, "ledger writes throttled");
  const { profile, tasks, habits } = sanitizeLedger(req.body ?? {});
  if (!profile) {
    return res.status(400).json({ error: "ledger needs a profile" });
  }
  const updatedAt = await store.saveLedger(req.user.email, { profile, tasks, habits });
  res.json({ updatedAt });
});

app.get("/v1/stats", authed, (req, res) => {
  res.json(statsFor(req.user));
});

app.get("/v1/leaderboard", async (_req, res) => {
  const all = await store.all();
  const rows = all
    .filter((u) => u.profile && Number(u.profile?.totalProgress ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.profile?.totalProgress ?? 0) - Number(a.profile?.totalProgress ?? 0),
    )
    .slice(0, 25)
    .map((u, i) => leaderRow(u, i + 1));
  res.json({ items: rows });
});

app.get("/v1/people", authed, async (req, res) => {
  const all = await store.all();
  const people = all
    .filter((u) => u.email !== req.user.email)
    .sort((a, b) => Number(b.lastSeenAt ?? 0) - Number(a.lastSeenAt ?? 0))
    .slice(0, 50)
    .map(personOf);
  res.json({ items: people });
});

/* ------------------------------------------------------------------ *
 * admin — the control panel
 * ------------------------------------------------------------------ */

/** PIN gate: mints the short-lived admin token. */
app.post("/v1/admin/elevate", authed, async (req, res) => {
  if (!admin.enabled || !isAdminEmail(admin, req.user.email)) {
    return res.status(403).json({ error: "not an admin" });
  }
  const pin = typeof req.body?.pin === "string" ? req.body.pin.slice(0, 64) : "";
  if (!pinMatches(admin, pin)) {
    return res.status(401).json({ error: "wrong PIN" });
  }
  res.json({ token: adminVault.mint(), expiresInMs: 6 * 60 * 60 * 1000 });
});

/** Control panel numbers: totals, activity, recent sign-ups, top operators. */
app.get("/v1/admin/overview", authed, adminOnly, async (_req, res) => {
  const users = await store.adminList(5000);
  const now = Date.now();
  const dayMs = 86400000;
  const active24h = users.filter((u) => Number(u.lastSeenAt ?? 0) > now - dayMs).length;
  const active7d = users.filter((u) => Number(u.lastSeenAt ?? 0) > now - 7 * dayMs).length;
  const signups = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    signups.push({
      date,
      count: users.filter((u) => {
        const c = Number(u.createdAt ?? 0);
        return c > 0 && c < now && new Date(c).toISOString().slice(0, 10) === date;
      }).length,
    });
  }
  const top = users
    .filter((u) => u.profile)
    .sort((a, b) => Number(b.profile?.totalProgress ?? 0) - Number(a.profile?.totalProgress ?? 0))
    .slice(0, 5)
    .map((u) => ({
      handle: String(u.profile?.handle || u.handle || "Operator").slice(0, 32),
      level: Math.max(1, Math.round(Number(u.profile?.lifeLevel ?? 1))),
      streak: Math.max(0, Math.round(Number(u.profile?.streak ?? 0))),
      progress: Math.max(0, Math.round(Number(u.profile?.totalProgress ?? 0))),
    }));
  res.json({
    totalUsers: users.length,
    userCap: admin.maxUsers,
    active24h,
    active7d,
    signups,
    top,
    store: store.kind,
    at: now,
  });
});

/** Operator directory — emails visible to the admin alone. */
app.get("/v1/admin/users", authed, adminOnly, async (req, res) => {
  const q = String(req.query?.q ?? "").trim().toLowerCase().slice(0, 64);
  const users = await store.adminList(5000);
  const items = users
    .filter((u) => {
      if (!q) return true;
      return (
        String(u.email ?? "").toLowerCase().includes(q) ||
        String(u.handle ?? "").toLowerCase().includes(q) ||
        String(u.profile?.handle ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, 200)
    .map((u) => ({
      id: String(u.id ?? u.email),
      email: String(u.email ?? ""),
      handle: String(u.profile?.handle || u.handle || "Operator").slice(0, 32),
      role: roleOf(admin, u.email),
      createdAt: Number(u.createdAt ?? 0),
      lastSeenAt: Number(u.lastSeenAt ?? 0),
      level: Math.max(1, Math.round(Number(u.profile?.lifeLevel ?? 1))),
      streak: Math.max(0, Math.round(Number(u.profile?.streak ?? 0))),
      progress: Math.max(0, Math.round(Number(u.profile?.totalProgress ?? 0))),
      tasks: Array.isArray(u.tasks) ? u.tasks.length : 0,
      hasPassword: Boolean(u.passwordHash),
    }));
  res.json({ items, total: users.length });
});

/** Remove an operator. Admins cannot delete admins. */
app.delete("/v1/admin/users/:email", authed, adminOnly, async (req, res) => {
  const email = String(req.params?.email ?? "").trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) {
    return res.status(400).json({ error: "a valid email is required" });
  }
  if (isAdminEmail(admin, email)) {
    return res.status(403).json({ error: "cannot remove an admin" });
  }
  const removed = await store.deleteUser(email);
  res.json({ removed });
});

/** Kill every active session: all tokens rotate, everyone signs in again. */
app.post("/v1/admin/sessions/revoke-all", authed, adminOnly, async (_req, res) => {
  const count = await store.invalidateAllTokens();
  res.json({ revoked: count });
});

/**
 * API-only mode keeps the JSON index at `/`. In serve-web mode `/` is the
 * app itself (served by the static layer + fallback below), and liveness
 * stays on `GET /v1/health` in both modes.
 */
if (!WEB_READY) {
  app.get("/", (_req, res) => {
    res.json({
      name: "ShadowQuest API",
      db: store.kind,
      endpoints: [
        "GET /v1/health",
        "POST /v1/auth/signin",
        "GET /v1/auth/providers",
        "GET /v1/auth/google/start",
        "GET /v1/auth/google/callback",
        "POST /v1/auth/google/exchange",
        "GET /v1/ledger",
        "PUT /v1/ledger",
        "GET /v1/stats",
        "GET /v1/leaderboard",
        "GET /v1/people",
        "POST /v1/admin/elevate",
        "GET /v1/admin/overview",
        "GET /v1/admin/users",
        "DELETE /v1/admin/users/:email",
        "POST /v1/admin/sessions/revoke-all",
      ],
    });
  });
}

if (WEB_READY) {
  console.log(`[web] serving the app from ${WEB_ROOT} (same origin as the API)`);
  /**
   * The bundle's filenames are content-hashed everywhere except the shell
   * files, so hashed assets cache for a year while everything else
   * revalidates — the same policy `public/_headers` declares for static
   * hosts, applied here because nothing else serves headers in this mode.
   */
  app.use(
    express.static(WEB_ROOT, {
      index: false,
      redirect: false,
      maxAge: 0,
      setHeaders(res, filePath) {
        res.set("x-content-type-options", "nosniff");
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.set("cache-control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith(".html")) {
          res.set("cache-control", "public, max-age=0, must-revalidate");
        }
      },
    }),
  );

  /**
   * Unknown API paths stay machine-readable JSON — never the app shell.
   * (Checked against `originalUrl`: the `/api` strip above already rewrote
   * `req.url` by the time a miss lands here.) The frontend maps a 404 on a
   * known path to \"no API behind this address\"; a 404 here, on an unknown
   * path, honestly means \"no such endpoint\".
   */
  app.use((req, res, next) => {
    const original = req.originalUrl.split("?")[0];
    const isApi =
      original === "/api" ||
      original.startsWith("/api/") ||
      original === "/v1" ||
      original.startsWith("/v1/");
    if (isApi) return res.status(404).json({ error: "unknown endpoint" });
    next();
  });

  /**
   * SPA fallback: a path that looks like a route serves the shell; a path
   * that looks like a file (`/assets/x.js`, `/favicon.svg`) is a genuine
   * miss and falls through to Express's default 404. Serving the shell for
   * a missing script would hand the browser HTML where it expects
   * JavaScript — a white page with a misleading console.
   */
  app.get("*", (req, res, next) => {
    if (/\/[^/]*\.[a-z0-9]+$/i.test(req.path)) return next();
    // Mirrors `public/_headers`. The script/style policy itself ships as the
    // `<meta>` the vite build injects; the header only adds what a meta
    // policy is not allowed to carry (`frame-ancestors`).
    res.set({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'",
      "cross-origin-opener-policy": "same-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      "cache-control": "public, max-age=0, must-revalidate",
    });
    res.sendFile(path.join(WEB_ROOT, "index.html"));
  });
}

// Never let one bad request take the API down — and never explain why.
app.use((err, _req, res, _next) => {
  console.error("[api] unhandled:", err.message);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[api] ShadowQuest backend on :${PORT} (store: ${store.kind}, web: ${WEB_READY ? "on" : "off"})`,
  );
});
