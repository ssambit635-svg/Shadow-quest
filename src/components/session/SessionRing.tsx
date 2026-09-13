/**
 * SessionRing.tsx — the clock as an ensō.
 *
 * One open circle, brushed counter-clockwise from the top: the track is the
 * whole intended stroke at low ink, the value arc is the ink laid so far this
 * phase. A faint turbulence displacement keeps the edge wet instead of
 * vector-crisp, the same idea as the mark on the landing page.
 *
 * The ring never lies about which way time moves: focus *fills* the ensō,
 * rest *drains* it.
 */
import { mmss } from "../../hooks/useFocusSession";

const R = 132;
const C = 2 * Math.PI * R;
/** The ensō is traditionally left open — 6% of the circle stays unwritten. */
const OPEN = 0.94;

export function SessionRing({
  ms,
  limit,
  fraction,
  phase,
  running,
  urgent,
  kanji,
}: {
  /** What the big numerals read: remaining (timed) or held (flow). */
  ms: number;
  limit: number;
  /** 0..1 — ink laid so far this phase. */
  fraction: number;
  phase: "focus" | "rest" | "done";
  running: boolean;
  urgent: boolean;
  /** Phase kanji worn behind the numerals. */
  kanji: string;
}) {
  const arc = C * OPEN;
  const offset = arc * (1 - fraction);

  return (
    <div
      className="sring"
      data-phase={phase}
      data-running={running || undefined}
      data-urgent={urgent || undefined}
    >
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <defs>
          <filter id="sq-ink-rough" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.014 0.022" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
          </filter>
        </defs>
        <g filter="url(#sq-ink-rough)" transform="rotate(-90 150 150)">
          <circle
            cx="150"
            cy="150"
            r={R}
            className="sring__track"
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${C}`}
          />
          <circle
            cx="150"
            cy="150"
            r={R}
            className="sring__value"
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${C}`}
            strokeDashoffset={offset}
          />
        </g>
      </svg>

      <span className="sring__kanji" aria-hidden="true">
        {kanji}
      </span>

      <div className="sring__core">
        <span className="sring__time num">{phase === "done" ? "完" : mmss(ms)}</span>
        <span className="sring__limit label">
          {phase === "done" ? "held" : `of ${mmss(limit)}`}
        </span>
      </div>

      <span className="sring__pulse" aria-hidden="true" />
    </div>
  );
}
