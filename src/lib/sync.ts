/**
 * sync.ts — the bridge between the device ledger and the backend.
 *
 * The screens keep working exactly as they always did (state in React,
 * persistence in localStorage). This module adds two directions on top:
 *
 *   pull — once per scope per session, ask the backend for the stored
 *          ledger; when it is newer than what this device has, adopt it.
 *   push — after any mutation, a debounced write-through sends the whole
 *          ledger to the backend (last write wins).
 *
 * When the backend is away nothing throws: the pull resolves to null, the
 * push is skipped, and the operator simply works on the device copy. The
 * moment they sign in somewhere with a live backend, the ledger follows.
 */
import {
  ensureSignedIn,
  pullLedger,
  pushLedger,
  type RemoteLedger,
} from "../api/ledger";
import { currentUser } from "./auth";
import { loadHabits, saveHabits, type Habit } from "./habits";
import {
  loadProfile,
  loadTasks,
  repairProfile,
  saveProfile,
  saveTasks,
  type Profile,
  type Task,
} from "./todo";

const tsKey = (scope: string) => `sq.sync.ts.${scope}`;

/** When this device last wrote the ledger (its own push or an adoption). */
export function localSyncTs(scope: string): number {
  try {
    const v = Number(localStorage.getItem(tsKey(scope)) ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function setLocalSyncTs(scope: string, ts: number): void {
  try {
    localStorage.setItem(tsKey(scope), String(ts));
  } catch {
    /* volatile session only */
  }
}

/* ------------------------------------------------------------------ *
 * pull — one snapshot per scope per session
 * ------------------------------------------------------------------ */

export interface SyncSnapshot {
  profile: Profile | null;
  tasks: Task[];
  habits: Habit[];
  updatedAt: number;
  /** True when the backend answered (even if it had nothing stored). */
  live: boolean;
}

const snapshots = new Map<string, Promise<SyncSnapshot | null>>();

/**
 * The operator's backend ledger, resolved once per scope. Returns null only
 * when the backend is unreachable; a reachable backend with nothing stored
 * resolves to a live snapshot with an empty ledger.
 */
export function fetchSnapshot(
  scope: string,
  identity: { handle: string; email: string },
): Promise<SyncSnapshot | null> {
  const running = snapshots.get(scope);
  if (running) return running;
  const p = (async (): Promise<SyncSnapshot | null> => {
    const token = await ensureSignedIn(scope, identity);
    if (!token) return null;
    const remote: RemoteLedger | null = await pullLedger(scope);
    if (!remote) return null;
    return {
      profile: remote.profile ? repairProfile(remote.profile) : null,
      tasks: remote.tasks,
      habits: remote.habits,
      updatedAt: remote.updatedAt,
      live: true,
    };
  })();
  snapshots.set(scope, p);
  return p;
}

/** Drop the cached snapshot (sign-out / operator switch). */
export function dropSnapshot(scope?: string): void {
  if (scope) snapshots.delete(scope);
  else snapshots.clear();
}

/** True when the remote ledger is newer than this device's copy. */
export function shouldAdopt(scope: string, snap: SyncSnapshot): boolean {
  if (!snap.live || snap.updatedAt <= 0) return false;
  return snap.updatedAt > localSyncTs(scope);
}

/**
 * Write an adopted snapshot into device storage so every engine (tasks,
 * profile, habits) sees the same data the backend holds.
 */
export function adoptSnapshot(scope: string, snap: SyncSnapshot): void {
  if (snap.profile) saveProfile(scope, snap.profile);
  saveTasks(scope, snap.tasks);
  saveHabits(scope, snap.habits);
  setLocalSyncTs(scope, snap.updatedAt);
}

/* ------------------------------------------------------------------ *
 * push — debounced write-through of the whole ledger
 * ------------------------------------------------------------------ */

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function readLocalLedger(scope: string): { profile: Profile; tasks: Task[]; habits: Habit[] } {
  return {
    profile: loadProfile(scope),
    tasks: loadTasks(scope),
    habits: loadHabits(scope),
  };
}

export async function pushNow(scope: string): Promise<void> {
  const pending = timers.get(scope);
  if (pending) {
    clearTimeout(pending);
    timers.delete(scope);
  }
  const user = currentUser();
  if (!user) return;
  const token = await ensureSignedIn(scope, { handle: user.handle, email: user.email });
  if (!token) return;
  const ts = await pushLedger(scope, readLocalLedger(scope));
  if (ts !== null) setLocalSyncTs(scope, ts);
}

/**
 * Schedule a push ~0.7s after the last mutation. Burst-safe: completing
 * three goals in a row produces one write.
 */
export function schedulePush(scope: string): void {
  const pending = timers.get(scope);
  if (pending) clearTimeout(pending);
  timers.set(
    scope,
    setTimeout(() => {
      timers.delete(scope);
      void pushNow(scope);
    }, 700),
  );
}

// Flush a pending write when the page goes away, so sealing a goal and
// closing the tab two seconds later does not lose the sync.
if (typeof window !== "undefined") {
  const flush = () => {
    timers.forEach((_, scope) => void pushNow(scope));
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  // Signing out drops every cached snapshot; the next operator pulls fresh.
  window.addEventListener("sq:auth", () => {
    if (!currentUser()) dropSnapshot();
  });
}
