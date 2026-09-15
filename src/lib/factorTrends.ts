/**
 * factorTrends.ts — what each Life Factor has been earning lately.
 *
 * A factor's standing is a single stored number, so the honest way to show a
 * direction is the work that moved it: the factor points completed goals paid
 * into it over the last window, against the window before that. The server
 * computes this from the stored ledger (`GET /v1/progress/factors`, see
 * engine.mjs#factorTrends); this module computes the identical figure from
 * the device's own ledger so the indicator is there the moment the screen is,
 * and so it still reads true when the backend is away.
 *
 * Both windows are sums of the operator's own completed tasks. Nothing here
 * invents a number, and nothing here is stored: it is a read-out.
 */
import { useEffect, useMemo, useState } from "react";
import {
  backendReachable,
  ensureSignedIn,
  fetchFactorTrends,
  type FactorTrend,
  type FactorTrends,
} from "../api/ledger";
import type { User } from "./auth";
import { LIFE_FACTOR_META, type LifeFactor, type Profile, type Task } from "./todo";

const DAY_MS = 86400000;
const FACTOR_KEYS = Object.keys(LIFE_FACTOR_META) as LifeFactor[];

export type TrendMap = Partial<Record<LifeFactor, FactorTrend>>;

/** The same computation the backend runs, over the device's ledger. */
export function factorTrendsLocal(
  profile: Profile,
  tasks: Task[],
  days = 7,
): FactorTrends {
  const span = Math.max(1, Math.min(84, Math.round(days)));
  const now = Date.now();
  const recentStart = now - span * DAY_MS;
  const previousStart = now - 2 * span * DAY_MS;

  const current: Record<string, number> = Object.fromEntries(FACTOR_KEYS.map((f) => [f, 0]));
  const previous: Record<string, number> = Object.fromEntries(FACTOR_KEYS.map((f) => [f, 0]));

  for (const t of tasks) {
    if (t.status !== "completed" || !t.completedAt) continue;
    const bucket =
      t.completedAt >= recentStart
        ? current
        : t.completedAt >= previousStart
          ? previous
          : null;
    if (!bucket) continue;
    for (const g of t.factors) {
      if (bucket[g.factor] === undefined) continue;
      bucket[g.factor] += Math.max(0, Math.round(g.amount));
    }
  }

  return {
    days: span,
    at: now,
    items: FACTOR_KEYS.map((f) => {
      const delta = current[f] - previous[f];
      return {
        factor: f,
        value: Math.round(profile.factors[f] ?? 0),
        current: current[f],
        previous: previous[f],
        delta,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      };
    }),
  };
}

const toMap = (trends: FactorTrends): TrendMap =>
  Object.fromEntries(
    trends.items
      .filter((i) => FACTOR_KEYS.includes(i.factor as LifeFactor))
      .map((i) => [i.factor as LifeFactor, i]),
  ) as TrendMap;

/**
 * Trends for the signed-in operator, backend-first.
 *
 * The device computation renders immediately; when the API answers with its
 * own (identical) read of the stored ledger, that replaces it. `live` says
 * which of the two is on screen.
 */
export function useFactorTrends(
  scope: string,
  user: User | null,
  profile: Profile,
  tasks: Task[],
  days = 7,
): { trends: TrendMap; live: boolean } {
  const local = useMemo(() => toMap(factorTrendsLocal(profile, tasks, days)), [profile, tasks, days]);
  const [remote, setRemote] = useState<TrendMap | null>(null);

  // Refetch when the ledger moves — that is exactly when a window's sum can
  // have changed. While the answer is in flight the device computation is on
  // screen, so the chips never lag behind work that was just sealed.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setRemote(null);
    void backendReachable().then(async (ok) => {
      if (!alive || !ok) return;
      const token = await ensureSignedIn(scope, { handle: user.handle, email: user.email });
      if (!alive || !token) return;
      const trends = await fetchFactorTrends(scope, days);
      if (!alive || !trends) return;
      setRemote(toMap(trends));
    });
    return () => {
      alive = false;
    };
  }, [scope, user, days, tasks, profile]);

  return { trends: remote ?? local, live: remote !== null };
}
