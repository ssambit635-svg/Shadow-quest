/**
 * rewards.ts — the client half of the Daily Reward and the Streak Shield.
 *
 * Both features are currency, and currency is decided by the server
 * (server/src/rewards.mjs). This module therefore does exactly three things:
 *
 *   carry — it holds the state the backend reported, and caches the last
 *           known copy so the panels still render something true when the
 *           API is away (the cache is never a source of payout).
 *   ask   — claim / buy / use all go through the API. Nothing here decides
 *           whether a claim is allowed; the answer comes back with the state.
 *   settle — when the server pays, the balance it reports is written into the
 *           local profile, so the push that follows cannot undo the payout by
 *           sending a stale balance back.
 *
 * The local day and the UTC offset are sent with every call: the operator's
 * calendar is the one thing the browser knows and the server cannot. The
 * server checks the day against the offset before it uses either.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  backendReachable,
  buyStreakShield,
  claimDailyReward,
  ensureSignedIn,
  fetchRewards,
  useStreakShield,
  type RewardAnswer,
  type RewardState,
} from "../api/ledger";
import type { User } from "./auth";
import { pushNow } from "./sync";

const cacheKey = (scope: string) => `sq.rewards.${scope}`;

function readCache(scope: string): RewardState | null {
  try {
    const raw = localStorage.getItem(cacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RewardState;
    if (!parsed || typeof parsed !== "object" || !parsed.daily || !parsed.shield) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(scope: string, state: RewardState): void {
  try {
    localStorage.setItem(cacheKey(scope), JSON.stringify(state));
  } catch {
    /* volatile session — the server still holds the truth */
  }
}

/** Drop a cached copy on sign-out, so it can never show the last operator's. */
export function forgetRewardCache(scope?: string): void {
  try {
    if (scope) localStorage.removeItem(cacheKey(scope));
    else {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sq.rewards.")) localStorage.removeItem(k);
      }
    }
  } catch {
    /* nothing to forget */
  }
}

export interface RewardNotice {
  /** `reward` is points landing, `streak` is the chain being held. */
  kind: "reward" | "streak";
  message: string;
}

export interface RewardsApi {
  state: RewardState | null;
  /** True once the backend has answered in this session. */
  live: boolean;
  busy: boolean;
  /** Re-read the state (pushes the local ledger first, so it is current). */
  refresh: () => Promise<void>;
  /** Ask for today's bonus. Idempotent — the server pays once a day. */
  claim: () => Promise<RewardAnswer | null>;
  buy: () => Promise<RewardAnswer | null>;
  use: () => Promise<RewardAnswer | null>;
}

/**
 * The reward state for one operator.
 *
 * `onPoints` receives the server's authoritative balance after a payout or a
 * purchase — the caller writes it into the profile it renders.
 * `onNotice` receives the one-line message the FX layer shows.
 */
export function useRewards(
  scope: string,
  user: User,
  {
    onPoints,
    onNotice,
  }: { onPoints?: (points: number) => void; onNotice?: (notice: RewardNotice) => void } = {},
): RewardsApi {
  const [state, setState] = useState<RewardState | null>(() => readCache(scope));
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const handlers = useRef({ onPoints, onNotice });
  handlers.current = { onPoints, onNotice };

  // A different operator signs in: show their cache, not the last one's.
  useEffect(() => {
    setState(readCache(scope));
    setLive(false);
  }, [scope]);

  const adopt = useCallback(
    (next: RewardState, notice?: RewardNotice) => {
      setState(next);
      writeCache(scope, next);
      handlers.current.onPoints?.(next.points);
      if (notice) handlers.current.onNotice?.(notice);
    },
    [scope],
  );

  /** Every mutation starts by flushing the ledger the rules read. */
  const ready = useCallback(async (): Promise<boolean> => {
    const ok = await backendReachable();
    if (!ok) return false;
    const token = await ensureSignedIn(scope, { handle: user.handle, email: user.email });
    if (!token) return false;
    await pushNow(scope);
    return true;
  }, [scope, user.handle, user.email]);

  const refresh = useCallback(async () => {
    if (!(await ready())) return;
    const answer = await fetchRewards(scope);
    if (!answer) return;
    setLive(true);
    adopt(answer.state);
  }, [ready, scope, adopt]);

  const claim = useCallback(async () => {
    setBusy(true);
    try {
      if (!(await ready())) return null;
      const answer = await claimDailyReward(scope);
      if (!answer) return null;
      setLive(true);
      adopt(
        answer.state,
        answer.awarded
          ? { kind: "reward", message: `DAILY REWARD +${answer.state.daily.amount} COINS` }
          : undefined,
      );
      return answer;
    } finally {
      setBusy(false);
    }
  }, [ready, scope, adopt]);

  const buy = useCallback(async () => {
    setBusy(true);
    try {
      if (!(await ready())) return null;
      const answer = await buyStreakShield(scope);
      if (!answer) return null;
      setLive(true);
      adopt(
        answer.state,
        answer.bought ? { kind: "streak", message: `STREAK SHIELD ACQUIRED · ${answer.state.shield.count} HELD` } : undefined,
      );
      return answer;
    } finally {
      setBusy(false);
    }
  }, [ready, scope, adopt]);

  const use = useCallback(async () => {
    setBusy(true);
    try {
      if (!(await ready())) return null;
      const answer = await useStreakShield(scope);
      if (!answer) return null;
      setLive(true);
      adopt(
        answer.state,
        answer.used && answer.date
          ? { kind: "streak", message: `STREAK SHIELD HELD ${answer.date}` }
          : undefined,
      );
      return answer;
    } finally {
      setBusy(false);
    }
  }, [ready, scope, adopt]);

  // First read of the session: the state on screen is the server's.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, live, busy, refresh, claim, buy, use };
}

/**
 * The shielded days as last reported by the backend, read straight from the
 * cache. For call sites that complete a task without holding the reward state
 * (the Deep Work room): a covered day must still count as a link in the chain
 * there, or the streak the operator paid to protect would reset anyway.
 */
export function cachedProtectedDates(scope: string): string[] {
  const state = readCache(scope);
  const list = state?.protectedDates ?? state?.shield?.protectedDates ?? [];
  return Array.isArray(list) ? list.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
}

/** The days a shield already covers — the streak reads these as held. */
export function protectedDatesOf(state: RewardState | null): string[] {
  if (!state) return [];
  const list = state.protectedDates ?? state.shield?.protectedDates ?? [];
  return Array.isArray(list) ? list.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
}
