/**
 * security.mjs — the backend's own gatekeepers.
 *
 *   password policy  — what "a real password" means for ShadowQuest, and
 *                      the scrypt hash that stores it. Hashes only: the
 *                      plaintext password is never persisted, never logged.
 *   rate limit       — a fixed-window limiter with zero dependencies, so
 *                      sign-up / sign-in / ledger writes cannot be spammed.
 *
 * Everything here is in-memory and per-process: honest for the scale this
 * backend runs at, and it never leaks state into the store.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------------ *
 * password policy — the same shape the client enforces in the UI
 * ------------------------------------------------------------------ */

export const PASSWORD_POLICY = {
  min: 12,
  max: 128,
  /** Every class the password must contain. */
  classes: ["lower", "upper", "digit", "symbol"],
  classesLabel:
    "at least one lowercase letter, one uppercase letter, one digit and one symbol",
};

/** The concrete, testable rules behind the policy. */
export function passwordProblems(pw) {
  if (typeof pw !== "string" || pw.length === 0) return ["password is required"];
  const out = [];
  if (pw.length < PASSWORD_POLICY.min) {
    out.push(`at least ${PASSWORD_POLICY.min} characters`);
  }
  if (pw.length > PASSWORD_POLICY.max) {
    out.push(`at most ${PASSWORD_POLICY.max} characters`);
  }
  if (!/[a-z]/.test(pw)) out.push("a lowercase letter");
  if (!/[A-Z]/.test(pw)) out.push("an uppercase letter");
  if (!/[0-9]/.test(pw)) out.push("a digit");
  if (!/[^a-zA-Z0-9]/.test(pw)) out.push("a symbol");
  return out;
}

export function passwordValid(pw) {
  return passwordProblems(pw).length === 0;
}

/* ------------------------------------------------------------------ *
 * scrypt hashing — per-user salt, constant-time compare
 * ------------------------------------------------------------------ */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** Hash a password. Returns the record we persist — never the password. */
export function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(password, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return {
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    salt: salt.toString("base64"),
    hash: key.toString("base64"),
  };
}

/** Constant-time check of a password against a stored hash record. */
export function verifyPassword(password, record) {
  if (
    !record ||
    typeof record !== "object" ||
    typeof record.salt !== "string" ||
    typeof record.hash !== "string"
  ) {
    return false;
  }
  try {
    const salt = Buffer.from(record.salt, "base64");
    const expected = Buffer.from(record.hash, "base64");
    const key = scryptSync(password, salt, expected.length, {
      N: Number(record.n) || SCRYPT_N,
      r: Number(record.r) || SCRYPT_R,
      p: Number(record.p) || SCRYPT_P,
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * rate limit — fixed windows, one Map, no deps
 * ------------------------------------------------------------------ */

/**
 * limiter(max, windowMs) → fn(key): { allowed } | { retryAfterMs }
 * Keys are strings ("signin:1.2.3.4", "pw:user@host"). Windows are fixed,
 * which is fine at this scale and keeps the implementation trivially correct.
 */
export function limiter(max, windowMs) {
  const hits = new Map();

  /** Opportunistic sweep so a long-lived process never grows unbounded. */
  const sweep = (now) => {
    if (hits.size < 10_000) return;
    for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
  };

  return (key) => {
    const now = Date.now();
    sweep(now);
    const row = hits.get(key);
    if (!row || now - row.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return { allowed: true };
    }
    row.count += 1;
    if (row.count > max) {
      return { allowed: false, retryAfterMs: windowMs - (now - row.start) };
    }
    return { allowed: true };
  };
}

/** RFC 6585 headers for a refused request. */
export function refused(res, retryAfterMs, message) {
  res.set("retry-after", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return res.status(429).json({ error: message });
}
