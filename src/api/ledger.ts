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
import { scopeOf } from "../lib/auth";
import type { LeaderRow } from "./types";

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api").replace(
  /\/+$/,
  "",
);

/** True when this build points at something other than a same-origin /api. */
export const API_BASE = BASE;

/**
 * True when BASE is an absolute http(s) origin rather than a relative prefix.
 *
 * A relative "/api" only works where something serves it — the dev server and
 * the preview server both proxy it. Inside the APK nothing does: the WebView
 * serves the bundle from https://localhost, so a relative base resolves to
 * the app's own origin and every call dies there. The gate uses this to tell
 * "the API is away" from "this build was never pointed at an API".
 */
export const API_BASE_IS_ABSOLUTE = /^https?:\/\//i.test(BASE);

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
  user: {
    id?: string;
    handle?: string;
    email?: string;
    createdAt?: number;
    role?: "operator" | "admin";
  };
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
 * password sign-in — the gate's backend check
 * ------------------------------------------------------------------ */

export type SigninMode = "created" | "verified" | "sealed";

export interface SigninResult {
  token: string;
  mode: SigninMode;
  role: "operator" | "admin";
  id?: string;
}

/** A sign-in the server actively refused — each code maps to one UI line. */
export class PasswordError extends Error {
  code: "wrong-password" | "weak" | "throttled" | "closed" | "unreachable";
  constructor(code: PasswordError["code"]) {
    super(code);
    this.code = code;
  }
}

/**
 * Ask the backend to create / verify / seal the account with the given
 * password. Throws PasswordError for refusals; resolves null only when the
 * backend is unreachable (the caller falls back to the local verifier).
 */
export async function signInWithPassword(
  identity: { handle: string; email: string },
  password: string,
): Promise<SigninResult | null> {
  const ok = await backendReachable();
  if (!ok) return null;
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/auth/signin`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ handle: identity.handle, email: identity.email, password }),
    });
  } catch {
    return null;
  }
  if (res.status === 401) throw new PasswordError("wrong-password");
  if (res.status === 429) throw new PasswordError("throttled");
  if (res.status === 503) throw new PasswordError("closed");
  if (res.status === 400 || res.status === 409) throw new PasswordError("weak");
  if (!res.ok) throw new PasswordError("unreachable");
  const raw = (await res.json().catch(() => null)) as SigninResponse & {
    mode?: SigninMode;
  } | null;
  if (!raw?.token) throw new PasswordError("unreachable");
  keepToken(scopeOf({ email: identity.email, handle: identity.handle, joinedAt: 0 }), raw.token);
  return {
    token: raw.token,
    mode: raw.mode ?? "verified",
    role: raw.user?.role === "admin" ? "admin" : "operator",
    id: raw.user?.id,
  };
}

/* ------------------------------------------------------------------ *
 * Google OAuth — the client half of a flow that happens server-side
 *
 * This module never sees a Google token, an id_token or the client secret.
 * It sends the browser to the backend's /start (which 302s to Google), and
 * later trades the one-time handoff code the backend put in the return URL
 * for the ordinary ShadowQuest session token. Identity is decided entirely
 * by the backend from a signature-verified ID token.
 * ------------------------------------------------------------------ */

/** Absolute form of the API base, needed for a full-page redirect. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(BASE)) return `${BASE}${path}`;
  return `${window.location.origin}${BASE}${path}`;
}

/**
 * Which sign-in methods the deployment actually has configured.
 *
 * `status` is the HTTP code the probe answered with, or undefined when no
 * answer came at all. That difference is the whole point: a 404 means the
 * build is pointed at an address with no ShadowQuest API behind it (a static
 * host with no rewrite, or an APK built without VITE_API_BASE_URL, where
 * "/api" resolves to the WebView's own origin) and checking the wifi will
 * never fix it — while no answer at all really is a connection problem.
 */
export async function fetchAuthProviders(): Promise<{
  password: boolean;
  google: boolean;
  /** False when the backend never answered — distinct from "Google is off". */
  reachable: boolean;
  /** The probe's HTTP status, or undefined when the request never completed. */
  status: number | undefined;
}> {
  try {
    const raw = await call<{ password?: boolean; google?: boolean }>("/v1/auth/providers");
    return {
      password: raw?.password !== false,
      google: raw?.google === true,
      reachable: true,
      status: 200,
    };
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    return { password: true, google: false, reachable: false, status };
  }
}

export interface GoogleSession {
  token: string;
  mode: "created" | "linked" | "returning";
  handle: string;
  email: string;
  picture: string;
  role: "operator" | "admin";
}

/**
 * Redeem the one-time code from the OAuth return URL. The code is single-use
 * and short-lived; the backend refuses a replay, so a refresh of the landing
 * URL can never re-open a session.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleSession> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/auth/google/exchange`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ code }),
    });
  } catch (cause) {
    throw new ApiError("backend unreachable", undefined, cause);
  }
  if (!res.ok) throw new ApiError(`google exchange refused (${res.status})`, res.status);
  const raw = (await res.json().catch(() => null)) as
    | {
        token?: string;
        mode?: GoogleSession["mode"];
        user?: {
          handle?: string;
          email?: string;
          picture?: string;
          role?: "operator" | "admin";
        };
      }
    | null;
  if (!raw?.token || !raw.user?.email) throw new ApiError("google exchange returned nothing");
  const email = String(raw.user.email).toLowerCase();
  const handle = String(raw.user.handle ?? "").slice(0, 32) || email.split("@")[0] || "Operator";
  // The token is filed under the same scope key every other call reads, so
  // the ledger, stats, ladder and squad all authenticate with it unchanged.
  keepToken(scopeOf({ email, handle, joinedAt: 0 }), raw.token);
  return {
    token: raw.token,
    mode: raw.mode === "created" || raw.mode === "linked" ? raw.mode : "returning",
    handle,
    email,
    picture: typeof raw.user.picture === "string" ? raw.user.picture.slice(0, 512) : "",
    role: raw.user.role === "admin" ? "admin" : "operator",
  };
}

/* ------------------------------------------------------------------ *
 * admin — the control panel client
 * ------------------------------------------------------------------ */

const ADMIN_TOKEN_KEY = "sq.admin.token";
const ADMIN_EXPIRY_KEY = "sq.admin.expiry";

/** The admin token lives in sessionStorage only — it dies with the tab. */
export function storedAdminToken(): string | null {
  try {
    const exp = Number(sessionStorage.getItem(ADMIN_EXPIRY_KEY) ?? 0);
    if (exp && exp < Date.now()) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(ADMIN_EXPIRY_KEY);
      return null;
    }
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function keepAdminToken(token: string, expiresInMs: number): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    sessionStorage.setItem(ADMIN_EXPIRY_KEY, String(Date.now() + expiresInMs));
  } catch {
    /* volatile session only */
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_EXPIRY_KEY);
  } catch {
    /* already gone */
  }
}

/**
 * Admin calls carry both identities: the operator token (x-sq-token, which
 * `authed` reads) and the admin token (authorization, which the admin gate
 * checks). Neither alone is enough.
 */
function adminHeaders(scope: string): Record<string, string> | null {
  const userToken = storedToken(scope);
  const adminToken = storedAdminToken();
  if (!userToken || !adminToken) return null;
  return { authorization: `Bearer ${adminToken}`, "x-sq-token": userToken };
}

export type ElevateResult =
  | { ok: true }
  | { ok: false; reason: "wrong-pin" | "throttled" | "denied" | "offline" };

/** Present the PIN; on success the admin token is kept for this tab. */
export async function elevateAdmin(scope: string, pin: string): Promise<ElevateResult> {
  const headers = authHeaders(scope);
  if (!headers) return { ok: false, reason: "offline" };
  try {
    const res = await fetch(`${BASE}/v1/admin/elevate`, {
      method: "POST",
      headers: { ...JSON_HEADERS, ...headers },
      body: JSON.stringify({ pin }),
    });
    if (res.status === 401) return { ok: false, reason: "wrong-pin" };
    if (res.status === 429) return { ok: false, reason: "throttled" };
    if (!res.ok) return { ok: false, reason: "denied" };
    const raw = (await res.json()) as { token?: string; expiresInMs?: number };
    if (!raw?.token) return { ok: false, reason: "denied" };
    keepAdminToken(raw.token, raw.expiresInMs ?? 6 * 60 * 60 * 1000);
    return { ok: true };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

export interface AdminOverview {
  totalUsers: number;
  userCap: number;
  active24h: number;
  active7d: number;
  signups: { date: string; count: number }[];
  top: { handle: string; level: number; streak: number; progress: number }[];
  store: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  handle: string;
  role: "operator" | "admin";
  createdAt: number;
  lastSeenAt: number;
  level: number;
  streak: number;
  progress: number;
  tasks: number;
  hasPassword: boolean;
}

async function adminCall<T>(scope: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const headers = adminHeaders(scope);
  if (!headers) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.body ? JSON_HEADERS : {}), ...headers, ...(init.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchAdminOverview(scope: string): Promise<AdminOverview | null> {
  return adminCall<AdminOverview>(scope, "/v1/admin/overview");
}

export function fetchAdminUsers(
  scope: string,
  q = "",
): Promise<{ items: AdminUserRow[]; total: number } | null> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return adminCall<{ items: AdminUserRow[]; total: number }>(scope, `/v1/admin/users${query}`);
}

export async function adminDeleteUser(scope: string, email: string): Promise<boolean> {
  const r = await adminCall<{ removed?: boolean }>(
    scope,
    `/v1/admin/users/${encodeURIComponent(email)}`,
    { method: "DELETE" },
  );
  return r?.removed === true;
}

export async function adminRevokeAllSessions(scope: string): Promise<number | null> {
  const r = await adminCall<{ revoked?: number }>(scope, "/v1/admin/sessions/revoke-all", {
    method: "POST",
  });
  return typeof r?.revoked === "number" ? r.revoked : null;
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
 * rewards — the daily bonus and the streak shield
 *
 * Server-owned state, server-decided rules: these calls ask, they never
 * decide. Each mutation answers with the full state, so the caller can trust
 * the numbers that come back instead of re-deriving them.
 * ------------------------------------------------------------------ */

export interface DailyRewardState {
  /** What a claim pays, in Reward Points — set by the server. */
  amount: number;
  day: string;
  claimed: boolean;
  claimedDate: string | null;
  /** How many daily bonuses this operator has ever collected. */
  claims: number;
  /** The daily requirement is met by today's recorded work. */
  eligible: boolean;
  ready: boolean;
  reason: "ready" | "claimed" | "no-activity" | "too-soon";
  evidence: { goals: number; habits: number };
  requirement: string;
}

export interface ShieldState {
  count: number;
  cost: number;
  max: number;
  bought: number;
  used: number;
  protectedDates: string[];
  /** The one missed day a shield could hold, or null. */
  missedDate: string | null;
  canUse: boolean;
  useReason:
    | "open"
    | "no-miss"
    | "no-chain"
    | "chain-broken"
    | "no-shield"
    | "used-today";
  canBuy: boolean;
  buyReason: "ready" | "at-max" | "not-enough-points";
}

export interface RewardState {
  /** The server's balance — authoritative for every spend. */
  points: number;
  day: string;
  daily: DailyRewardState;
  shield: ShieldState;
  protectedDates: string[];
}

export interface RewardAnswer {
  state: RewardState;
  /** Present on the claim response. */
  awarded?: boolean;
  bought?: boolean;
  used?: boolean;
  reason?: string;
  date?: string | null;
  status: number;
}

/** This device's UTC offset in minutes, as the server expects it. */
export function tzOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

/**
 * The device's local calendar day. The server recomputes it from the same
 * offset and refuses any day the two disagree on, so this is a statement of
 * where the operator is — never a way to claim a day twice.
 */
export function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function rewardCall(
  scope: string,
  path: string,
  init: RequestInit = {},
): Promise<RewardAnswer | null> {
  const headers = authHeaders(scope);
  if (!headers) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.body ? JSON_HEADERS : {}), ...headers, ...(init.headers ?? {}) },
    });
    const raw = (await res.json().catch(() => null)) as (RewardAnswer & { state?: RewardState }) | null;
    if (!raw?.state) return null;
    return { ...raw, status: res.status };
  } catch {
    return null;
  }
}

const dayBody = () => JSON.stringify({ tz: tzOffsetMinutes(), day: localDayKey() });

/** The current state, straight from the store. Null when the API is away. */
export function fetchRewards(scope: string): Promise<RewardAnswer | null> {
  const tz = tzOffsetMinutes();
  const day = localDayKey();
  return rewardCall(scope, `/v1/rewards?tz=${tz}&day=${day}`);
}

/** Ask for today's bonus. The server pays it once — this can be called freely. */
export function claimDailyReward(scope: string): Promise<RewardAnswer | null> {
  return rewardCall(scope, "/v1/rewards/daily/claim", { method: "POST", body: dayBody() });
}

/** Buy one shield. Refused server-side when the balance or the cap says no. */
export function buyStreakShield(scope: string): Promise<RewardAnswer | null> {
  return rewardCall(scope, "/v1/rewards/shield/buy", { method: "POST", body: dayBody() });
}

/** Spend one shield on the missed day the server identifies. */
export function useStreakShield(scope: string): Promise<RewardAnswer | null> {
  return rewardCall(scope, "/v1/rewards/shield/use", { method: "POST", body: dayBody() });
}

/* ------------------------------------------------------------------ *
 * Life Factor trends — the momentum behind each factor
 * ------------------------------------------------------------------ */

export interface FactorTrend {
  factor: string;
  /** The standing on the character sheet. */
  value: number;
  /** Factor points earned this window, and in the window before it. */
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
}

export interface FactorTrends {
  days: number;
  at: number;
  items: FactorTrend[];
}

/** Server-computed trends, from stored completed work. */
export async function fetchFactorTrends(
  scope: string,
  days = 7,
): Promise<FactorTrends | null> {
  const headers = authHeaders(scope);
  if (!headers) return null;
  try {
    const raw = await call<{ days?: number; items?: unknown[] }>(
      `/v1/progress/factors?days=${days}`,
      { headers },
    );
    if (!raw || !Array.isArray(raw.items)) return null;
    return {
      days: typeof raw.days === "number" ? raw.days : days,
      at: Date.now(),
      items: raw.items
        .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
        .map((i): FactorTrend => ({
          factor: String(i.factor ?? ""),
          value: typeof i.value === "number" ? i.value : 0,
          current: typeof i.current === "number" ? i.current : 0,
          previous: typeof i.previous === "number" ? i.previous : 0,
          delta: typeof i.delta === "number" ? i.delta : 0,
          direction: i.direction === "up" || i.direction === "down" ? i.direction : "flat",
        }))
        .filter((i) => i.factor.length > 0),
    };
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
