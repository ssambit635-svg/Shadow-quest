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
import {
  API_BASE_IS_ABSOLUTE,
  apiUrl,
  exchangeGoogleCode,
  type GoogleSession,
} from "../api/ledger";
import { ApiError } from "../api/transport";
import { isNativeApp } from "./native";
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
 *
 * The WebView can follow this navigation and, on the way back, its local
 * server serves the bundle again with the handoff code still in the hash —
 * which is how the APK completes the same flow the website does. That only
 * works when the bundle knows where the API is: a relative "/api" inside the
 * shell resolves to https://localhost, where nothing is listening, so the tap
 * would drive the app to a dead end. Refusing here, with a sentence, beats
 * stranding the operator on a blank screen.
 */
export function startGoogleSignIn(): void {
  if (isNativeApp() && !API_BASE_IS_ABSOLUTE) throw new GoogleAuthError("misbuilt");
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

/**
 * Turn whatever the exchange threw into the reason that actually happened.
 *
 * This mapping used to be a single `catch { throw "network" }`, which meant a
 * spent handoff code (401), a rate limit (429) and a deployment with Google
 * switched off (503) all told the operator to check their wifi — and they
 * would, endlessly, because the wifi was never the problem. Every HTTP status
 * the backend can answer with now has its own reason.
 */
export function googleFailureReason(err: unknown): string {
  if (err instanceof GoogleAuthError) return err.reason;
  const status = err instanceof ApiError ? err.status : undefined;
  if (status === 503) return "unconfigured";
  if (status === 401) return "expired";
  if (status === 429) return "throttled";
  if (status === 404) return "missing";
  if (typeof status === "number") return "server";
  // No status. `call` and `exchangeGoogleCode` attach the underlying fetch
  // error as `detail` only when the request never completed, which is the one
  // case where blaming the connection is honest.
  return err instanceof ApiError && err.detail === undefined ? "server" : "network";
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
    case "throttled":
      return "Too many sign-in attempts. Wait a minute and try again.";
    case "network":
      return "Could not reach ShadowQuest. Check your connection and try again.";
    case "unreachable":
      return "ShadowQuest's API did not answer. If this keeps happening the server is down, not your connection — email and passphrase still work.";
    case "missing":
      return "This build points at an address with no ShadowQuest API behind it. Serve the ShadowQuest server (server/) at this origin, or rebuild with VITE_API_BASE_URL set to the API origin — email and passphrase still work meanwhile.";
    case "misbuilt":
      return "This app build has no API address, so Google sign-in cannot reach the server. Rebuild the APK with VITE_API_BASE_URL set — email and passphrase work meanwhile.";
    case "unconfigured":
      return "Google sign-in is not configured on this deployment.";
    case "no_code":
    case "server":
    default:
      return "Google sign-in failed. Try again, or use your email and passphrase.";
  }
}

/**
 * Why the pre-flight probe of /v1/auth/providers did not come back.
 *
 * Checked before anything is sent to Google: a build with no API behind it
 * cannot complete the flow, and the operator deserves that sentence rather
 * than a redirect into nothing.
 */
export function probeFailureReason(status: number | undefined): string {
  if (isNativeApp() && !API_BASE_IS_ABSOLUTE) return "misbuilt";
  // 404 means the request reached *something* — a static host answering for
  // an unknown path — and that something is not the ShadowQuest API.
  if (status === 404) return "missing";
  // No answer at all, or a gateway in between gave up: the server is down.
  return "unreachable";
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
  } catch (err) {
    // Preserve the reason the backend actually gave. A spent code, a rate
    // limit and a switched-off provider all look identical from out here
    // unless the status is carried through.
    throw new GoogleAuthError(googleFailureReason(err));
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
