/**
 * googleAuth.ts — the browser's side of a real Google sign-in.
 *
 * There are no accounts in this file, hardcoded or otherwise. The browser
 * cannot authenticate anybody: it can only (a) hand the page over to the
 * backend, which redirects to Google's own consent screen, and (b) redeem
 * the one-time code the backend leaves in the return URL for the same
 * session token a password sign-in produces.
 *
 *   click  → GET  {api}/v1/auth/google/start?return_to=…   (full-page 302)
 *   Google → GET  {api}/v1/auth/google/callback            (server verifies)
 *   back   → {app}/#/login?sq_auth=ok&code=…
 *   here   → POST {api}/v1/auth/google/exchange            → session token
 *
 * The code in the URL is single-use, expires in two minutes and is stripped
 * from the address bar the instant it is read, so a shared link or a
 * back-button press can never re-open somebody's ledger.
 */
import { apiUrl, exchangeGoogleCode, type GoogleSession } from "../api/ledger";
import { login, type User } from "./auth";

/** Which provider opened the current session, and when. */
const PROVIDER_KEY = "sq.auth.provider.v1";
/** The verified Google profile fields worth showing back to the operator. */
const PROFILE_KEY = "sq.auth.google.v2";

export interface AuthProvider {
  kind: "google" | "local";
  /** Epoch ms of the sign-in. */
  at: number;
}

export interface GoogleProfile {
  email: string;
  name: string;
  /** Google's avatar URL, https and Google-hosted — validated server-side. */
  picture: string;
}

/* ------------------------------------------------------------------ *
 * the provider marker
 * ------------------------------------------------------------------ */

export function readProvider(): AuthProvider | null {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<AuthProvider> | null;
    if (!p || typeof p !== "object") return null;
    if (p.kind !== "google" && p.kind !== "local") return null;
    // Only the fields this app wrote, only in the shapes it expects: a
    // marker from an older build or edited by hand must not smuggle anything
    // into Profile, which renders `at` as a date.
    return {
      kind: p.kind,
      at: typeof p.at === "number" && Number.isFinite(p.at) && p.at > 0 ? p.at : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeProvider(p: AuthProvider | null): void {
  try {
    if (!p) localStorage.removeItem(PROVIDER_KEY);
    else localStorage.setItem(PROVIDER_KEY, JSON.stringify(p));
  } catch {
    /* private mode: the identity itself still lives in lib/auth */
  }
}

/** The Google profile of the current session, when it came from Google. */
export function signedInGoogleProfile(): GoogleProfile | null {
  if (readProvider()?.kind !== "google") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<GoogleProfile> | null;
    if (!p || typeof p !== "object" || typeof p.email !== "string") return null;
    const picture = typeof p.picture === "string" ? p.picture : "";
    return {
      email: p.email.slice(0, 254),
      name: typeof p.name === "string" ? p.name.slice(0, 32) : "",
      // Only ever render an https URL, whatever is on disk.
      picture: /^https:\/\//i.test(picture) ? picture.slice(0, 512) : "",
    };
  } catch {
    return null;
  }
}

function writeGoogleProfile(p: GoogleProfile | null): void {
  try {
    if (!p) localStorage.removeItem(PROFILE_KEY);
    else localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* the session still works without the avatar */
  }
}

export function forgetProvider(): void {
  writeProvider(null);
  writeGoogleProfile(null);
}

/* ------------------------------------------------------------------ *
 * starting the flow
 * ------------------------------------------------------------------ */

/**
 * Hand the page to the backend, which sends it on to Google. A full-page
 * navigation on purpose: a popup is blocked on iOS Safari and inside the
 * Capacitor WebView, and an iframe is refused by Google outright.
 */
export function startGoogleSignIn(): void {
  const returnTo = `${window.location.origin}${window.location.pathname}`;
  window.location.assign(
    `${apiUrl("/v1/auth/google/start")}?return_to=${encodeURIComponent(returnTo)}`,
  );
}

/* ------------------------------------------------------------------ *
 * finishing the flow
 * ------------------------------------------------------------------ */

export type GoogleReturn =
  | { status: "none" }
  | { status: "pending"; code: string }
  | { status: "cancelled" }
  | { status: "error"; reason: string };

/**
 * Read (and immediately erase) the OAuth result the backend left in the URL.
 *
 * The parameters live in the hash — `#/login?sq_auth=…` — because the app is
 * hash-routed and because a hash fragment is never sent to a server, so the
 * handoff code stays out of access logs and Referer headers.
 */
export function readGoogleReturn(): GoogleReturn {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  if (qIndex < 0) return { status: "none" };
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  const verdict = params.get("sq_auth");
  if (!verdict) return { status: "none" };

  // Strip the parameters before anything can await: a refresh, a shared URL
  // or the back button must not carry the code a second time.
  const path = hash.slice(0, qIndex) || "#/login";
  try {
    window.history.replaceState(null, "", path);
  } catch {
    window.location.hash = path;
  }

  if (verdict === "cancelled") return { status: "cancelled" };
  if (verdict === "ok") {
    const code = params.get("code") ?? "";
    return code ? { status: "pending", code } : { status: "error", reason: "no_code" };
  }
  return { status: "error", reason: params.get("reason") ?? "unknown" };
}

/** A refusal that has one clean sentence for the operator. */
export class GoogleAuthError extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

/** Human-readable copy for every way this flow can end badly. */
export function googleErrorMessage(reason: string): string {
  switch (reason) {
    case "expired":
      return "That sign-in link expired. Try Continue with Google again.";
    case "verify":
      return "Google could not be verified. Try again.";
    case "closed":
      return "Registration is closed right now.";
    case "network":
      return "Could not reach ShadowQuest. Check your connection and try again.";
    case "unconfigured":
      return "Google sign-in is not configured on this deployment.";
    case "no_code":
    case "server":
    default:
      return "Google sign-in failed. Try again, or use your email and passphrase.";
  }
}

export interface GoogleOutcome {
  user: User;
  /** created = brand new ledger · linked = joined an existing account. */
  mode: GoogleSession["mode"];
}

/**
 * Trade the handoff code for a session and sign the operator in.
 *
 * The identity written here is the one the *server* returned — the address
 * it verified and the account it resolved — never anything this page chose.
 */
export async function completeGoogleSignIn(code: string): Promise<GoogleOutcome> {
  let session: GoogleSession;
  try {
    session = await exchangeGoogleCode(code);
  } catch {
    throw new GoogleAuthError("network");
  }
  const user = login(session.handle, session.email, session.role);
  writeProvider({ kind: "google", at: Date.now() });
  writeGoogleProfile({
    email: session.email,
    name: session.handle,
    picture: session.picture,
  });
  return { user, mode: session.mode };
}

/** The line shown once a Google sign-in lands, by what the backend did. */
export function welcomeFor(mode: GoogleSession["mode"]): string {
  if (mode === "created") return "New ledger opened — welcome to ShadowQuest.";
  if (mode === "linked") return "Google linked to your existing ShadowQuest account.";
  return "Welcome back.";
}
