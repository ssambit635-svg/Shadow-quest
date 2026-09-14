/**
 * google.mjs — real Google OAuth 2.0 / OpenID Connect, server-side.
 *
 * There is nothing simulated in this file. The browser never sees the client
 * secret, never mints a token and never tells the backend who it is: it is
 * sent to Google's own consent screen, Google sends an authorization code
 * back to THIS server, and only after the code has been exchanged over TLS
 * and the returned ID token's signature verified against Google's published
 * keys does an identity exist.
 *
 * The flow, end to end:
 *
 *   1. GET /v1/auth/google/start
 *        · mint `state` (CSRF) + a PKCE verifier + a `nonce`, park them in
 *          this process with a short TTL
 *        · 302 the browser to accounts.google.com with the challenge
 *   2. Google authenticates the human and redirects to
 *      GET /v1/auth/google/callback?code=…&state=…
 *        · the state must match one we minted (one-time use, TTL'd)
 *        · the code is exchanged for tokens using client_id + client_secret
 *          + code_verifier — a server-to-server call
 *        · the id_token is verified: RS256 signature against Google's JWKS,
 *          `iss`, `aud`, `exp`, `nonce`, and `email_verified`
 *   3. the verified profile becomes a MongoDB user (index.mjs), a normal
 *      ShadowQuest session token is minted, and the browser is redirected
 *      back to the app with a ONE-TIME handoff code — never the session
 *      token itself, which would end up in history, logs and referrers
 *   4. POST /v1/auth/google/exchange trades that handoff code, once, for the
 *      session token the rest of the API already understands.
 *
 * Configuration is entirely environment-driven (see .env.example):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL
 *   SQ_APP_ORIGIN — the app origins this server will redirect back to.
 * Unset → the whole surface is inert and every Google route answers 503,
 * exactly like the admin panel. It never falls back to a fake identity.
 */
import { createHash, createPublicKey, createVerify, randomBytes, timingSafeEqual } from "node:crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** How long an in-flight authorization may take before its state expires. */
const STATE_TTL_MS = 10 * 60_000;
/** How long the app has to redeem the one-time handoff code. */
const HANDOFF_TTL_MS = 2 * 60_000;

/**
 * The origins the Capacitor shell serves its own bundle from.
 *
 * @capacitor/android defaults to hostname "localhost" with scheme "https"
 * (CapConfig.java), so an installed APK loads the app from
 * https://localhost. Google sign-in inside the APK is a full-page navigation
 * out to the backend and back, so that origin has to be a permitted return or
 * the handoff code lands on the website and the app never sees it.
 */
const DEFAULT_NATIVE_ORIGINS = ["https://localhost", "http://localhost"];

/* ------------------------------------------------------------------ *
 * configuration
 * ------------------------------------------------------------------ */

export function googleConfig(env = process.env) {
  const clientId = (env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const callbackUrl = (env.GOOGLE_CALLBACK_URL ?? "").trim();
  const appOrigins = (env.SQ_APP_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return {
    clientId,
    clientSecret,
    callbackUrl,
    appOrigins,
    nativeOrigins: nativeOriginList(env),
    enabled: Boolean(clientId && clientSecret && callbackUrl),
  };
}

/**
 * Which app-shell origins may receive a handoff code.
 *
 *   SQ_NATIVE_ORIGIN unset  → the Capacitor defaults (APK sign-in works)
 *   SQ_NATIVE_ORIGIN=a,b    → exactly those origins
 *   SQ_NATIVE_ORIGIN=off    → none, website-only deployments
 */
function nativeOriginList(env = process.env) {
  const raw = (env.SQ_NATIVE_ORIGIN ?? "").trim();
  if (/^off$/i.test(raw)) return [];
  if (!raw) return [...DEFAULT_NATIVE_ORIGINS];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Origin of the configured callback URL — always a safe return, because it
 * is an env-configured address on this deployment, never a value the
 * browser chose. Lets production Google sign-in complete when the app and
 * the API share a host (the usual Render / same-origin setup) even if
 * SQ_APP_ORIGIN was forgotten.
 */
function callbackOrigin(cfg) {
  if (!cfg?.callbackUrl) return "";
  try {
    return new URL(cfg.callbackUrl).origin;
  } catch {
    return "";
  }
}

/**
 * Where the browser is allowed to land after the callback.
 *
 * An open redirect here would let anyone bounce a freshly-minted handoff
 * code to a host they control, so the answer is an allowlist:
 *   · SQ_APP_ORIGIN set          → those origins
 *   · plus the callback's origin → same-host production, always
 *   · plus SQ_NATIVE_ORIGIN      → the installed APK's own origin
 *   · neither                    → localhost only (dev)
 *
 * The handoff code this redirect carries is single-use and expires in two
 * minutes, and the shell origins are the device's own loopback — they cannot
 * be pointed at a third party.
 */
export function resolveReturn(cfg, requested) {
  const cbOrigin = callbackOrigin(cfg);
  const allowed = new Set(cfg.appOrigins);
  if (cbOrigin) allowed.add(cbOrigin);
  for (const origin of cfg.nativeOrigins ?? []) allowed.add(origin);
  const fallback = cfg.appOrigins[0] || cbOrigin || "http://localhost:5173";
  if (typeof requested !== "string" || !requested) return fallback;
  let url;
  try {
    url = new URL(requested);
  } catch {
    return fallback;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
  const origin = url.origin;
  if (allowed.size) {
    return allowed.has(origin) ? origin : fallback;
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  return local ? origin : fallback;
}

/* ------------------------------------------------------------------ *
 * state + PKCE — one-time, in-memory, TTL'd
 * ------------------------------------------------------------------ */

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function ephemeralVault(ttlMs) {
  const rows = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of rows) if (v.expiresAt <= now) rows.delete(k);
  };
  return {
    put(key, value) {
      sweep();
      rows.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    /** Read AND delete: every key in here is single-use by construction. */
    take(key) {
      sweep();
      if (typeof key !== "string" || !key) return null;
      const row = rows.get(key);
      if (!row) return null;
      rows.delete(key);
      return row.expiresAt > Date.now() ? row.value : null;
    },
    size() {
      sweep();
      return rows.size;
    },
  };
}

const pending = ephemeralVault(STATE_TTL_MS);
const handoffs = ephemeralVault(HANDOFF_TTL_MS);

/**
 * Begin an authorization. Returns the Google URL to send the browser to;
 * the secrets for this attempt stay on the server.
 */
export function beginAuth(cfg, { returnTo, prompt } = {}) {
  const state = b64url(randomBytes(32));
  const nonce = b64url(randomBytes(16));
  const codeVerifier = b64url(randomBytes(48));
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());

  pending.put(state, { nonce, codeVerifier, returnTo });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    include_granted_scopes: "true",
    // Always show the chooser: a shared machine must never silently reuse
    // the last Google session.
    prompt: prompt === "none" ? "none" : "select_account",
  });
  return { url: `${AUTH_ENDPOINT}?${params.toString()}`, state };
}

/** Consume the state Google handed back. Null when unknown/expired/replayed. */
export function takePending(state) {
  return pending.take(state);
}

/* ------------------------------------------------------------------ *
 * token exchange
 * ------------------------------------------------------------------ */

export async function exchangeCode(cfg, { code, codeVerifier }) {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.callbackUrl,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    // Google's error body can echo request parameters — never surface it.
    throw new Error(`token exchange failed (${res.status})`);
  }
  const json = await res.json();
  if (!json?.id_token) throw new Error("token exchange returned no id_token");
  return json;
}

/* ------------------------------------------------------------------ *
 * ID token verification — signature first, claims second
 * ------------------------------------------------------------------ */

let jwksCache = { keys: [], fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60_000;

async function jwks(force = false) {
  const fresh = Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!force && fresh && jwksCache.keys.length) return jwksCache.keys;
  const res = await fetch(JWKS_URI);
  if (!res.ok) throw new Error(`jwks fetch failed (${res.status})`);
  const json = await res.json();
  const keys = Array.isArray(json?.keys) ? json.keys : [];
  if (!keys.length) throw new Error("jwks empty");
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function decodeSegment(seg) {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

/**
 * Verify a Google ID token completely: RS256 signature against the key the
 * header names, then every claim that matters. Returns the claims, or
 * throws. Nothing partial, nothing "probably fine".
 */
export async function verifyIdToken(cfg, idToken, expectedNonce) {
  if (typeof idToken !== "string") throw new Error("id_token missing");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token malformed");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment(headerB64);
  if (header?.alg !== "RS256") throw new Error(`unexpected alg ${header?.alg}`);

  const pickKey = (keys) =>
    keys.find((k) => k.kid === header.kid && (k.alg ?? "RS256") === "RS256");
  let jwk = pickKey(await jwks());
  // Google rotates keys; one forced refetch before giving up.
  if (!jwk) jwk = pickKey(await jwks(true));
  if (!jwk) throw new Error("no matching signing key");

  const key = createPublicKey({ key: jwk, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  if (!verifier.verify(key, Buffer.from(signatureB64, "base64url"))) {
    throw new Error("id_token signature invalid");
  }

  const claims = decodeSegment(payloadB64);
  if (!ISSUERS.has(String(claims.iss))) throw new Error("bad issuer");

  // Constant-time audience check; a mismatch means the token was minted for
  // some other application and must never open an account here.
  const aud = Buffer.from(String(claims.aud ?? ""));
  const mine = Buffer.from(cfg.clientId);
  if (aud.length !== mine.length || !timingSafeEqual(aud, mine)) {
    throw new Error("bad audience");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now - 60) {
    throw new Error("id_token expired");
  }
  if (typeof claims.iat === "number" && claims.iat > now + 300) {
    throw new Error("id_token issued in the future");
  }
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error("nonce mismatch");
  if (!claims.sub) throw new Error("id_token has no subject");
  if (!claims.email) throw new Error("id_token has no email");
  if (claims.email_verified === false) throw new Error("google email not verified");

  return claims;
}

/** The verified Google claims, reduced to the fields ShadowQuest stores. */
export function profileFromClaims(claims) {
  const email = String(claims.email).trim().toLowerCase().slice(0, 254);
  const name = String(claims.name ?? claims.given_name ?? "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  let picture = "";
  const raw = typeof claims.picture === "string" ? claims.picture.trim() : "";
  if (raw) {
    try {
      const u = new URL(raw);
      // Only https, and only Google's own avatar hosts: this URL is rendered
      // in an <img> on every screen the operator sees.
      if (u.protocol === "https:" && /(^|\.)(googleusercontent\.com|google\.com)$/.test(u.hostname)) {
        picture = u.toString().slice(0, 512);
      }
    } catch {
      /* unparsable → no picture, never a guess */
    }
  }
  return {
    googleId: String(claims.sub).slice(0, 64),
    email,
    name: name || email.split("@")[0] || "Operator",
    picture,
  };
}

/* ------------------------------------------------------------------ *
 * handoff — the one-time code the app redeems for its session token
 * ------------------------------------------------------------------ */

export function mintHandoff(payload) {
  const code = b64url(randomBytes(32));
  handoffs.put(code, payload);
  return code;
}

export function takeHandoff(code) {
  return handoffs.take(code);
}

/** Diagnostics only — counts, never contents. */
export function googleVaultSizes() {
  return { pending: pending.size(), handoffs: handoffs.size() };
}
