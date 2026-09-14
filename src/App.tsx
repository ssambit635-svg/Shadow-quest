/**
 * App.tsx — chrome, boot, and the route shell.
 *
 * Routes:
 *   #/            landing — the business page. For everyone.
 *   #/login       the gate.
 *   #/app         the real interface — today's ledger (To-Do).
 *   #/app/field   Deep Work Session (the HUD).
 *   #/app/ladder  milestones.
 *
 * Everything after the gate is auth-gated: the ledger (tasks, profile,
 * streaks) is scoped to the signed-in operator, and the moment the sign-in
 * is gone the shell carries you back to the gate — never to an empty ledger.
 *
 * Routing is deliberately hash-based: one document, so GSAP timelines and
 * ScrollTriggers survive navigation, and route changes are bridged by the
 * ink wipe so the swap reads as a cut, not a reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Boot } from "./components/Boot";
import { Nav } from "./components/Nav";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Admin } from "./pages/Admin";
import { Field } from "./pages/Field";
import { Dashboard } from "./sections/Dashboard";
import { Ladder } from "./sections/Ladder";
import { StatsBoard } from "./sections/StatsBoard";
import { logout, scopeOf, useUser } from "./lib/auth";
import { forgetProvider, hasGoogleReturn } from "./lib/googleAuth";
import { gsap, REDUCED } from "./lib/motion";
import { isNativeApp } from "./lib/native";
import { ReadyContext } from "./lib/ready";
import { APP_ROUTES, hashForRoute, readHash, type Route } from "./lib/route";
/* The phone face. A separate shell with its own chrome, screens and
   stylesheet — mounted below only on a phone viewport or inside the APK,
   so the desktop tree underneath is untouched and still renders as before. */
import { MobileApp } from "./mobile/MobileApp";
import { MobileLogin } from "./mobile/screens/MobileLogin";
import { usePhoneViewport } from "./mobile/device";

export type { Route };

/**
 * Where the shell starts.
 *
 * A Google sign-in return wins over whatever the fragment says. The backend
 * bounces to `#/login?sq_auth=ok&code=…`, and the gate is the only component
 * that can spend that one-time code — so if this reads the URL as anything
 * other than `login`, the code expires unread and the operator who just
 * finished signing in is handed straight back to the sign-in screen. That is
 * exactly what happened when the query was matched as part of the route.
 */
const initialRoute = (): Route => (hasGoogleReturn() ? "login" : readHash());

export default function App() {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [booted, setBooted] = useState(false);
  const user = useUser();
  const wantRef = useRef<Route>(route);

  /**
   * The phone face replaces exactly two destinations: the ledger and the
   * gate. `field` and `ladder` keep the shell's own screens even on a phone —
   * they are already written to the phone breakpoint and are reached *from*
   * the mobile shell, so mounting them twice would only fight over the DOM.
   *
   * Everything else — the landing page, the desktop dashboard, the desktop
   * gate — is untouched and still renders whenever this is false.
   */
  const phone = usePhoneViewport();
  // `stats` is the one extra destination both faces own: a laptop gets the
  // animated dashboard, a phone gets the mobile Stats screen — the phone
  // face reads the hash itself, the shell only has to mount it.
  const mobileApp = phone && (route === "app" || route === "stats");
  const mobileLogin = phone && route === "login";
  const mobileFace = mobileApp || mobileLogin;

  const wipeRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  /**
   * Ink wipe: five vertical blades of ink sweep across, the document swaps
   * underneath them, and they retreat. Sequenced off one timeline so it can
   * never leave the screen half-covered if a navigation is interrupted.
   */
  const wipe = useCallback((swap: () => void) => {
    const bars = barsRef.current?.children;
    if (!wipeRef.current || !bars || REDUCED) {
      swap();
      return;
    }
    const blades = Array.from(bars);
    const tl = gsap.timeline();
    tl
      .set(wipeRef.current, { autoAlpha: 1 })
      .fromTo(
        blades,
        { scaleY: 0, transformOrigin: "top center" },
        { scaleY: 1, duration: 0.34, ease: "power4.in", stagger: 0.045 },
      )
      // The swap is a beat on the timeline, not an onComplete: a staggered
      // tween would otherwise call it once per blade.
      .add(swap)
      .to(blades, {
        scaleY: 0,
        transformOrigin: "bottom center",
        duration: 0.4,
        ease: "power4.out",
        stagger: { each: 0.045, from: "end" },
      })
      .set(wipeRef.current, { autoAlpha: 0 })
      // The whole bank drifts up while it reads, so the cut has direction.
      .to(blades, { yPercent: -6, duration: 0.78, ease: "none" }, 0);
  }, []);

  // Hash is the source of truth; the wipe plays between the two render states.
  useEffect(() => {
    const onHash = () => {
      const next = readHash();
      if (next === wantRef.current) return;
      wantRef.current = next;
      wipe(() => {
        setRoute(next);
        // A fresh document position per screen.
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [wipe]);

  // Set for one beat while signing out, so the gate doesn't argue with
  // the deliberate "back to the landing" navigation.
  const signingOutRef = useRef(false);

  const go = useCallback(
    (next: Route, opts?: { replace?: boolean }) => {
      // Already there (state-wise): never re-play the wipe for a no-op.
      if (wantRef.current === next) return;
      // A sign-in return is still parked in the URL. Rewriting the fragment
      // now would delete the one-time handoff code before the gate spends it,
      // which is how a finished Google sign-in used to arrive back at the
      // sign-in screen. Stand still: the gate reads the code on mount and this
      // navigation becomes possible again the instant the URL is clean.
      if (hasGoogleReturn()) return;
      const target = hashForRoute(next);
      // `replace` swaps the current history entry instead of pushing one.
      // Redirects (the gate, the native boot, sign-out) use it so BACK never
      // walks back *into* a screen the app itself refused to show — without
      // it the APK traps the back button in a login↔app loop, because the
      // WebView maps BACK to history-back while history remains.
      if (opts?.replace) {
        wantRef.current = next;
        try {
          window.history.replaceState(null, "", target);
        } catch {
          window.location.hash = target;
          return; // the hashchange listener completes the swap
        }
        wipe(() => {
          setRoute(next);
          window.scrollTo({ top: 0, behavior: "auto" });
        });
        return;
      }
      if (window.location.hash === target) {
        wantRef.current = next;
        wipe(() => setRoute(next));
      } else {
        window.location.hash = target;
      }
    },
    [wipe],
  );

  // The gate: app routes without a user are carried back to the login,
  // and a signed-in user never sits on the login screen. Both redirects
  // replace, so BACK skips over the refused screen instead of re-entering
  // it and bouncing straight back (the APK's back-button trap).
  const inApp = APP_ROUTES.includes(route);
  useEffect(() => {
    if (inApp && !user && !signingOutRef.current) go("login", { replace: true });
    if (route === "login" && user) go("app", { replace: true });
    if (!inApp) signingOutRef.current = false;
  }, [inApp, route, user, go]);

  // Inside the APK there is no landing page: a cold boot lands straight in
  // the ledger for a signed-in operator, or at the gate for a stranger.
  // A deep link (any hash the shell recognises) is respected as-is.
  const nativeBootRef = useRef(false);
  useEffect(() => {
    if (nativeBootRef.current || !isNativeApp()) return;
    nativeBootRef.current = true;
    // Coming back from Google, the WebView reloads the bundle with the
    // handoff code still in the fragment. This boot redirect must not run
    // first: `replace` would rewrite the fragment and drop the code on the
    // floor, inside the one shell that has no other way to get it back.
    if (hasGoogleReturn()) return;
    if (readHash() === "home") go(user ? "app" : "login", { replace: true });
    // Launch-time identity only; later sign-ins are carried by the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(() => {
    signingOutRef.current = true;
    logout();
    // Drop the provider marker and the cached Google profile too: signing
    // out must leave nothing behind that says who was here.
    forgetProvider();
    // The APK has no landing page to return to — the gate is home.
    if (isNativeApp()) go("login", { replace: true });
    else go("home");
  }, [go]);

  // Body flag drives the frame corners + chrome fade-in after boot.
  useEffect(() => {
    document.body.dataset.booted = booted ? "true" : "false";
  }, [booted]);

  // The stylesheet needs to know which screen owns the viewport so the
  // phone face can reserve room for the docked tab bar behind exactly the
  // routes that show one. `data-route` on <body> is the single source.
  useEffect(() => {
    document.body.dataset.route = route;
  }, [route]);

  return (
    <ReadyContext.Provider value={booted}>
      <Boot onDone={() => setBooted(true)} />

      <div className="frame" />
      <div className="grain" />
      <div className="vignette" />

      <div className="wipe" ref={wipeRef} aria-hidden="true">
        <div className="wipe__bars" ref={barsRef}>
          {Array.from({ length: 5 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>

      <div className="rail rail--l">
        <span className="rail__vertical">◆SQ◆OS◆</span>
        <span className="rail__dot" />
      </div>
      <div className="rail rail--r">
        <span className="rail__dot" />
        <span className="rail__vertical">SHADOW&nbsp;QUEST</span>
      </div>

      {/* The phone face brings its own bar and dock, so the shell's nav is
          not rendered underneath it. On every other screen — the landing
          page, the desktop gate and ledger, and the phone's own Deep Work
          room and ladder — the nav renders exactly as it always did. */}
      {!mobileFace && (
        <Nav route={route} user={user} onNavigate={go} onSignOut={signOut} />
      )}

      <main id="app-main">
        {route === "home" && (
          <Home
            user={user}
            onEnter={() => go(user ? "app" : "login")}
            onDeepWork={() => go(user ? "field" : "login")}
          />
        )}
        {route === "login" && !mobileLogin && <Login onDone={() => go("app")} />}
        {mobileLogin && <MobileLogin onDone={() => go("app")} />}
        {mobileApp && user && <MobileApp user={user} />}
        {route === "app" && !mobileApp && user && (
          <div className="app-page">
            <Dashboard scope={scopeOf(user)} user={user} />
          </div>
        )}
        {route === "field" && user && <Field onExit={() => go("app")} />}
        {route === "stats" && !mobileApp && user && (
          <div className="app-page">
            <StatsBoard scope={scopeOf(user)} user={user} />
          </div>
        )}
        {route === "ladder" && user && (
          <div className="app-page">
            {/* The ladder degrades to this operator's own device ledger when
                the backend is away, so it needs their scope to do it. */}
            <Ladder scope={scopeOf(user)} handle={user.handle} />
          </div>
        )}
        {route === "admin" && user && (
          <div className="app-page">
            {/* The control panel. Access is decided here and re-decided by
                the backend on every call — a local role claim is never
                enough on its own. */}
            <Admin user={user} scope={scopeOf(user)} />
          </div>
        )}
        {/* while the gate decides where an unauthenticated app-route goes,
            hold the last valid screen instead of flashing a blank */}
        {inApp && !user && !mobileFace && (
          <div className="app-page" aria-hidden="true" />
        )}
      </main>
    </ReadyContext.Provider>
  );
}
