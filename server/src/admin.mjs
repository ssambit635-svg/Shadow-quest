/**
 * admin.mjs — the operator's control panel, server-side.
 *
 * ShadowQuest has exactly one privileged role: the admin — the person who
 * owns the app. Elevation is deliberate and double-gated:
 *
 *   1. the email must be listed in ADMIN_EMAILS, and
 *   2. the caller must present ADMIN_PIN, checked in constant time.
 *
 * Success mints a short-lived admin token (random 32 bytes, held in memory
 * only, 6h TTL). No password hash of the PIN ever leaves the process, no
 * admin token is ever persisted, and when ADMIN_PIN is unset the whole
 * surface is inert — every admin route answers 403.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

const ADMIN_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

export function adminConfig(env = process.env) {
  const emails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const pin = (env.ADMIN_PIN ?? "").trim();
  const maxUsers = Number(env.SQ_MAX_USERS ?? 1000);
  return {
    emails: new Set(emails),
    pin,
    /** True when the admin surface can actually be reached. */
    enabled: emails.length > 0 && pin.length >= 8,
    maxUsers: Number.isFinite(maxUsers) && maxUsers > 0 ? maxUsers : 1000,
  };
}

export function isAdminEmail(cfg, email) {
  return cfg.enabled && cfg.emails.has(String(email ?? "").toLowerCase());
}

function vault() {
  /** token → expiresAt. In-memory on purpose: restarts drop every session. */
  const tokens = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [t, exp] of tokens) if (exp <= now) tokens.delete(t);
  };
  return {
    mint() {
      sweep();
      const token = randomBytes(32).toString("base64url");
      tokens.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
      return token;
    },
    check(token) {
      if (!token) return false;
      const exp = tokens.get(token);
      if (!exp) return false;
      if (exp <= Date.now()) {
        tokens.delete(token);
        return false;
      }
      return true;
    },
    revoke(token) {
      tokens.delete(token);
    },
    size() {
      return tokens.size;
    },
  };
}

/** One vault per process, shared by every request. */
export const adminVault = vault();

/** Constant-time PIN comparison; never logs or returns the PIN itself. */
export function pinMatches(cfg, candidate) {
  if (!cfg.enabled) return false;
  const a = Buffer.from(String(candidate ?? ""));
  const b = Buffer.from(cfg.pin);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The role an operator holds right now. */
export function roleOf(cfg, email) {
  return isAdminEmail(cfg, email) ? "admin" : "operator";
}
