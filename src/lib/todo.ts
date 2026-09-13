/**
 * todo.ts — Productivity to-do / task engine.
 *
 * Models real-life tasks that produce Progress, Reward Points, and improve
 * real Life Factors (Knowledge, Focus, Discipline, Strength, Energy,
 * Wellness, Skills). Drives the ShadowQuest Personal OS dashboard.
 */

export type LifeFactor =
  | "knowledge"
  | "focus"
  | "discipline"
  | "strength"
  | "energy"
  | "wellness"
  | "skills";

export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskDifficulty = "trivial" | "easy" | "normal" | "hard" | "major";
export type TaskStatus = "pending" | "in-progress" | "completed" | "overdue";

export interface LifeFactorGain {
  factor: LifeFactor;
  amount: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  /** YYYY-MM-DD */
  dueDate?: string;
  /** Is this a daily goal? */
  daily: boolean;
  /** Life Factors this task improves when completed */
  factors: LifeFactorGain[];
  /** Progress points awarded on completion */
  progress: number;
  /** Reward Points awarded on completion */
  rewardPoints: number;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  category?: string;
}

export interface Profile {
  /** Display name */
  handle: string;
  /** Life Level — driven by total progress */
  lifeLevel: number;
  /** Total Progress (XP equivalent) */
  totalProgress: number;
  /** Progress toward next level */
  levelProgress: number;
  progressToNext: number;
  /** Growth Rank */
  growthRank: string;
  /** Reward Points (Gold equivalent) */
  rewardPoints: number;
  /** Energy (HP equivalent, 0-100) */
  energy: number;
  energyMax: number;
  /** Consistency streak (days) */
  streak: number;
  longestStreak: number;
  /** Life Factors — 0-100 */
  factors: Record<LifeFactor, number>;
  /** Personal Skills unlocked */
  skills: string[];
  /** Focus Area / class */
  focusArea: string;
  /** Total tasks completed */
  tasksCompleted: number;
  /** Daily goals completed today */
  todayCompleted: number;
  /** Last active date for streak calc (YYYY-MM-DD) */
  lastActiveDate?: string;
}

/**
 * Factor readouts use two-letter codes, not icons: one mono typeface, one
 * colour discipline (the bar is brass, the value is bone). No emoji, no
 * rainbow — the ledger reads like an instrument panel.
 */
export const LIFE_FACTOR_META: Record<
  LifeFactor,
  { label: string; code: string }
> = {
  knowledge: { label: "Knowledge", code: "KN" },
  focus: { label: "Focus", code: "FO" },
  discipline: { label: "Discipline", code: "DI" },
  strength: { label: "Strength", code: "ST" },
  energy: { label: "Energy", code: "EN" },
  wellness: { label: "Wellness", code: "WE" },
  skills: { label: "Skills", code: "SK" },
};

/** Priority is a single accent ramp: dim bone → brass → vermilion. */
export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; weight: number; color: string }
> = {
  low: { label: "Low", weight: 1, color: "var(--bone-400)" },
  medium: { label: "Medium", weight: 2, color: "var(--brass)" },
  high: { label: "High", weight: 3, color: "var(--vermilion)" },
  critical: { label: "Critical", weight: 4, color: "var(--vermilion-lit)" },
};

export const DIFFICULTY_META: Record<
  TaskDifficulty,
  { label: string; progressMul: number; rewardMul: number }
> = {
  trivial: { label: "Trivial", progressMul: 0.4, rewardMul: 0.4 },
  easy: { label: "Easy", progressMul: 0.7, rewardMul: 0.7 },
  normal: { label: "Normal", progressMul: 1, rewardMul: 1 },
  hard: { label: "Hard", progressMul: 1.6, rewardMul: 1.6 },
  major: { label: "Major", progressMul: 2.5, rewardMul: 2.5 },
};

export const GROWTH_RANKS = [
  "E",
  "D",
  "C",
  "C+",
  "B",
  "B+",
  "A",
  "A+",
  "S",
  "S+",
];

export function progressForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.35, level - 1));
}

export function rankForLevel(level: number): string {
  const idx = Math.min(GROWTH_RANKS.length - 1, Math.floor((level - 1) / 3));
  return GROWTH_RANKS[idx];
}

/**
 * The ledger is sealed per user: everything hangs off a scope key (the
 * normalised email) so each operator keeps their own tasks and profile.
 * `scopeOf(user)` from lib/auth produces the fragment.
 */
const tasksKey = (scope: string) => `sq.tasks.${scope}`;
const profileKey = (scope: string) => `sq.profile.${scope}`;

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function makeId(): string {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultProfile(): Profile {
  return {
    handle: "You",
    lifeLevel: 1,
    totalProgress: 0,
    levelProgress: 0,
    progressToNext: progressForLevel(1),
    growthRank: GROWTH_RANKS[0],
    rewardPoints: 0,
    energy: 80,
    energyMax: 100,
    streak: 0,
    longestStreak: 0,
    factors: {
      knowledge: 12,
      focus: 10,
      discipline: 8,
      strength: 8,
      energy: 70,
      wellness: 10,
      skills: 10,
    },
    skills: [],
    focusArea: "General Development",
    tasksCompleted: 0,
    todayCompleted: 0,
  };
}



const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];
const DIFFICULTIES: TaskDifficulty[] = ["trivial", "easy", "normal", "hard", "major"];
const STATUSES: TaskStatus[] = ["pending", "in-progress", "completed", "overdue"];
const FACTOR_KEYS = Object.keys(LIFE_FACTOR_META) as LifeFactor[];

/**
 * Repair one stored task.
 *
 * The ledger is read on every mount and rendered straight off the result, so
 * a row that lost its title or arrived as a bare number used to take the list
 * down. Rows that cannot be repaired are dropped; the rest are coerced back
 * into shape.
 */
function toTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id).trim();
  const title = str(r.title).trim();
  if (!id || !title) return null;
  return {
    id: id.slice(0, 64),
    title: title.slice(0, 200),
    description: typeof r.description === "string" ? r.description.slice(0, 2000) : undefined,
    priority: PRIORITIES.includes(r.priority as TaskPriority)
      ? (r.priority as TaskPriority)
      : "medium",
    difficulty: DIFFICULTIES.includes(r.difficulty as TaskDifficulty)
      ? (r.difficulty as TaskDifficulty)
      : "normal",
    dueDate: typeof r.dueDate === "string" ? r.dueDate.slice(0, 10) : undefined,
    daily: r.daily === true,
    factors: Array.isArray(r.factors)
      ? (r.factors as unknown[])
          .map((f): LifeFactorGain | null => {
            if (!f || typeof f !== "object") return null;
            const e = f as Record<string, unknown>;
            if (!FACTOR_KEYS.includes(e.factor as LifeFactor)) return null;
            return { factor: e.factor as LifeFactor, amount: Math.max(0, Math.round(num(e.amount, 1))) };
          })
          .filter((f): f is LifeFactorGain => f !== null)
      : [],
    progress: Math.max(0, Math.round(num(r.progress, 0))),
    rewardPoints: Math.max(0, Math.round(num(r.rewardPoints, 0))),
    status: STATUSES.includes(r.status as TaskStatus) ? (r.status as TaskStatus) : "pending",
    createdAt: num(r.createdAt, Date.now()),
    completedAt: typeof r.completedAt === "number" ? r.completedAt : undefined,
    category: typeof r.category === "string" ? r.category.slice(0, 64) : undefined,
  };
}

/**
 * Repair + overdue-sweep an arbitrary task array. Shared by the localStorage
 * loader and the backend client, so wire data and stored data pass through
 * exactly the same validation.
 */
export function sanitizeTasks(parsed: unknown): Task[] {
  if (!Array.isArray(parsed)) return [];
  const tasks = parsed.map(toTask).filter((t): t is Task => t !== null);
  const today = todayISO();
  return tasks.map((t) => {
    if (t.status === "pending" && t.dueDate && dayDiff(today, t.dueDate) < 0) {
      return { ...t, status: "overdue" as TaskStatus };
    }
    return t;
  });
}

export function loadTasks(scope: string): Task[] {
  try {
    const raw = localStorage.getItem(tasksKey(scope));
    if (raw) return sanitizeTasks(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  // No seed data: a fresh ledger starts empty and fills with the
  // operator's own goals — nothing hardcoded stands in for real work.
  return [];
}

export function saveTasks(scope: string, tasks: Task[]) {
  try {
    localStorage.setItem(tasksKey(scope), JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

/**
 * Merge a stored profile over the defaults, field by field.
 *
 * A shallow spread is not enough here: `{ ...defaultProfile(), ...parsed }`
 * lets a stored `factors: null` *replace* the default factor table, and every
 * screen that reads `profile.factors.knowledge` then throws. Nested objects
 * are merged and every number is coerced, so a partially-written record
 * degrades to defaults instead of taking the character sheet with it.
 */
export function repairProfile(parsed: unknown): Profile {
  const d = defaultProfile();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return d;
  const r = parsed as Record<string, unknown>;

  const factors = { ...d.factors };
  if (r.factors && typeof r.factors === "object" && !Array.isArray(r.factors)) {
    for (const k of FACTOR_KEYS) {
      const v = (r.factors as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) factors[k] = Math.max(0, Math.round(v));
    }
  }

  const rank = GROWTH_RANKS.includes(str(r.growthRank)) ? str(r.growthRank) : d.growthRank;

  return {
    ...d,
    handle: str(r.handle, d.handle).slice(0, 32),
    lifeLevel: Math.max(1, Math.round(num(r.lifeLevel, d.lifeLevel))),
    totalProgress: Math.max(0, Math.round(num(r.totalProgress, 0))),
    levelProgress: Math.max(0, Math.round(num(r.levelProgress, 0))),
    progressToNext: Math.max(1, Math.round(num(r.progressToNext, d.progressToNext))),
    growthRank: rank,
    rewardPoints: Math.max(0, Math.round(num(r.rewardPoints, 0))),
    energy: num(r.energy, d.energy),
    energyMax: Math.max(1, num(r.energyMax, d.energyMax)),
    streak: Math.max(0, Math.round(num(r.streak, 0))),
    longestStreak: Math.max(0, Math.round(num(r.longestStreak, 0))),
    factors,
    skills: Array.isArray(r.skills)
      ? (r.skills as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 64)
      : d.skills,
    focusArea: str(r.focusArea, d.focusArea).slice(0, 64),
    tasksCompleted: Math.max(0, Math.round(num(r.tasksCompleted, 0))),
    todayCompleted: Math.max(0, Math.round(num(r.todayCompleted, 0))),
    lastActiveDate: str(r.lastActiveDate) || undefined,
  };
}

export function loadProfile(scope: string): Profile {
  try {
    const raw = localStorage.getItem(profileKey(scope));
    if (raw) {
      const p = repairProfile(JSON.parse(raw));
      // Reset today count if date changed
      if (p.lastActiveDate !== todayISO()) p.todayCompleted = 0;
      return p;
    }
  } catch {
    /* ignore */
  }
  return defaultProfile();
}

export function saveProfile(scope: string, p: Profile) {
  try {
    localStorage.setItem(profileKey(scope), JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/**
 * Streak milestones — a chain this long pays a one-time bonus of reward
 * points. Kept here, in the engine, so the pay-out and the display agree.
 */
export const STREAK_MILESTONES = [
  { days: 7, label: "first week", points: 25 },
  { days: 30, label: "one month", points: 150 },
  { days: 60, label: "sixty days", points: 350 },
  { days: 100, label: "one hundred days", points: 750 },
  { days: 180, label: "half a year", points: 1500 },
  { days: 365, label: "one year", points: 5000 },
] as const;

/**
 * Complete a task: award progress, reward points, factor gains, and handle
 * level-ups + streak. Returns the updated profile plus a list of "events"
 * the UI can animate (progress gains, level up, etc).
 */
export interface CompleteEvent {
  type: "progress" | "reward" | "factor" | "levelup" | "rankup" | "streak";
  message: string;
  amount?: number;
  factor?: LifeFactor;
}

export function completeTask(
  profile: Profile,
  task: Task,
): { profile: Profile; events: CompleteEvent[] } {
  const events: CompleteEvent[] = [];
  const diffMeta = DIFFICULTY_META[task.difficulty];
  const gained = Math.round(task.progress * diffMeta.progressMul);
  const reward = Math.round(task.rewardPoints * diffMeta.rewardMul);

  let p: Profile = {
    ...profile,
    totalProgress: profile.totalProgress + gained,
    levelProgress: profile.levelProgress + gained,
    rewardPoints: profile.rewardPoints + reward,
    tasksCompleted: profile.tasksCompleted + 1,
    todayCompleted: profile.todayCompleted + 1,
  };

  events.push({ type: "progress", message: `+${gained} PROGRESS`, amount: gained });
  events.push({ type: "reward", message: `+${reward} REWARD POINTS`, amount: reward });

  // Factor gains
  const newFactors = { ...p.factors };
  for (const g of task.factors) {
    newFactors[g.factor] = Math.min(100, newFactors[g.factor] + g.amount);
    events.push({
      type: "factor",
      message: `${LIFE_FACTOR_META[g.factor].label.toUpperCase()} +${g.amount}`,
      amount: g.amount,
      factor: g.factor,
    });
  }
  p.factors = newFactors;

  // Energy cost — harder tasks cost more, but give small energy reward for discipline
  const energyCost = { trivial: 3, easy: 5, normal: 10, hard: 18, major: 30 }[task.difficulty];
  p.energy = Math.max(0, Math.min(p.energyMax, p.energy - energyCost + 2));

  // Level up loop
  while (p.levelProgress >= p.progressToNext) {
    p.levelProgress -= p.progressToNext;
    p.lifeLevel += 1;
    p.progressToNext = progressForLevel(p.lifeLevel);
    const newRank = rankForLevel(p.lifeLevel);
    events.push({ type: "levelup", message: `GROWTH LEVEL UP → Lv.${p.lifeLevel}` });
    if (newRank !== p.growthRank) {
      events.push({ type: "rankup", message: `GROWTH RANK: ${p.growthRank} → ${newRank}` });
      p.growthRank = newRank;
    }
    p.energyMax = Math.min(150, p.energyMax + 5);
    p.energy = p.energyMax; // full energy on level up
  }

  // Streak logic: if active today already, keep. If yesterday was last, increment.
  const today = todayISO();
  if (p.lastActiveDate !== today) {
    if (p.lastActiveDate && dayDiff(p.lastActiveDate, today) === 1) {
      p.streak += 1;
      events.push({ type: "streak", message: `CONSISTENCY: ${p.streak} DAY${p.streak === 1 ? "" : "S"}` });
      // A milestone day pays once: the chain itself is the achievement.
      const hit = STREAK_MILESTONES.find((m) => m.days === p.streak);
      if (hit) {
        p.rewardPoints += hit.points;
        events.push({
          type: "streak",
          message: `STREAK ${p.streak} DAYS — ${hit.label} · +${hit.points} REWARD`,
          amount: hit.points,
        });
      }
    } else if (p.lastActiveDate && dayDiff(p.lastActiveDate, today) > 1) {
      p.streak = 1;
    } else {
      p.streak = Math.max(1, p.streak || 1);
    }
    p.longestStreak = Math.max(p.longestStreak, p.streak);
    p.lastActiveDate = today;
  }

  return { profile: p, events };
}

export function sortTasks(tasks: Task[]): Task[] {
  const priOrder: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...tasks].sort((a, b) => {
    // completed last
    const aDone = a.status === "completed" ? 1 : 0;
    const bDone = b.status === "completed" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    // overdue first among non-completed
    const aOver = a.status === "overdue" ? 0 : 1;
    const bOver = b.status === "overdue" ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    // priority
    const p = priOrder[a.priority] - priOrder[b.priority];
    if (p !== 0) return p;
    // due date (closest first)
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt - a.createdAt;
  });
}

export function tasksForToday(tasks: Task[]): Task[] {
  const today = todayISO();
  return tasks.filter((t) => t.daily || t.dueDate === today);
}

export function upcomingTasks(tasks: Task[]): Task[] {
  const today = todayISO();
  return tasks.filter((t) => !t.daily && t.dueDate && t.dueDate > today && t.status !== "completed");
}

export function overdueTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === "overdue");
}

export function completedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === "completed");
}
