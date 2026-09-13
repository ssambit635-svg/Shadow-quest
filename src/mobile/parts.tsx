/**
 * parts.tsx — the small pieces every phone screen is built from.
 *
 * Deliberately few, and deliberately dumb: none of them own data or reach
 * for storage. The visual system lives in the stylesheet; these only decide
 * which class names and which numbers to hand it.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, REDUCED } from "../lib/motion";
import { LIFE_FACTOR_META, type LifeFactor } from "../lib/todo";

/* ------------------------------------------------------------------ *
 * Type
 * ------------------------------------------------------------------ */

/** The tiny section caption that opens every block. */
export function Caption({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="m-cap">
      <span className="m-cap__t">{children}</span>
      {right ? <span className="m-cap__r">{right}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export function Avatar({
  initials,
  hue = 6,
  size = 40,
  online,
  className = "",
}: {
  initials: string;
  hue?: number;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`m-av ${online === undefined ? "" : online ? "is-online" : "is-off"} ${className}`}
      style={
        {
          width: size,
          height: size,
          "--av-hue": hue,
          fontSize: Math.round(size * 0.36),
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {initials}
      {online === undefined ? null : <i className="m-av__pip" />}
    </span>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Meters
 * ------------------------------------------------------------------ */

/** A hairline meter. The fill animates on change; the track never moves. */
export function Meter({
  value,
  tone = "accent",
  height = 3,
}: {
  value: number;
  tone?: "accent" | "violet" | "gold" | "dim";
  height?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const pct = Math.max(0, Math.min(100, value));
  useEffect(() => {
    if (!ref.current) return;
    if (REDUCED) {
      ref.current.style.transform = `scaleX(${pct / 100})`;
      return;
    }
    gsap.to(ref.current, {
      scaleX: pct / 100,
      duration: 0.8,
      ease: "power2.out",
      overwrite: "auto",
    });
  }, [pct]);
  return (
    <span className="m-meter" data-tone={tone} style={{ height }}>
      <span className="m-meter__fill" ref={ref} style={{ transform: `scaleX(${pct / 100})` }} />
    </span>
  );
}

/** One Life Factor, as a row: seal, label, value, hairline bar. */
export function FactorRow({
  factor,
  value,
  compact = false,
}: {
  factor: LifeFactor;
  value: number;
  compact?: boolean;
}) {
  const meta = LIFE_FACTOR_META[factor];
  const v = Math.round(value);
  return (
    <div className={`m-factor ${compact ? "is-compact" : ""}`}>
      <span className="m-factor__code num" aria-hidden="true">
        {meta.code}
      </span>
      <span className="m-factor__label">{meta.label}</span>
      <span className="m-factor__bar">
        <Meter value={v} tone="accent" />
      </span>
      <span className="m-factor__v num">{v}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export function Panel({
  children,
  className = "",
  glow = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={`m-panel ${glow ? "is-glow" : ""} ${className}`}>
      {children}
    </section>
  );
}

/** Label / value pair used across the stat grids. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "accent" | "violet" | "gold";
}) {
  return (
    <div className="m-stat" data-tone={tone}>
      <span className="m-stat__l">{label}</span>
      <span className="m-stat__v num">{value}</span>
      {sub ? <span className="m-stat__s">{sub}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bottom sheet
 * ------------------------------------------------------------------ */

/**
 * The one overlay in the phone face. Anchored to the thumb, dismissed by
 * backdrop, Escape, or BACK, and it locks the page behind it so the sheet
 * cannot fight the scroll.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // History bookkeeping for BACK-to-close (below). Refs, not locals: the
  // effect re-runs whenever the parent re-renders with a fresh `onClose`
  // while the sheet is open, but only the closed→open *transition* may
  // push, and only the matching close may balance.
  const wasOpenRef = useRef(false);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // Closed through the UI (X, veil, submit): balance the entry this
      // sheet pushed when it opened, so BACK never lands on a dead slot.
      // A close *by* BACK already cleared the flag in `onPop`, so this is
      // a no-op on that path by construction.
      if (pushedRef.current) {
        pushedRef.current = false;
        try {
          history.back();
        } catch {
          /* non-browser shell — nothing to balance */
        }
      }
      wasOpenRef.current = false;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Opening pushes one history entry on the closed→open transition only,
    // so the Android back button (and the browser's) closes the sheet
    // instead of leaving the screen underneath it.
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      try {
        history.pushState({ sqSheet: true }, "");
        pushedRef.current = true;
      } catch {
        /* hardened shell: the sheet still opens, BACK just navigates */
      }
    }
    const onPop = () => {
      pushedRef.current = false;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    if (!REDUCED && panelRef.current) {
      gsap.fromTo(
        panelRef.current,
        { yPercent: 12, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: 0.36, ease: "power3.out" },
      );
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="m-sheet__veil"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      <div className="m-sheet__panel" ref={panelRef}>
        <span className="m-sheet__grip" aria-hidden="true" />
        <header className="m-sheet__head">
          <h2 className="m-sheet__title">{title}</h2>
          <button type="button" className="m-sheet__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="m-sheet__body">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="m-chips" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`m-chip ${value === o.id ? "is-on" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Empty state: one line, no illustration, no plea. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="m-empty">
      <p className="m-empty__t">{title}</p>
      {hint ? <p className="m-empty__h">{hint}</p> : null}
    </div>
  );
}
