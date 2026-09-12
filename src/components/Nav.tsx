/**
 * Nav.tsx — thin HUD bar. Hides on scroll-down, returns on scroll-up, and
 * carries a blooming ink progress line along its bottom edge. The ink blooms
 * as you progress — an expanding glow + ink-blur head that travels the spine.
 */
import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "../lib/motion";
import { useSession } from "../hooks/useApi";
import { IS_MOCK } from "../api";
import { Sigil } from "./Sigil";

const LINKS = [
  { label: "Dashboard", href: "#dashboard", id: "dashboard" },
  { label: "Growth", href: "#growth", id: "growth" },
  { label: "Rewards", href: "#dashboard", id: "dashboard" },
  { label: "Milestones", href: "#ladder", id: "ladder" },
];

export function Nav({
  route,
  onNavigate,
}: {
  route: "home" | "field";
  onNavigate: (r: "home" | "field") => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const bloomRef = useRef<HTMLSpanElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const lastProgressRef = useRef(0);
  const session = useSession();

  // Hide/reveal + blooming ink progress — no scroll listeners.
  useEffect(() => {
    if (route === "field") {
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
          // Bleed pulse — the ink bloom spreads slightly ahead
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
          // The head pulses like ink hitting paper
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

  return (
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
          {LINKS.map((l) => {
            return (
              <a
                key={l.id}
                className="nav__link"
                href={l.href}
                onMouseEnter={(e) => {
                  gsap.fromTo(
                    e.currentTarget,
                    { y: 3, opacity: 0.55 },
                    { y: 0, opacity: 1, duration: 0.3, ease: "snap" },
                  );
                  void l;
                }}
                onClick={(e) => {
                  e.preventDefault();
                  jump(l.id);
                }}
              >
                {l.label}
              </a>
            );
          })}
        </nav>
      )}

      <div className="nav__end">
        <span className="nav__handle label">
          {session ? session.handle : "—"}
          {IS_MOCK && <i className="nav__mock" title="local productivity engine">local</i>}
        </span>
        <button className="nav__cta btn" onClick={() => onNavigate("field")} type="button">
          <span className="btn__slash" />
          {route === "field" ? "Exit Challenge" : "Deep Work Session"}
        </button>
      </div>

      {/* Blooming ink progress: core line + bleed halo + travelling ink head */}
      <span className="nav__progress-bloom" ref={bloomRef} aria-hidden="true" />
      <span className="nav__progress" ref={barRef} />
      <span className="nav__progress-head" ref={headRef} aria-hidden="true" />
    </header>
  );
}
