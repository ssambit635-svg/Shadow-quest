/**
 * Nav.tsx — thin HUD bar. Hides on scroll-down, returns on scroll-up, and
 * carries a blooming ink progress line along its bottom edge.
 *
 * Three faces:
 *   landing  → pitch links + "Sign In" / "Open OS"
 *   login    → brand + back, nothing else — the gate is its own screen
 *   app      → the real interface tabs (Today / Deep Work / Milestones),
 *              the operator's name, and sign out
 *
 * On a phone the app face becomes an actual mobile app: the same three tabs
 * leave the top bar and dock as a fixed **bottom tab bar** (thumb reach, safe
 * from the scroll-hide transform, above the home-gesture inset), while the top
 * bar keeps only the brand and the operator chip.
 */
import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "../lib/motion";
import { toggleTheme, useTheme } from "../lib/theme";
import { Sigil } from "./Sigil";
import type { User } from "../lib/auth";
import type { Route } from "../App";

const PITCH_LINKS = [
  { label: "The System", id: "way" },
  { label: "Focus Areas", id: "growth" },
  { label: "The Loop", id: "form" },
];

const APP_TABS: { label: string; route: Route; id: string; ja: string }[] = [
  { label: "Today", route: "app", id: "today", ja: "今日" },
  { label: "Stats", route: "stats", id: "stats", ja: "統計" },
  { label: "Deep Work", route: "field", id: "field", ja: "集中" },
  { label: "Milestones", route: "ladder", id: "ladder", ja: "道" },
];

const hrefOf = (r: Route) =>
  r === "app" ? "#/app" : r === "field" ? "#/app/field" : r === "stats" ? "#/app/stats" : "#/app/ladder";

export function Nav({
  route,
  user,
  onNavigate,
  onSignOut,
}: {
  route: Route;
  user: User | null;
  onNavigate: (r: Route) => void;
  onSignOut: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const bloomRef = useRef<HTMLSpanElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const lastProgressRef = useRef(0);
  const inApp = route === "app" || route === "field" || route === "ladder" || route === "stats";
  const theme = useTheme();

  // Hide/reveal + blooming ink progress — no scroll listeners.
  useEffect(() => {
    if (route === "field" || route === "login") {
      gsap.set(rootRef.current, { yPercent: 0 });
      return;
    }
    const el = rootRef.current;
    if (!el) return;

    let last = window.scrollY;
    const st = ScrollTrigger.create({
      start: 0,
      end: () => ScrollTrigger.maxScroll(window),
      onUpdate(self) {
        const p = self.progress;
        // Core ink fill — no easing on the main bar so it tracks position
        gsap.set(barRef.current, { scaleX: p });
        // The bloom head travels with the fill edge and blooms forward.
        if (headRef.current) {
          gsap.set(headRef.current, { left: `${p * 100}%` });
        }
        // Ink bloom: when progress moves forward, the glow pulses and bleeds
        const delta = p - lastProgressRef.current;
        if (delta > 0.001 && bloomRef.current) {
          gsap.fromTo(
            bloomRef.current,
            { scaleX: 1, opacity: 0.9, filter: "blur(6px)" },
            {
              scaleX: 1.06,
              opacity: 0.4,
              filter: "blur(12px)",
              duration: 0.6,
              ease: "power2.out",
              overwrite: "auto",
            },
          );
          if (headRef.current) {
            gsap.fromTo(
              headRef.current,
              { scale: 1.8, opacity: 1 },
              {
                scale: 1,
                opacity: 0.95,
                duration: 0.55,
                ease: "power2.out",
                overwrite: "auto",
              },
            );
          }
        }
        lastProgressRef.current = p;

        const down = self.scroll() - last > 6;
        const up = last - self.scroll() > 6;
        if (down) gsap.to(el, { yPercent: -102, duration: 0.4, ease: "snap", overwrite: "auto" });
        if (up) gsap.to(el, { yPercent: 0, duration: 0.5, ease: "brush", overwrite: "auto" });
        if (Math.abs(self.scroll() - last) > 6) last = self.scroll();
      },
    });
    return () => st.kill();
  }, [route]);

  const jump = (id: string) => {
    if (route !== "home") onNavigate("home");
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, route !== "home" ? 620 : 0);
  };

  const hoverLift = (e: React.MouseEvent<HTMLElement>) => {
    gsap.fromTo(
      e.currentTarget,
      { y: 3, opacity: 0.55 },
      { y: 0, opacity: 1, duration: 0.3, ease: "snap" },
    );
  };

  return (
    <>
    <header className="nav" ref={rootRef} data-route={route}>
      <a
        className="nav__brand"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          onNavigate("home");
        }}
      >
        <Sigil size={24} className="nav__mark" />
        <span className="nav__word">
          Shadow<em>Quest</em>
        </span>
      </a>

      {route === "home" && (
        <nav className="nav__links">
          {PITCH_LINKS.map((l) => (
            <a
              key={l.id}
              className="nav__link"
              href={`#${l.id}`}
              onMouseEnter={hoverLift}
              onClick={(e) => {
                e.preventDefault();
                jump(l.id);
              }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      )}

      {inApp && (
        <nav className="nav__links nav__tabs">
          {APP_TABS.map((t) => (
            <a
              key={t.id}
              className={`nav__link nav__tab ${route === t.route ? "is-active" : ""}`}
              href={hrefOf(t.route)}
              onMouseEnter={hoverLift}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(t.route);
              }}
            >
              {t.label}
            </a>
          ))}
        </nav>
      )}

      {route === "login" && (
        <nav className="nav__links nav__tabs">
          <a
            className="nav__link"
            href="#/"
            onMouseEnter={hoverLift}
            onClick={(e) => {
              e.preventDefault();
              onNavigate("home");
            }}
          >
            The System
          </a>
        </nav>
      )}

      <div className="nav__end">
        {/* Dark / light lives on the site face only — the phone face keeps
            its own ink theme on purpose. */}
        <button
          className="nav__theme"
          type="button"
          onClick={() => toggleTheme()}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          <span className="nav__theme-orb" data-theme={theme} aria-hidden="true">
            <i />
          </span>
          <span className="label nav__theme-word">
            {theme === "dark" ? "ink" : "paper"}
          </span>
        </button>
        {inApp && user && (
          <span className="nav__handle label" title="signed in">
            <i className="nav__pip" aria-hidden="true" />
            {user.handle}
          </span>
        )}
        {route === "home" && (
          <button
            className="nav__cta btn"
            type="button"
            onClick={() => onNavigate(user ? "app" : "login")}
          >
            <span className="btn__slash" />
            {user ? "Open OS" : "Sign In"}
          </button>
        )}
        {route === "login" && (
          <span className="label nav__login-note">the gate</span>
        )}
        {inApp && (
          <button
            className="nav__signout label"
            type="button"
            onClick={onSignOut}
            title="sign out"
          >
            sign out
          </button>
        )}
      </div>

      {/* Blooming ink progress: core line + bleed halo + travelling ink head */}
      <span className="nav__progress-bloom" ref={bloomRef} aria-hidden="true" />
      <span className="nav__progress" ref={barRef} />
      <span className="nav__progress-head" ref={headRef} aria-hidden="true" />
    </header>

    {/*
      The docked tab bar — the mobile-app face of the interface. It lives
      OUTSIDE `.nav` on purpose: `.nav` is the element the scroll-hide slides
      off-screen, and a thumb-reach control may never be part of that
      transform. CSS hides it entirely above the phone breakpoint, where the
      top bar's tab row is the navigation.
    */}
    {inApp && (
      <nav className="tabbar" aria-label="app sections">
        {APP_TABS.map((t) => {
          const href = hrefOf(t.route);
          return (
            <a
              key={t.id}
              className={`tabbar__tab ${route === t.route ? "is-active" : ""}`}
              href={href}
              aria-current={route === t.route ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(t.route);
              }}
            >
              <span className="tabbar__mark" aria-hidden="true">
                {t.ja}
              </span>
              <span className="tabbar__label label">{t.label}</span>
            </a>
          );
        })}
        <button className="tabbar__tab tabbar__tab--out" type="button" onClick={onSignOut}>
          <span className="tabbar__mark" aria-hidden="true">
            終
          </span>
          <span className="tabbar__label label">Sign out</span>
        </button>
      </nav>
    )}
    </>
  );
}
