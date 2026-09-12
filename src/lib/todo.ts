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

export const LIFE_FACTOR_META: Record<
  LifeFactor,
  { label: string; icon: string; color: string }
> = {
  knowledge: { label: "Knowledge", icon: "🧠", color: "#6ba8ff" },
  focus: { label: "Focus", icon: "🎯", color: "#c77aff" },
  discipline: { label: "Discipline", icon: "🔥", color: "#ff6b4a" },
  strength: { label: "Strength", icon: "💪", color: "#ff9c4a" },
  energy: { label: "Energy", icon: "⚡", color: "#ffe14a" },
  wellness: { label: "Wellness", icon: "🧘", color: "#4affb8" },
  skills: { label: "Skills", icon: "💻", color: "#4ac8e0" },
};

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; weight: number; color: string }
> = {
  low: { label: "Low", weight: 1, color: "#6d7482" },
  medium: { label: "Medium", weight: 2, color: "#c7a46a" },
  high: { label: "High", weight: 3, color: "#d43d31" },
  critical: { label: "Critical", weight: 4, color: "#ff5a4a" },
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

const STORAGE_KEY = "shadowquest_todos_v1";
const PROFILE_KEY = "shadowquest_profile_v1";

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

/** Seed with a few example tasks so the dashboard is never empty. */
export function seedTasks(): Task[] {
  const today = todayISO();
  return [
    {
      id: makeId(),
      title: "Complete Assignment / Project",
      description: "Finish today's most important deep work task.",
      priority: "high",
      difficulty: "hard",
      dueDate: today,
      daily: false,
      factors: [
        { factor: "knowledge", amount: 4 },
        { factor: "discipline", amount: 2 },
      ],
      progress: 100,
      rewardPoints: 30,
      status: "pending",
      createdAt: Date.now() - 3600_000,
      category: "Deep Work",
    },
    {
      id: makeId(),
      title: "30 Minute Workout",
      description: "Strength or cardio — move the body.",
      priority: "medium",
      difficulty: "normal",
      dueDate: today,
      daily: true,
      factors: [
        { factor: "strength", amount: 4 },
        { factor: "energy", amount: 2 },
      ],
      progress: 80,
      rewardPoints: 20,
      status: "pending",
      createdAt: Date.now() - 7200_000,
      category: "Health",
    },
    {
      id: makeId(),
      title: "Read for 30 Minutes",
      description: "Book, article, or course material.",
      priority: "medium",
      difficulty: "easy",
      dueDate: today,
      daily: true,
      factors: [
        { factor: "knowledge", amount: 3 },
        { factor: "focus", amount: 2 },
      ],
      progress: 60,
      rewardPoints: 15,
      status: "pending",
      createdAt: Date.now() - 7200_000,
      category: "Learning",
    },
    {
      id: makeId(),
      title: "Plan Tomorrow",
      description: "Review today and set tomorrow's priorities.",
      priority: "low",
      difficulty: "trivial",
      daily: true,
      factors: [{ factor: "discipline", amount: 1 }],
      progress: 30,
      rewardPoints: 8,
      status: "pending",
      createdAt: Date.now() - 3600_000,
      category: "Planning",
    },
  ];
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Task[];
      // Update overdue statuses
      const today = todayISO();
      return parsed.map((t) => {
        if (t.status === "pending" && t.dueDate && dayDiff(today, t.dueDate) < 0) {
          return { ...t, status: "overdue" as TaskStatus };
        }
        return t;
      });
    }
  } catch {
    /* ignore */
  }
  return seedTasks();
}

export function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Profile;
      // Reset today count if date changed
      const today = todayISO();
      if (parsed.lastActiveDate !== today) {
        parsed.todayCompleted = 0;
      }
      return { ...defaultProfile(), ...parsed };
    }
  } catch {
    /* ignore */
  }
  return defaultProfile();
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

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
      message: `${LIFE_FACTOR_META[g.factor].icon} ${LIFE_FACTOR_META[g.factor].label} +${g.amount}`,
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
      events.push({ type: "streak", message: `🔥 CONSISTENCY: ${p.streak} day${p.streak === 1 ? "" : "s"}` });
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
