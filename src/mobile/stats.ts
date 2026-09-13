/**
 * stats.ts — the personal character sheet, derived.
 *
 * Nothing here is stored and nothing here calls a backend: every number is
 * computed from the `Profile` the task engine already maintains, so the
 * character sheet can never drift out of step with the ledger. Add a factor
 * to `lib/todo` and it appears here; complete a task and the sheet moves.
 *
 * Two things are authored rather than derived, and both are cosmetic:
 * the archetype names and the tier names. They label a number that already
 * exists — they never produce one.
 */
import {
  GROWTH_RANKS,
  LIFE_FACTOR_META,
  type LifeFactor,
  type Profile,
  type Task,
  completedTasks,
  rankForLevel,
  tasksForToday,
} from "../lib/todo";

/** One factor, ready to draw: value, tier, and its share of the whole. */
export interface FactorStat {
  key: LifeFactor;
  label: string;
  code: string;
  /** 0-100, as stored. */
  value: number;
  /** Japanese reading used for the small seal beside the label. */
  ja: string;
  tier: Tier;
  /** Rank of this factor among the seven, 1 = strongest. */
  rank: number;
}

export interface Tier {
  name: string;
  ja: string;
  /** Lower bound of the band, 0-100. */
  min: number;
}

const TIERS: Tier[] = [
  { name: "Untrained", ja: "初", min: 0 },
  { name: "Novice", ja: "習", min: 20 },
  { name: "Practised", ja: "練", min: 40 },
  { name: "Adept", ja: "熟", min: 60 },
  { name: "Expert", ja: "達", min: 80 },
];

export function tierOf(value: number): Tier {
  let out = TIERS[0];
  for (const t of TIERS) if (value >= t.min) out = t;
  return out;
}

/** Kanji seal per factor — one character, used as a quiet detail. */
const FACTOR_JA: Record<LifeFactor, string> = {
  knowledge: "知",
  focus: "集",
  discipline: "律",
  strength: "力",
  energy: "気",
  wellness: "和",
  skills: "技",
};

export interface Archetype {
  name: string;
  ja: string;
  /** Romaji of `ja`, for the subtitle line. */
  reading: string;
  blurb: string;
  /** The factor that decided it. */
  driver: LifeFactor;
}

const ARCHETYPES: Record<LifeFactor, Omit<Archetype, "driver">> = {
  knowledge: {
    name: "Scholar",
    ja: "学者",
    reading: "gakusha",
    blurb: "You grow by understanding. Reading and study move you further than repetition.",
  },
  focus: {
    name: "Zen Adept",
    ja: "禅士",
    reading: "zenshi",
    blurb: "You grow by depth. One unbroken block is worth more to you than five shallow ones.",
  },
  discipline: {
    name: "Stoic",
    ja: "律者",
    reading: "ritsumono",
    blurb: "You grow by showing up. The streak is the practice, not the reward for it.",
  },
  strength: {
    name: "Titan",
    ja: "力者",
    reading: "rikimono",
    blurb: "You grow by load. The body leads and the rest of the sheet follows it.",
  },
  energy: {
    name: "Vitalist",
    ja: "気者",
    reading: "kimono",
    blurb: "You grow by momentum. Short, frequent strikes suit you better than one long siege.",
  },
  wellness: {
    name: "Harmonist",
    ja: "和者",
    reading: "wamono",
    blurb: "You grow by balance. Recovery is not a pause in your training, it is the training.",
  },
  skills: {
    name: "Artisan",
    ja: "匠",
    reading: "takumi",
    blurb: "You grow by craft. You would rather make one thing well than ten things quickly.",
  },
};

/**
 * The composite read. A straight mean of all seven, rounded — no hidden
 * weighting, so the number can be checked by hand against the bars below it.
 */
export function powerIndex(profile: Profile): number {
  const keys = Object.keys(LIFE_FACTOR_META) as LifeFactor[];
  const sum = keys.reduce((a, k) => a + profile.factors[k], 0);
  return Math.round(sum / keys.length);
}

export function factorStats(profile: Profile): FactorStat[] {
  const keys = Object.keys(LIFE_FACTOR_META) as LifeFactor[];
  // Strongest first, ties broken by declaration order so the sheet is stable.
  const ordered = [...keys].sort((a, b) => profile.factors[b] - profile.factors[a]);
  const rankOf = (k: LifeFactor) => ordered.indexOf(k) + 1;
  return keys.map((k) => {
    const value = Math.round(profile.factors[k]);
    return {
      key: k,
      label: LIFE_FACTOR_META[k].label,
      code: LIFE_FACTOR_META[k].code,
      value,
      ja: FACTOR_JA[k],
      tier: tierOf(value),
      rank: rankOf(k),
    };
  });
}

export function archetypeOf(profile: Profile): Archetype {
  const stats = factorStats(profile);
  const top = [...stats].sort((a, b) => b.value - a.value)[0];
  return { ...ARCHETYPES[top.key], driver: top.key };
}

/** Progress through the rank ladder, 0-100, plus the rank being worked on. */
export function rankTrack(profile: Profile): {
  index: number;
  current: string;
  next: string | null;
  /** Fraction of the way from current rank to the next, 0-100. */
  progress: number;
} {
  const index = Math.max(0, GROWTH_RANKS.indexOf(profile.growthRank));
  const next = GROWTH_RANKS[index + 1] ?? null;
  // A rank is earned every three levels (see rankForLevel in lib/todo).
  const levelsPerRank = 3;
  const into = (profile.lifeLevel - 1) % levelsPerRank;
  return {
    index,
    current: profile.growthRank,
    next,
    progress: next ? Math.round((into / levelsPerRank) * 100) : 100,
  };
}

/** Where the next level sits, and how far through the current one we are. */
export function levelTrack(profile: Profile): {
  pct: number;
  remaining: number;
  nextLevel: number;
} {
  const pct = Math.max(
    0,
    Math.min(100, Math.round((profile.levelProgress / profile.progressToNext) * 100)),
  );
  return {
    pct,
    remaining: Math.max(0, profile.progressToNext - profile.levelProgress),
    nextLevel: profile.lifeLevel + 1,
  };
}

export interface DisciplineStat {
  streak: number;
  longest: number;
  /** Days completed / days on the streak, as a percentage. */
  completionRate: number;
  tasksCompleted: number;
  todayDone: number;
  /** Honest label for the streak, never inflated. */
  verdict: string;
}

export function disciplineOf(profile: Profile, tasks: Task[]): DisciplineStat {
  // Derived from the task list rather than profile.todayCompleted, so the
  // numerator and denominator are the same set of goals.
  const todays = tasksForToday(tasks);
  const sealed = todays.filter((t) => t.status === "completed").length;
  const rate = todays.length ? Math.round((sealed / todays.length) * 100) : 0;
  let verdict = "No streak yet — seal one task today to start it.";
  if (profile.streak >= 30) verdict = "A month held. This is a habit now, not an effort.";
  else if (profile.streak >= 14) verdict = "Two weeks unbroken. The hardest part is behind you.";
  else if (profile.streak >= 7) verdict = "One full week. Consistency is compounding.";
  else if (profile.streak >= 2) verdict = "The chain has started. Do not break it tomorrow.";
  else if (profile.streak === 1) verdict = "Day one is on the board. Day two is what counts.";
  return {
    streak: profile.streak,
    longest: profile.longestStreak,
    completionRate: rate,
    tasksCompleted: profile.tasksCompleted,
    todayDone: sealed,
    verdict,
  };
}

/**
 * Reward Points split by the difficulty they were earned at, so the Rewards
 * screen can show where the points actually came from instead of a total
 * with nothing behind it.
 */
export function rewardBreakdown(tasks: Task[]): {
  label: string;
  points: number;
  count: number;
}[] {
  const out = new Map<string, { label: string; points: number; count: number }>();
  for (const t of completedTasks(tasks)) {
    const key = t.category?.trim() || "General";
    const cur = out.get(key) ?? { label: key, points: 0, count: 0 };
    cur.points += t.rewardPoints;
    cur.count += 1;
    out.set(key, cur);
  }
  return [...out.values()].sort((a, b) => b.points - a.points);
}

/** Achievements are read off the ledger. Nothing is granted that is not true. */
export interface Achievement {
  id: string;
  name: string;
  ja: string;
  detail: string;
  earned: boolean;
  /** 0-100 toward the threshold, for the unearned ones. */
  progress: number;
}

export function achievementsOf(profile: Profile, tasks: Task[]): Achievement[] {
  const done = completedTasks(tasks).length;
  const pi = powerIndex(profile);
  const mk = (
    id: string,
    name: string,
    ja: string,
    detail: string,
    have: number,
    need: number,
  ): Achievement => ({
    id,
    name,
    ja,
    detail,
    earned: have >= need,
    progress: Math.min(100, Math.round((have / need) * 100)),
  });
  return [
    mk("first", "First Step", "初歩", "Complete your first goal", profile.tasksCompleted, 1),
    mk("ten", "Ten Sealed", "十", "Complete 10 goals", profile.tasksCompleted, 10),
    mk("fifty", "Fifty Sealed", "五十", "Complete 50 goals", profile.tasksCompleted, 50),
    mk("streak7", "One Week", "週", "Hold a 7-day streak", profile.streak, 7),
    mk("streak30", "One Month", "月", "Hold a 30-day streak", profile.streak, 30),
    mk("rank-b", "B Rank", "B", "Reach Growth Rank B", GROWTH_RANKS.indexOf(profile.growthRank) + 1, GROWTH_RANKS.indexOf("B") + 1),
    mk("power50", "Balanced", "均", "Reach a 50 Power Index", pi, 50),
    mk("points1k", "Thousand", "千", "Bank 1,000 Reward Points", profile.rewardPoints, 1000),
    mk("done-today", "Clean Slate", "了", "Finish every goal set today", done ? profile.todayCompleted : 0, Math.max(1, profile.todayCompleted || 1)),
  ];
}

/** The rank a given level would carry — re-exported so screens need one import. */
export const rankFor = rankForLevel;
