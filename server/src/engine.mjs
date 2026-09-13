/**
 * engine.mjs — server-side guards and aggregation.
 *
 * The client owns the game math (levels, streaks, factor gains) and pushes
 * its ledger here; the server's job is to (a) refuse payloads that are not
 * shaped like a ledger and (b) aggregate what it stores into the stats and
 * leaderboard surfaces. Nothing in here invents numbers — every figure the
 * stats endpoint returns is derived from data a real operator submitted.
 */

const num = (v, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);

export const LIFE_FACTORS = [
  "knowledge",
  "focus",
  "discipline",
  "strength",
  "energy",
  "wellness",
  "skills",
];

const PRIORITIES = ["low", "medium", "high", "critical"];
const DIFFICULTIES = ["trivial", "easy", "normal", "hard", "major"];
const STATUSES = ["pending", "in-progress", "completed", "overdue"];

const MAX_TASKS = 1000;
const MAX_HABITS = 100;

/** Coerce one wire task into the ledger shape, or null. */
export function sanitizeTask(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = str(raw.id).trim().slice(0, 64);
  const title = str(raw.title).trim().slice(0, 200);
  if (!id || !title) return null;
  const factors = Array.isArray(raw.factors)
    ? raw.factors
        .filter((f) => f && typeof f === "object" && LIFE_FACTORS.includes(f.factor))
        .slice(0, LIFE_FACTORS.length)
        .map((f) => ({
          factor: f.factor,
          amount: Math.max(0, Math.min(99, Math.round(num(f.amount, 1)))),
        }))
    : [];
  return {
    id,
    title,
    description: typeof raw.description === "string" ? raw.description.slice(0, 2000) : undefined,
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : "medium",
    difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : "normal",
    dueDate: typeof raw.dueDate === "string" ? raw.dueDate.slice(0, 10) : undefined,
    daily: raw.daily === true,
    factors,
    progress: Math.max(0, Math.min(100000, Math.round(num(raw.progress)))),
    rewardPoints: Math.max(0, Math.min(100000, Math.round(num(raw.rewardPoints)))),
    status: STATUSES.includes(raw.status) ? raw.status : "pending",
    createdAt: num(raw.createdAt, Date.now()),
    completedAt:
      typeof raw.completedAt === "number" && Number.isFinite(raw.completedAt)
        ? raw.completedAt
        : undefined,
    category: typeof raw.category === "string" ? raw.category.slice(0, 64) : undefined,
  };
}

/** Coerce one wire habit into the ledger shape, or null. */
export function sanitizeHabit(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = str(raw.id).trim().slice(0, 64);
  const title = str(raw.title).trim().slice(0, 120);
  if (!id || !title) return null;
  const history = Array.isArray(raw.history)
    ? raw.history
        .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
        .slice(-800)
    : [];
  return {
    id,
    title,
    mark: str(raw.mark).slice(0, 4) || "節",
    time: /^\d{2}:\d{2}$/.test(str(raw.time)) ? raw.time : "20:00",
    remind: raw.remind === true,
    createdAt: num(raw.createdAt, Date.now()),
    history,
  };
}

/** Guard the profile blob; we store only known keys with sane bounds. */
export function sanitizeProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const factors = {};
  for (const f of LIFE_FACTORS) {
    factors[f] = Math.max(0, Math.min(100, Math.round(num(raw.factors?.[f]))));
  }
  return {
    handle: str(raw.handle, "Operator").slice(0, 32),
    lifeLevel: Math.max(1, Math.min(999, Math.round(num(raw.lifeLevel, 1)))),
    totalProgress: Math.max(0, Math.round(num(raw.totalProgress))),
    levelProgress: Math.max(0, Math.round(num(raw.levelProgress))),
    progressToNext: Math.max(1, Math.round(num(raw.progressToNext, 100))),
    growthRank: str(raw.growthRank, "E").slice(0, 4),
    rewardPoints: Math.max(0, Math.round(num(raw.rewardPoints))),
    energy: Math.max(0, Math.min(999, num(raw.energy, 60))),
    energyMax: Math.max(1, Math.min(999, num(raw.energyMax, 100))),
    streak: Math.max(0, Math.round(num(raw.streak))),
    longestStreak: Math.max(0, Math.round(num(raw.longestStreak))),
    factors,
    skills: Array.isArray(raw.skills)
      ? raw.skills.filter((s) => typeof s === "string").slice(0, 64).map((s) => s.slice(0, 48))
      : [],
    focusArea: str(raw.focusArea, "General Development").slice(0, 64),
    tasksCompleted: Math.max(0, Math.round(num(raw.tasksCompleted))),
    todayCompleted: Math.max(0, Math.round(num(raw.todayCompleted))),
    lastActiveDate: typeof raw.lastActiveDate === "string" ? raw.lastActiveDate.slice(0, 10) : undefined,
  };
}

/** Validate a whole PUT /v1/ledger body. */
export function sanitizeLedger(body) {
  const tasks = Array.isArray(body?.tasks)
    ? body.tasks.map(sanitizeTask).filter(Boolean).slice(0, MAX_TASKS)
    : [];
  const habits = Array.isArray(body?.habits)
    ? body.habits.map(sanitizeHabit).filter(Boolean).slice(0, MAX_HABITS)
    : [];
  const profile = sanitizeProfile(body?.profile);
  return { tasks, habits, profile };
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

const dayISO = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/**
 * Per-operator stats, all derived from their stored ledger:
 *   daily    — the last `days` days, tasks sealed + habit seals + points
 *   weekly   — progress sealed per ISO week, last 8 weeks
 *   factors  — factor points earned from completed tasks
 *   categories — reward points split by task category
 */
export function statsFor(user, days = 84) {
  const tasks = (user.tasks ?? []).filter(Boolean);
  const habits = (user.habits ?? []).filter(Boolean);
  const done = tasks.filter((t) => t.status === "completed" && t.completedAt);

  const start = Date.now() - (days - 1) * 86400000;

  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const t0 = Date.now() - i * 86400000;
    const date = dayISO(t0);
    daily.push({ date, sealed: 0, seals: 0, progress: 0, points: 0 });
  }
  const byDate = new Map(daily.map((d) => [d.date, d]));

  for (const t of done) {
    const row = byDate.get(dayISO(t.completedAt));
    if (!row) continue;
    row.sealed += 1;
    row.progress += t.progress;
    row.points += t.rewardPoints;
  }
  for (const h of habits) {
    for (const date of h.history ?? []) {
      const row = byDate.get(date);
      if (row) row.seals += 1;
    }
  }

  // Weekly momentum — the last 8 Monday-buckets, progress sealed.
  const weekly = [];
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const thisMonday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow);
  for (let w = 7; w >= 0; w--) {
    const monday = thisMonday - w * 7 * 86400000;
    weekly.push({ start: monday, progress: 0, sealed: 0 });
  }
  for (const t of done) {
    if (t.completedAt < weekly[0].start) continue;
    const idx = Math.floor((t.completedAt - weekly[0].start) / (7 * 86400000));
    if (idx >= 0 && idx < weekly.length) {
      weekly[idx].progress += t.progress;
      weekly[idx].sealed += 1;
    }
  }

  // Factor gains earned through completed work.
  const factors = Object.fromEntries(LIFE_FACTORS.map((f) => [f, 0]));
  for (const t of done) {
    for (const g of t.factors ?? []) {
      if (factors[g.factor] !== undefined) factors[g.factor] += g.amount;
    }
  }

  // Where the reward points came from.
  const catMap = new Map();
  for (const t of done) {
    const key = (t.category ?? "General").trim() || "General";
    const row = catMap.get(key) ?? { label: key, points: 0, count: 0 };
    row.points += t.rewardPoints;
    row.count += 1;
    catMap.set(key, row);
  }
  const categories = [...catMap.values()].sort((a, b) => b.points - a.points);

  // A little activity sum for the last 7 days (the squad's "weekly" number).
  const weekMs = Date.now() - 7 * 86400000;
  const weeklyPoints = done
    .filter((t) => t.completedAt >= weekMs)
    .reduce((a, t) => a + t.rewardPoints, 0);

  return {
    profile: user.profile,
    openTasks: tasks.filter((t) => t.status !== "completed").length,
    completedTasks: done.length,
    habitsCount: habits.length,
    weeklyPoints,
    daily,
    weekly,
    factors,
    categories,
  };
}

/** Leaderboard row for one stored operator. */
export function leaderRow(user, rank) {
  const p = user.profile ?? {};
  return {
    rank,
    handle: str(p.handle || user.handle, "Operator").slice(0, 32),
    wins: Math.max(0, Math.round(num(p.tasksCompleted))),
    losses: 0,
    streak: Math.max(0, Math.round(num(p.streak))),
    school: str(p.focusArea, "General Development").slice(0, 64),
    level: Math.max(1, Math.round(num(p.lifeLevel, 1))),
    points: Math.max(0, Math.round(num(p.totalProgress))),
  };
}

/** The public shape of an operator, for the squad's people roster. */
export function personOf(user) {
  const p = user.profile ?? {};
  const factors = p.factors ?? {};
  let strength = "discipline";
  let best = -1;
  for (const f of LIFE_FACTORS) {
    if (num(factors[f]) > best) {
      best = num(factors[f]);
      strength = f;
    }
  }
  const weekMs = Date.now() - 7 * 86400000;
  const weeklyPoints = (user.tasks ?? [])
    .filter((t) => t?.status === "completed" && num(t.completedAt) >= weekMs)
    .reduce((a, t) => a + num(t.rewardPoints), 0);
  return {
    id: user.id,
    name: str(p.handle || user.handle, "Operator").slice(0, 32),
    handle: str(p.handle || user.handle, "operator").toLowerCase().replace(/\s+/g, "").slice(0, 32),
    level: Math.max(1, Math.round(num(p.lifeLevel, 1))),
    rank: str(p.growthRank, "E").slice(0, 4),
    streak: Math.max(0, Math.round(num(p.streak))),
    focusArea: str(p.focusArea, "General Development").slice(0, 64),
    strength,
    weeklyPoints,
    online: num(user.lastSeenAt) > Date.now() - 10 * 60_000,
    joinedAt: num(user.createdAt, Date.now()),
  };
}
