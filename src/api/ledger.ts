/**
 * ledger.ts — the data client for the ShadowQuest backend.
 *
 * The duel engine in ./transport stays a self-contained game; everything
 * that belongs to a REAL operator — their tasks, profile, habits, their
 * place on the ladder, their stats — goes through this module to the API.
 *
 * Base URL resolution:
 *   VITE_API_BASE_URL set  → that origin (deployed API / APK builds)
 *   unset                  → "/api", which the dev/preview servers proxy to
 *                            the local backend (see vite.config.ts)
 *
 * Every call degrades: a fetch failure rejects with ApiError and the caller
 * falls back to the device-local ledger. The app never white-screens because
 * the backend is away.
 */
import { ApiError } from "./transport";
import { sanitizeHabits, type Habit } from "../lib/habits";
import { sanitizeTasks, type Profile, type Task } from "../lib/todo";
import type { LeaderRow } from "./types";

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api").replace(
  /\/+$/,
  "",
);

/** True when this build points at something other than a same-origin /api. */
export const API_BASE = BASE;

const JSON_HEADERS = { "content-type": "application/json" } as const;

/* ------------------------------------------------------------------ *
 * tokens — one per scope, kept beside the ledger it belongs to
 * ------------------------------------------------------------------ */

const tokenKey = (scope: string) => `sq.token.${scope}`;

export function storedToken(scope: string): string | null {
  try {
    return localStorage.getItem(tokenKey(scope));
  } catch {
    return null;
  }
}

function keepToken(scope: string, token: string) {
  try {
    localStorage.setItem(tokenKey(scope), token);
  } catch {
    /* private mode: the session simply won't survive a refresh */
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.body ? JSON_HEADERS : {}), ...(init.headers ?? {}) },
    });
  } catch (cause) {
    throw new ApiError("backend unreachable", undefined, cause);
  }
  if (!res.ok) {
    throw new ApiError(`backend responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ *
 * health — probed once, cached for the whole session
 * ------------------------------------------------------------------ */

export type BackendMode = "live" | "device" | "checking";

let healthPromise: Promise<boolean> | null = null;

/** Resolves true when the backend answered. Cached; never throws. */
export function backendReachable(): Promise<boolean> {
  healthPromise ??= call<{ ok?: boolean }>("/v1/health")
    .then((r) => r?.ok === true)
    .catch(() => false);
  return healthPromise;
}

/** Force a re-probe (used after a failure recovered). */
export function reprobeBackend(): void {
  healthPromise = null;
}

/* ------------------------------------------------------------------ *
 * sign-in — registers the operator, returns their bearer token
 * ------------------------------------------------------------------ */

interface SigninResponse {
  token: string;
  user: { id?: string; handle?: string; email?: string; createdAt?: number };
}

const signinCache = new Map<string, Promise<string | null>>();

/**
 * One sign-in per scope at a time. Resolves the token, or null when the
 * backend is away (the caller then stays on the device-local ledger).
 */
export function ensureSignedIn(
  scope: string,
  identity: { handle: string; email: string },
): Promise<string | null> {
  const cached = storedToken(scope);
  if (cached) return Promise.resolve(cached);
  const running = signinCache.get(scope);
  if (running) return running;
  const p = backendReachable().then((ok) => {
    if (!ok) return null;
    return call<SigninResponse>("/v1/auth/signin", {
      method: "POST",
      body: JSON.stringify({ handle: identity.handle, email: identity.email }),
    })
      .then((r) => {
        keepToken(scope, r.token);
        return r.token;
      })
      .catch(() => null);
  });
  signinCache.set(scope, p);
  p.finally(() => signinCache.delete(scope));
  return p;
}

function authHeaders(scope: string): Record<string, string> | null {
  const token = storedToken(scope);
  return token ? { authorization: `Bearer ${token}` } : null;
}

/* ------------------------------------------------------------------ *
 * the ledger — pull / push
 * ------------------------------------------------------------------ */

export interface RemoteLedger {
  profile: Profile | null;
  tasks: Task[];
  habits: Habit[];
  updatedAt: number;
}

/** The operator's stored ledger, or null when there is none / backend away. */
export async function pullLedger(scope: string): Promise<RemoteLedger | null> {
  const headers = authHeaders(scope);
  if (!headers) return null;
  try {
    const raw = await call<{
      profile?: unknown;
      tasks?: unknown[];
      habits?: unknown[];
      updatedAt?: number;
    }>("/v1/ledger", { headers });
    return {
      profile: (raw.profile as Profile | null) ?? null,
      tasks: sanitizeTasks(raw.tasks),
      habits: sanitizeHabits(raw.habits),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Replace the stored ledger. Returns the server timestamp, or null. */
export async function pushLedger(
  scope: string,
  payload: { profile: Profile; tasks: Task[]; habits: Habit[] },
): Promise<number | null> {
  const headers = authHeaders(scope);
  if (!headers) return null;
  try {
    const r = await call<{ updatedAt?: number }>("/v1/ledger", {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });
    return typeof r.updatedAt === "number" ? r.updatedAt : Date.now();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * stats — aggregated server-side for the stats dashboard
 * ------------------------------------------------------------------ */

export interface DailyStat {
  date: string;
  sealed: number;
  seals: number;
  progress: number;
  points: number;
}

export interface WeeklyStat {
  start: number;
  progress: number;
  sealed: number;
}

export interface BackendStats {
  profile: Profile | null;
  openTasks: number;
  completedTasks: number;
  habitsCount: number;
  weeklyPoints: number;
  daily: DailyStat[];
  weekly: WeeklyStat[];
  factors: Record<string, number>;
  categories: { label: string; points: number; count: number }[];
}

export async function fetchStats(scope: string): Promise<BackendStats | null> {
  const headers = authHeaders(scope);
  if (!headers) return null;
  try {
    const raw = await call<Record<string, unknown>>("/v1/stats", { headers });
    if (!raw || !Array.isArray(raw.daily)) return null;
    return raw as unknown as BackendStats;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * leaderboard + people
 * ------------------------------------------------------------------ */

/** Real operators, ranked by total progress. Empty list when unreachable. */
export async function fetchLeaderboard(): Promise<{
  rows: LeaderRow[];
  live: boolean;
}> {
  try {
    const raw = await call<{ items?: unknown[] }>("/v1/leaderboard");
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const rows = items.map((it, i) => {
      const r = it as Record<string, unknown>;
      return {
        rank: typeof r.rank === "number" ? r.rank : i + 1,
        handle: typeof r.handle === "string" ? r.handle : "operator",
        wins: typeof r.wins === "number" ? r.wins : 0,
        losses: typeof r.losses === "number" ? r.losses : 0,
        streak: typeof r.streak === "number" ? r.streak : 0,
        school: typeof r.school === "string" ? r.school : "General Development",
        level: typeof r.level === "number" ? r.level : undefined,
      } satisfies LeaderRow;
    });
    return { rows, live: true };
  } catch {
    return { rows: [], live: false };
  }
}

/** A person the squad can actually add — a real registered operator. */
export interface Person {
  id: string;
  name: string;
  handle: string;
  level: number;
  rank: string;
  streak: number;
  focusArea: string;
  strength: string;
  weeklyPoints: number;
  online: boolean;
  joinedAt: number;
}

export async function fetchPeople(scope: string): Promise<Person[]> {
  const headers = authHeaders(scope);
  if (!headers) return [];
  try {
    const raw = await call<{ items?: unknown[] }>("/v1/people", { headers });
    const items = Array.isArray(raw?.items) ? raw.items : [];
    return items
      .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === "object")
      .map((r) => ({
        id: String(r.id ?? "").slice(0, 64),
        name: String(r.name ?? "Operator").slice(0, 32),
        handle: String(r.handle ?? "operator").slice(0, 32),
        level: typeof r.level === "number" ? r.level : 1,
        rank: String(r.rank ?? "E").slice(0, 4),
        streak: typeof r.streak === "number" ? r.streak : 0,
        focusArea: String(r.focusArea ?? "General Development").slice(0, 64),
        strength: String(r.strength ?? "discipline"),
        weeklyPoints: typeof r.weeklyPoints === "number" ? r.weeklyPoints : 0,
        online: r.online === true,
        joinedAt: typeof r.joinedAt === "number" ? r.joinedAt : Date.now(),
      }))
      .filter((p) => p.id.length > 0);
  } catch {
    return [];
  }
}
