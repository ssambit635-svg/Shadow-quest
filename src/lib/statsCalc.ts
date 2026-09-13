/**
 * statsCalc.ts — the stats aggregation, client-side.
 *
 * The backend computes the same shape in server/src/engine.mjs and the stats
 * dashboard prefers it. This module exists so the dashboard still renders
 * real numbers when the backend is away: everything is derived from the
 * operator's own stored ledger — never invented.
 */
import type { BackendStats, DailyStat, WeeklyStat } from "../api/ledger";
import type { Habit } from "./habits";
import { LIFE_FACTOR_META, type LifeFactor, type Profile, type Task } from "./todo";

const dayISO = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function computeStats(
  profile: Profile,
  tasks: Task[],
  habits: Habit[],
  days = 84,
): BackendStats {
  const done = tasks.filter((t) => t.status === "completed" && t.completedAt);

  const daily: DailyStat[] = [];
  const byDate = new Map<string, DailyStat>();
  for (let i = days - 1; i >= 0; i--) {
    const row: DailyStat = {
      date: dayISO(Date.now() - i * 86400000),
      sealed: 0,
      seals: 0,
      progress: 0,
      points: 0,
    };
    daily.push(row);
    byDate.set(row.date, row);
  }
  for (const t of done) {
    const row = byDate.get(dayISO(t.completedAt!));
    if (!row) continue;
    row.sealed += 1;
    row.progress += t.progress;
    row.points += t.rewardPoints;
  }
  for (const h of habits) {
    for (const date of h.history) {
      const row = byDate.get(date);
      if (row) row.seals += 1;
    }
  }

  // Weekly buckets — last 8 Mondays, local time.
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
  const weekly: WeeklyStat[] = [];
  for (let w = 7; w >= 0; w--) {
    weekly.push({ start: monday - w * 7 * 86400000, progress: 0, sealed: 0 });
  }
  for (const t of done) {
    const c = t.completedAt!;
    if (c < weekly[0].start) continue;
    const idx = Math.floor((c - weekly[0].start) / (7 * 86400000));
    if (idx >= 0 && idx < weekly.length) {
      weekly[idx].progress += t.progress;
      weekly[idx].sealed += 1;
    }
  }

  const factors: Record<string, number> = Object.fromEntries(
    (Object.keys(LIFE_FACTOR_META) as LifeFactor[]).map((f) => [f, 0]),
  );
  for (const t of done) {
    for (const g of t.factors) {
      if (factors[g.factor] !== undefined) factors[g.factor] += g.amount;
    }
  }

  const catMap = new Map<string, { label: string; points: number; count: number }>();
  for (const t of done) {
    const key = (t.category ?? "General").trim() || "General";
    const row = catMap.get(key) ?? { label: key, points: 0, count: 0 };
    row.points += t.rewardPoints;
    row.count += 1;
    catMap.set(key, row);
  }

  const weekMs = Date.now() - 7 * 86400000;
  const weeklyPoints = done
    .filter((t) => t.completedAt! >= weekMs)
    .reduce((a, t) => a + t.rewardPoints, 0);

  return {
    profile,
    openTasks: tasks.filter((t) => t.status !== "completed").length,
    completedTasks: done.length,
    habitsCount: habits.length,
    weeklyPoints,
    daily,
    weekly,
    factors,
    categories: [...catMap.values()].sort((a, b) => b.points - a.points),
  };
}
