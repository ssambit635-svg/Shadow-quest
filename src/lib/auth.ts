/**
 * auth.ts — the gate.
 *
 * A local-first identity store: the landing page is for everyone, but the
 * ledger (tasks, profile, streaks) lives behind a sign-in and is scoped to
 * whoever opened it. No backend, no password hashing theatre — the operator
 * of this machine is the operator of the account. Data keys are derived from
 * the email so two people on one browser keep separate ledgers.
 *
 * Everything read back out of storage is treated as untrusted. localStorage
 * is shared with any script on this origin and survives across versions, so a
 * record here can be stale, hand-edited, or written by an older build with a
 * different shape. Every reader validates and repairs rather than casting,
 * because one bad field in one bad record used to be enough to white-screen
 * the whole app with no way back to the gate.
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

/** RFC 5321 caps an address at 254 octets. Nothing longer is an email. */
const MAX_EMAIL = 254;
/** The design gives a name 32 characters of room; storage agrees. */
const MAX_HANDLE = 32;

/**
 * Control characters, zero-width joiners and the bidi override marks. These
 * are the characters that let a display name do something other than display:
 * `U+202E` reverses the rest of the line, `U+200B` makes two visibly identical
 * names resolve to different scopes, and a newline smuggles a fake row into
 * any plain-text export of the ledger.
 */
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/**
 * Angle brackets, stripped from display names.
 *
 * React escapes text nodes, so a name containing markup is already inert on
 * every screen this app renders today. Stripping it here anyway is defence in
 * depth: the handle is the one string that gets carried into places a future
 * change might not escape — a canvas label, a notification body, a shared
 * export — and a name never needs `<` to be a name.
 */
const BRACKETS = /[<>]/g;

/**
 * Normalise an address: one identity per address, whatever case it arrived
 * in. Lowercasing here is what keeps `A@B.com` and `a@b.com` on the same
 * ledger — the scope is derived from this string, and a scope that depends on
 * shift-key state silently loses the operator's data.
 */
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(INVISIBLE, "").trim().toLowerCase().slice(0, MAX_EMAIL);
}

/** Normalise a display name, falling back to the address when there is none. */
export function normalizeHandle(raw: unknown, email = ""): string {
  const base =
    typeof raw === "string"
      ? raw.replace(INVISIBLE, "").replace(BRACKETS, "").replace(/\s+/g, " ").trim()
      : "";
  const local = email.split("@")[0]?.replace(INVISIBLE, "").replace(BRACKETS, "").trim() ?? "";
  return (base || local || "Operator").slice(0, MAX_HANDLE);
}

/** A stored email is only usable if it still looks like an address. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Coerce an arbitrary parsed record into a User, or reject it. Rejecting is
 * safe: the caller falls back to "nobody is signed in", which sends the
 * operator to the gate instead of crashing on a missing method.
 */
function toUser(raw: unknown): User | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const email = normalizeEmail(r.email);
  if (!email || !EMAIL_SHAPE.test(email)) return null;
  const joined =
    typeof r.joinedAt === "number" && Number.isFinite(r.joinedAt) && r.joinedAt > 0
      ? r.joinedAt
      : Date.now();
  return { handle: normalizeHandle(r.handle, email), email, joinedAt: joined };
}

/**
 * Identity for a browser that refuses storage (Safari private mode, cookies
 * blocked, a full quota). The session still works — it just does not survive a
 * refresh — which beats throwing out of the sign-in handler and leaving the
 * gate bouncing the operator back and forth.
 */
let memoryUser: User | null = null;
let storageBroken = false;

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    storageBroken = true;
    return null;
  }
}

export function currentUser(): User | null {
  const raw = read();
  if (raw !== null) {
    try {
      const u = toUser(JSON.parse(raw));
      if (u) return u;
      // A record we cannot trust is worse than no record: clear it so the
      // operator lands on the gate instead of re-reading the same bad value.
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* nothing more to do */
      }
    } catch {
      return memoryUser;
    }
  }
  return memoryUser;
}

export function login(handle: string, email: string): User {
  const cleanEmail = normalizeEmail(email);
  const cleanHandle = normalizeHandle(handle, cleanEmail);
  const existing = currentUser();
  const user: User = {
    handle: cleanHandle,
    email: cleanEmail,
    joinedAt: existing && existing.email === cleanEmail ? existing.joinedAt : Date.now(),
  };
  memoryUser = user;
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // Storage refused: keep the session in memory and carry on.
    storageBroken = true;
  }
  window.dispatchEvent(new Event(EVENT));
  return user;
}

export function logout(): void {
  memoryUser = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* already gone as far as this session is concerned */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** True when this browser will not keep the identity across a refresh. */
export function identityIsVolatile(): boolean {
  return storageBroken;
}

/**
 * Data scope for one user — the key fragment ledger storage hangs off.
 *
 * The address is lowercased *before* the strip, not after: the old order let
 * `A@B.com` collapse to "com" while `a@b.com` gave "abcom", so the same person
 * signing in twice could land on two different ledgers.
 */
export function scopeOf(u: User | null): string {
  return normalizeEmail(u?.email ?? "").replace(/[^a-z0-9]/g, "") || "guest";
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
