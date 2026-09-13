/**
 * ShadowQuest backend — Express entry.
 *
 * Real people, real data: every operator that signs in gets a document, the
 * frontend pushes its ledger (profile + tasks + habits) here, and the
 * leaderboard, stats and people roster are read back from what was actually
 * stored. No seeded rows, no demo people.
 *
 * Endpoints (all JSON):
 *   GET  /v1/health          — liveness + which store is active
 *   POST /v1/auth/signin     — upsert operator, returns bearer token
 *   GET  /v1/ledger          — the operator's stored ledger            (auth)
 *   PUT  /v1/ledger          — replace the operator's ledger           (auth)
 *   GET  /v1/stats           — aggregated stats for the operator       (auth)
 *   GET  /v1/leaderboard     — real operators, ranked
 *   GET  /v1/people          — other registered operators, for squads  (auth)
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

const PORT = Number(process.env.PORT ?? 8788);
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const store = await createStore();

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "512kb" }));

/* ------------------------------------------------------------------ *
 * auth — bearer token issued at sign-in
 * ------------------------------------------------------------------ */

async function authed(req, res, next) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.get("x-sq-token") ?? "";
  const user = await store.byToken(token);
  if (!user) {
    return res.status(401).json({ error: "sign in again" });
  }
  req.user = user;
  await store.touch(user.email).catch(() => undefined);
  next();
}

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true, db: store.kind, name: "shadowquest", at: Date.now() });
});

app.post("/v1/auth/signin", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 254);
  const handle = String(req.body?.handle ?? "").trim().slice(0, 32);
  if (!EMAIL_SHAPE.test(email)) {
    return res.status(400).json({ error: "a valid email is required" });
  }
  const user = await store.upsertSignIn(email, handle || email.split("@")[0] || "Operator");
  res.json({ token: user.token, user: publicUser(user) });
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
    ],
  });
});

// Never let one bad request take the API down.
app.use((err, _req, res, _next) => {
  console.error("[api] unhandled:", err.message);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[api] ShadowQuest backend on :${PORT} (store: ${store.kind})`);
});
