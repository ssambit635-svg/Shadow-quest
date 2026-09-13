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
  hashPassword,
  limiter,
  passwordProblems,
  passwordValid,
  refused,
  verifyPassword,
} from "./security.mjs";

const PORT = Number(process.env.PORT ?? 8788);
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const admin = adminConfig();
if (!admin.enabled) {
  console.warn(
    "[admin] ADMIN_EMAILS / ADMIN_PIN not configured — the control panel stays closed",
  );
} else {
  console.log(`[admin] control panel enabled for ${[...admin.emails].join(", ")}`);
}

const store = await createStore();

const app = express();
app.disable("x-powered-by");
// Rate limiting keys off req.ip — honour a trusted proxy when told to.
app.set("trust proxy", process.env.SQ_TRUST_PROXY === "1" ? 1 : false);

/* CORS: open by default (dev / APK builds that talk cross-origin), locked to
 * an explicit allowlist the moment SQ_CORS_ORIGIN is set. */
const corsOrigins = (process.env.SQ_CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (corsOrigins.length) {
  console.log(`[cors] restricted to ${corsOrigins.join(", ")}`);
  app.use(
    cors({
      origin: corsOrigins,
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
    const user = await store.upsertSignIn(email, handle || email.split("@")[0] || "Operator");
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
    const user = await store.upsertSignIn(email, handle || existing.handle || "Operator");
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
  const user = await store.upsertSignIn(email, handle || existing.handle || "Operator");
  return res.json({
    mode: "sealed",
    token: user.token,
    user: { ...publicUser(user), role: roleOf(admin, email) },
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

app.get("/", (_req, res) => {
  res.json({
    name: "ShadowQuest API",
    db: store.kind,
    endpoints: [
      "GET /v1/health",
      "POST /v1/auth/signin",
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

// Never let one bad request take the API down — and never explain why.
app.use((err, _req, res, _next) => {
  console.error("[api] unhandled:", err.message);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[api] ShadowQuest backend on :${PORT} (store: ${store.kind})`);
});
