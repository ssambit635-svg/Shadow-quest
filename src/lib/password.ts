/**
 * password.ts — the client half of the password gate.
 *
 * Two jobs:
 *
 *   policy  — the same minimum bar the server enforces, so the form refuses
 *             a weak password before it ever leaves the device, plus a
 *             strength score the meter renders.
 *
 *   local verifier — the device's own gate when the backend is away.
 *             PBKDF2-SHA-256 (210 000 iterations, per-user salt) so the
 *             stored record is a key-derivation, not the password. It cannot
 *             resist someone with full access to the browser's storage —
 *             nothing local-first can — but it keeps a stranger who opens
 *             this browser from walking into the ledger. The server hash
 *             (scrypt) remains the authoritative gate whenever the API is
 *             reachable.
 */
import { scopeOf, type User } from "./auth";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export interface PolicyCheck {
  ok: boolean;
  /** Human list of what is still missing. */
  problems: string[];
  /** 0–4 for the meter. */
  score: number;
}

const RULES: { test: (pw: string) => boolean; label: string; weight: number }[] = [
  { test: (pw) => pw.length >= PASSWORD_MIN, label: `${PASSWORD_MIN}+ characters`, weight: 1 },
  { test: (pw) => /[a-z]/.test(pw), label: "lowercase letter", weight: 1 },
  { test: (pw) => /[A-Z]/.test(pw), label: "uppercase letter", weight: 1 },
  { test: (pw) => /[0-9]/.test(pw), label: "digit", weight: 1 },
  { test: (pw) => /[^a-zA-Z0-9]/.test(pw), label: "symbol", weight: 1 },
];

/** Check a candidate password against the policy. */
export function checkPassword(pw: string): PolicyCheck {
  const problems: string[] = [];
  let score = 0;
  for (const rule of RULES) {
    if (rule.test(pw)) score += rule.weight;
    else problems.push(rule.label);
  }
  if (pw.length > PASSWORD_MAX) problems.unshift(`at most ${PASSWORD_MAX} characters`);
  // Length beyond the minimum buys extra strength up the meter.
  if (score === 5 && pw.length >= 16) score = Math.min(5, score + 1);
  return { ok: problems.length === 0, problems, score };
}

export const passwordOk = (pw: string) => checkPassword(pw).ok;

/* ------------------------------------------------------------------ *
 * local verifier — PBKDF2, WebCrypto
 * ------------------------------------------------------------------ */

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const keyFor = (scope: string) => `sq.pw.${scope}`;

function subtle(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

function cryptoApi(): Crypto | null {
  return globalThis.crypto ?? null;
}

function bytesToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface LocalPwRecord {
  v: 1;
  iters: number;
  salt: string;
  hash: string;
}

async function derive(password: string, salt: Uint8Array, iters: number): Promise<Uint8Array> {
  const s = subtle();
  if (!s) throw new Error("webcrypto unavailable");
  const key = await s.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await s.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: iters, hash: "SHA-256" },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Write (or overwrite) the local verifier for a scope. */
export async function setLocalPassword(user: User | null, password: string): Promise<boolean> {
  const api = cryptoApi();
  if (!api?.subtle || !user) return false;
  const salt = api.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  const record: LocalPwRecord = {
    v: 1,
    iters: ITERATIONS,
    salt: bytesToB64(salt),
    hash: bytesToB64(hash),
  };
  try {
    localStorage.setItem(keyFor(scopeOf(user)), JSON.stringify(record));
    return true;
  } catch {
    return false; // storage refused — the session stays memory-only
  }
}

function readRecord(user: User | null): LocalPwRecord | null {
  if (!user) return null;
  try {
    const raw = localStorage.getItem(keyFor(scopeOf(user)));
    if (!raw) return null;
    const rec = JSON.parse(raw) as LocalPwRecord;
    if (
      rec?.v === 1 &&
      typeof rec.salt === "string" &&
      typeof rec.hash === "string" &&
      Number.isFinite(rec.iters)
    ) {
      return rec;
    }
  } catch {
    /* corrupt record = no record */
  }
  return null;
}

/** Does this device already hold a local verifier for the user? */
export function hasLocalPassword(user: User | null): boolean {
  return readRecord(user) !== null;
}

/**
 * Verify a password against the local record. Returns:
 *   "verified" — it matched,
 *   "wrong"    — it did not,
 *   "unset"    — no record on this device (first-set-wins applies).
 */
export async function verifyLocalPassword(user: User | null, password: string): Promise<"verified" | "wrong" | "unset"> {
  const rec = readRecord(user);
  if (!rec) return "unset";
  const s = subtle();
  if (!s) return "unset";
  try {
    const hash = await derive(password, b64ToBytes(rec.salt), rec.iters);
    const expected = b64ToBytes(rec.hash);
    if (hash.length !== expected.length) return "wrong";
    // Constant-time comparison against the stored key.
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
    return diff === 0 ? "verified" : "wrong";
  } catch {
    return "unset";
  }
}
