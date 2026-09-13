/**
 * auth.ts — the gate.
 *
 * A local-first identity store: the landing page is for everyone, but the
 * ledger (tasks, profile, streaks) lives behind a sign-in and is scoped to
 * whoever opened it. No backend, no password hashing theatre — the operator
 * of this machine is the operator of the account. Data keys are derived from
 * the email so two people on one browser keep separate ledgers.
 */
import { useCallback, useEffect, useState } from "react";

export interface User {
  /** Display name — how the nav chip and the dashboard greet you. */
  handle: string;
  /** Stable id + data scope. Normalised to lowercase. */
  email: string;
  /** First sign-in on this device, epoch ms. */
  joinedAt: number;
}

const KEY = "sq.user.v1";
const EVENT = "sq:auth";

export function currentUser(): User | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as User;
    if (!u || typeof u.email !== "string" || !u.email) return null;
    return u;
  } catch {
    return null;
  }
}

export function login(handle: string, email: string): User {
  const cleanEmail = email.trim().toLowerCase();
  const cleanHandle = handle.trim() || cleanEmail.split("@")[0] || "Operator";
  const existing = currentUser();
  const user: User = {
    handle: cleanHandle,
    email: cleanEmail,
    joinedAt: existing && existing.email === cleanEmail ? existing.joinedAt : Date.now(),
  };
  localStorage.setItem(KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(EVENT));
  return user;
}

export function logout(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** Data scope for one user — the key fragment ledger storage hangs off. */
export function scopeOf(u: User | null): string {
  return (u?.email ?? "guest").replace(/[^a-z0-9]/g, "");
}

/** Reactive user. Components re-render on sign-in / sign-out. */
export function useUser(): User | null {
  const [user, setUser] = useState<User | null>(currentUser);
  const sync = useCallback(() => setUser(currentUser()), []);
  useEffect(() => {
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);
  return user;
}
