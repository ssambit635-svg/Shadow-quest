/**
 * route.ts — how a hash becomes a route, in one place.
 *
 * The shell used to parse the fragment inline in App.tsx with exact string
 * matches. That is fine for a hash the app wrote itself, and broken for a hash
 * somebody else wrote — namely the backend's Google sign-in return, which is
 *
 *     https://host/#/login?sq_auth=ok&code=<one-time handoff>
 *
 * `"login?sq_auth=ok&code=…" === "login"` is false, so the shell read the
 * completed sign-in as the *landing page*, never mounted the gate that owns
 * `readGoogleReturn`, and left the handoff code to expire unread in the
 * address bar. The operator had done everything right — chosen their account,
 * pressed Continue — and was shown the sign-in screen again.
 *
 * So: the query is dropped before the match, always. A fragment query is
 * routing metadata, never part of a destination.
 */

export type Route = "home" | "login" | "app" | "field" | "ladder" | "stats" | "admin";

/** Everything behind the gate. */
export const APP_ROUTES: Route[] = ["app", "field", "ladder", "stats", "admin"];

/**
 * The path part of a fragment: no leading `#/`, no trailing slashes, and no
 * query. `#/login?sq_auth=ok` and `#/login` are the same destination.
 */
export function hashPath(hash: string): string {
  return hash
    .replace(/^#\/?/, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\/+$/, "");
}

/** Pure form, so it can be tested without a window. */
export function routeFromHash(hash: string): Route {
  const h = hashPath(hash);
  if (h === "login") return "login";
  if (h === "app" || h === "app/today") return "app";
  if (h === "app/field" || h === "field") return "field";
  if (h === "app/ladder" || h === "ladder") return "ladder";
  // On a laptop this is the animated stats dashboard; on a phone the shell
  // treats it as an `app` route and the phone face shows its own Stats tab.
  if (h === "app/stats" || h === "stats") return "stats";
  // The operator's control panel. Renders its own access gate.
  if (h === "app/admin" || h === "admin") return "admin";
  // Anything else under #/app/ belongs to the phone face's own sub-navigation
  // (#/app/tasks, /progress, /rewards, /profile, /squad). The shell treats all
  // of them as the `app` route and stays out of the way; the phone face reads
  // the full hash itself. On a laptop the same URL shows the dashboard rather
  // than falling through to the landing page, which is the honest fallback.
  if (h.startsWith("app/")) return "app";
  return "home";
}

/** Live form: what the shell renders right now. */
export function readHash(): Route {
  if (typeof window === "undefined") return "home";
  return routeFromHash(window.location.hash);
}

/** The fragment a route lives at. `go()` writes exactly these. */
const HASH_OF: Record<Route, string> = {
  home: "#/",
  login: "#/login",
  app: "#/app",
  field: "#/app/field",
  ladder: "#/app/ladder",
  stats: "#/app/stats",
  admin: "#/app/admin",
};

export function hashForRoute(route: Route): string {
  return HASH_OF[route] ?? "#/";
}
