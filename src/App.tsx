/**
 * App.tsx — chrome, boot, and a two-route shell.
 *
 * Routing is deliberately hash-based: this is a game front-end, not a content
 * site, and a single document means GSAP timelines (and the ScrollTriggers that
 * measure them) survive navigation instead of being torn down by a router.
 * Route changes are bridged by an ink wipe so the swap reads as a cut, not a
 * reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Boot } from "./components/Boot";
import { Cursor } from "./components/Cursor";
import { Nav } from "./components/Nav";
import { Home } from "./pages/Home";
import { Field } from "./pages/Field";
import { attachCursorRing, gsap, REDUCED } from "./lib/motion";
import { ReadyContext } from "./lib/ready";

type Route = "home" | "field";

const readHash = (): Route =>
  window.location.hash.replace(/^#\/?/, "").startsWith("field") ? "field" : "home";

export default function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const [booted, setBooted] = useState(false);
  const wantRef = useRef<Route>(route);

  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const wipeRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ringRef.current || !dotRef.current) return;
    return attachCursorRing(ringRef.current, dotRef.current);
  }, []);

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
        // A fresh document position per screen: the field has no scroll to keep.
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [wipe]);

  const go = useCallback(
    (next: Route) => {
      const target = next === "field" ? "#/field" : "#/";
      if (window.location.hash === target) {
        wipe(() => setRoute(next));
      } else {
        window.location.hash = target;
      }
    },
    [wipe],
  );

  // Body flag drives the frame corners + chrome fade-in after boot.
  useEffect(() => {
    document.body.dataset.booted = booted ? "true" : "false";
  }, [booted]);

  return (
    <ReadyContext.Provider value={booted}>
      <Cursor ringRef={ringRef} dotRef={dotRef} />
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
        <span className="rail__vertical">影の道</span>
        <span className="rail__dot" />
      </div>
      <div className="rail rail--r">
        <span className="rail__dot" />
        <span className="rail__vertical">SHADOW&nbsp;QUEST</span>
      </div>

      <Nav route={route} onNavigate={go} />

      <main id="app-main">
        {route === "field" ? (
          <Field onExit={() => go("home")} />
        ) : (
          <Home onEnter={() => go("field")} />
        )}
      </main>
    </ReadyContext.Provider>
  );
}
