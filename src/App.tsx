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
import { Field } from "./pages/Field";
import { Dashboard } from "./sections/Dashboard";
import { Ladder } from "./sections/Ladder";
import { logout, scopeOf, useUser } from "./lib/auth";
import { gsap, REDUCED } from "./lib/motion";
import { ReadyContext } from "./lib/ready";

export type Route = "home" | "login" | "app" | "field" | "ladder";

const APP_ROUTES: Route[] = ["app", "field", "ladder"];

const readHash = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, "").replace(/\/+$/, "");
  if (h === "login") return "login";
  if (h === "app" || h === "app/today") return "app";
  if (h === "app/field" || h === "field") return "field";
  if (h === "app/ladder" || h === "ladder") return "ladder";
  return "home";
};

export default function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const [booted, setBooted] = useState(false);
  const user = useUser();
  const wantRef = useRef<Route>(route);

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
    (next: Route) => {
      // Already there (state-wise): never re-play the wipe for a no-op.
      if (wantRef.current === next) return;
      const target =
        next === "login"
          ? "#/login"
          : next === "app"
            ? "#/app"
            : next === "field"
              ? "#/app/field"
              : next === "ladder"
                ? "#/app/ladder"
                : "#/";
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
  // and a signed-in user never sits on the login screen.
  const inApp = APP_ROUTES.includes(route);
  useEffect(() => {
    if (inApp && !user && !signingOutRef.current) go("login");
    if (route === "login" && user) go("app");
    if (!inApp) signingOutRef.current = false;
  }, [inApp, route, user, go]);

  const signOut = useCallback(() => {
    signingOutRef.current = true;
    logout();
    go("home");
  }, [go]);

  // Body flag drives the frame corners + chrome fade-in after boot.
  useEffect(() => {
    document.body.dataset.booted = booted ? "true" : "false";
  }, [booted]);

  return (
    <ReadyContext.Provider value={booted}>
      <Boot
        onDone={() => {
          setBooted(true);
          gsap.fromTo(
            "#app-main",
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.9, ease: "brush", clearProps: "all" },
          );
        }}
      />

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

      <Nav route={route} user={user} onNavigate={go} onSignOut={signOut} />

      <main id="app-main">
        {route === "home" && (
          <Home
            user={user}
            onEnter={() => go(user ? "app" : "login")}
            onDeepWork={() => go(user ? "field" : "login")}
          />
        )}
        {route === "login" && <Login onDone={() => go("app")} />}
        {route === "app" && user && (
          <div className="app-page">
            <Dashboard scope={scopeOf(user)} user={user} />
          </div>
        )}
        {route === "field" && user && <Field onExit={() => go("app")} />}
        {route === "ladder" && user && (
          <div className="app-page">
            <Ladder />
          </div>
        )}
        {/* while the gate decides where an unauthenticated app-route goes,
            hold the last valid screen instead of flashing a blank */}
        {inApp && !user && (
          <div className="app-page" aria-hidden="true" />
        )}
      </main>
    </ReadyContext.Provider>
  );
}
