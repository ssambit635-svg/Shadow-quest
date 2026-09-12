/**
 * Nav.tsx — thin HUD bar. Hides on scroll-down, returns on scroll-up, and
 * carries a hairline of scroll progress along its bottom edge so the bar is
 * also an instrument.
 */
import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "../lib/motion";
import { useSession } from "../hooks/useApi";
import { IS_MOCK } from "../api";
import { SamuraiMark } from "./SamuraiMark";

const LINKS = [
  { label: "The Way", href: "#way", id: "way" },
  { label: "Shadows", href: "#roster", id: "roster" },
  { label: "Form", href: "#form", id: "form" },
  { label: "Ladder", href: "#ladder", id: "ladder" },
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
  const session = useSession();

  // Hide/reveal + progress, in one ScrollTrigger — no scroll listeners.
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
        gsap.to(barRef.current, {
          scaleX: self.progress,
          duration: 0.25,
          ease: "none",
          overwrite: "auto",
        });
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
        <SamuraiMark size={22} blade={false} className="nav__mark" />
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
          {IS_MOCK && <i className="nav__mock" title="running the in-page duel engine">mock</i>}
        </span>
        <button className="nav__cta btn" onClick={() => onNavigate("field")} type="button">
          <span className="btn__slash" />
          {route === "field" ? "Leave field" : "Enter the field"}
        </button>
      </div>

      <span className="nav__progress" ref={barRef} />
    </header>
  );
}
