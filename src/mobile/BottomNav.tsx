/**
 * BottomNav.tsx — the dock.
 *
 * Five destinations, one tap each, thumb-reach height, and clear of the
 * home-gesture inset. It is fixed to the viewport rather than the page: a
 * control you reach for must never scroll away.
 *
 * The active mark is a filled icon plus a hairline indicator above it —
 * enough to read at a glance without a coloured pill behind every tab.
 */
import { useRef } from "react";
import { gsap, REDUCED } from "../lib/motion";
import { DOCK_TABS, goToTab, type DockTab, type MobileTab } from "./nav";

/** Only the five docked destinations need a mark; Squad is reached from
 *  Home and Profile, so it is deliberately not part of this record. */
const ICONS: Record<DockTab, React.ReactNode> = {
  home: (
    <path d="M3.5 10.6 12 4l8.5 6.6V19a1 1 0 0 1-1 1h-4.6v-5.2H9.1V20H4.5a1 1 0 0 1-1-1z" />
  ),
  tasks: (
    <>
      <path d="M4 6.6h4M4 12h4M4 17.4h4" />
      <path d="M11 6.6h9M11 12h9M11 17.4h9" />
    </>
  ),
  progress: (
    <>
      <path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z" />
      <path d="M12 8.4 16 10.7v4.6L12 17.6 8 15.3v-4.6z" />
    </>
  ),
  rewards: (
    <>
      <circle cx="12" cy="14" r="6.2" />
      <path d="M8.6 8.2 10.4 3h3.2l1.8 5.2" />
      <path d="M12 11.4v5.2M9.6 13.2h4.8" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.6" r="3.8" />
      <path d="M4.8 20c.6-3.7 3.6-5.8 7.2-5.8s6.6 2.1 7.2 5.8" />
    </>
  ),
};

export function BottomNav({ tab }: { tab: MobileTab }) {
  const ref = useRef<HTMLElement>(null);

  const go = (id: MobileTab) => {
    if (!REDUCED && ref.current) {
      // A hairline slides between tabs instead of each one fading: the dock
      // reads as one object changing state, not five buttons blinking.
      const idx = DOCK_TABS.findIndex((t) => t.id === id);
      const el = ref.current.querySelector<HTMLElement>(".m-dock__ind");
      if (el && idx >= 0) {
        gsap.to(el, {
          xPercent: idx * 100,
          duration: 0.34,
          ease: "power3.out",
          overwrite: "auto",
        });
      }
    }
    goToTab(id);
  };

  return (
    <nav className="m-dock" ref={ref} aria-label="Sections">
      <span className="m-dock__ind" aria-hidden="true" />
      {DOCK_TABS.map((t) => {
        const on = t.id === tab;
        return (
          <a
            key={t.id}
            href={t.href}
            className={`m-dock__t ${on ? "is-on" : ""}`}
            aria-current={on ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(t.id);
            }}
          >
            <span className="m-dock__ja" aria-hidden="true">
              {t.ja}
            </span>
            <svg
              className="m-dock__i"
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[t.id]}
            </svg>
            <span className="m-dock__l">{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
