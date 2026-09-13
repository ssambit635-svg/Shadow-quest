/**
 * streaks.ts — the streak, computed honestly.
 *
 * The engine (lib/todo) maintains the persisted counters; this module turns
 * the *evidence* — every sealed task, every habit mark, the last active
 * date — into the full streak picture: the live chain, the heat of the last
 * 84 days, and the milestone track. Nothing here invents a day that did not
 * happen.
 *
 * A day counts as active when a task was sealed on it, a habit was marked,
 * or the engine recorded activity. The chain is alive while yesterday or
 * today carries a mark: sealing today is always still possible.
 */
import {
  STREAK_MILESTONES,
  todayISO,
  type Profile,
  type Task,
} from "./todo";
import { loadHabits, type Habit } from "./habits";
import { useEffect, useState } from "react";

export interface DayCell {
  /** Local YYYY-MM-DD. */
  date: string;
  active: boolean;
  /** How much was sealed that day (0-4+, capped for the heat scale). */
  level: number;
}

export interface StreakMilestone {
  days: number;
  label: string;
  points: number;
  earned: boolean;
}

export interface StreakSnapshot {
  /** The live chain, computed from evidence (0 when broken). */
  current: number;
  /** Best ever: engine record, or the computed chain when it beats it. */
  longest: number;
  todayActive: boolean;
  /** The chain is alive while today or yesterday carries a mark. */
  alive: boolean;
  lastActive: string | null;
  /** Last `days` days, oldest → newest. */
  cells: DayCell[];
  milestones: StreakMilestone[];
  next: StreakMilestone | null;
}

export const localISO = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dayBefore = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return localISO(d.getTime());
};

/** Habit state that follows the panel's mutations without lifting its
 *  ownership: re-reads on the write beat (sq:habits), on cross-tab storage
 *  events, and when the scope changes. */
export function useHabitsLive(scope: string): Habit[] {
  const [habits, setHabits] = useState<Habit[]>(() => loadHabits(scope));
  useEffect(() => {
    setHabits(loadHabits(scope));
    const sync = () => setHabits(loadHabits(scope));
    window.addEventListener("sq:habits", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("sq:habits", sync);
      window.removeEventListener("storage", sync);
    };
  }, [scope]);
  return habits;
}

/** Every active day in the window, with its seal count. */
export function activityMap(
  tasks: Task[],
  habits: Habit[],
  days: number,
): Map<string, number> {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffMs = cutoff.getTime();
  const map = new Map<string, number>();
  const bump = (iso: string, n = 1) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const ms = new Date(`${iso}T00:00:00`).getTime();
    if (ms < cutoffMs) return;
    map.set(iso, (map.get(iso) ?? 0) + n);
  };
  for (const t of tasks) {
    if (t.status === "completed" && t.completedAt) bump(localISO(t.completedAt));
  }
  for (const h of habits) {
    for (const date of h.history) bump(date);
  }
  return map;
}

/** The consecutive chain ending on `iso` (inclusive), walking backwards. */
function chainEndingOn(map: Map<string, number>, iso: string): number {
  let cursor = iso;
  let n = 0;
  while (map.has(cursor)) {
    n += 1;
    cursor = dayBefore(cursor);
  }
  return n;
}

export function streakSnapshot(
  profile: Profile,
  tasks: Task[],
  habits: Habit[],
  days = 84,
): StreakSnapshot {
  const map = activityMap(tasks, habits, days);
  const today = todayISO();
  const yesterday = dayBefore(today);
  const todayActive = map.has(today);

  // The live chain runs through today when today is sealed, otherwise it
  // counts through yesterday (today is still open and can extend it).
  const computed = todayActive
    ? chainEndingOn(map, today)
    : map.has(yesterday)
      ? chainEndingOn(map, yesterday)
      : 0;

  const longest = Math.max(Number(profile.longestStreak) || 0, Number(profile.streak) || 0, computed);

  const cells: DayCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const iso = localISO(d.getTime());
    const level = map.get(iso) ?? 0;
    cells.push({ date: iso, active: level > 0, level: Math.min(4, level) });
  }

  const milestones = STREAK_MILESTONES.map((m) => ({
    days: m.days,
    label: m.label,
    points: m.points,
    earned: longest >= m.days,
  }));
  const next = milestones.find((m) => !m.earned) ?? null;
  const lastActive = cells.filter((c) => c.active).pop()?.date ?? null;

  return {
    current: computed,
    longest,
    todayActive,
    alive: todayActive || map.has(yesterday),
    lastActive,
    cells,
    milestones,
    next,
  };
}
