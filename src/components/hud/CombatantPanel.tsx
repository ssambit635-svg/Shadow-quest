/**
 * CombatantPanel.tsx — one side of the field.
 *
 * The HP bar is drawn as a brush stroke that shortens from the tip inward
 * (real 切腹 logic, not a left-to-right progress bar), and ki is pips rather
 * than a second bar, because pips make a budget feel countable.
 */
import type { Combatant } from "../../api/types";

export function CombatantPanel({
  c,
  mirror = false,
  kanji,
}: {
  c: Combatant;
  mirror?: boolean;
  kanji?: string;
}) {
  const hpPct = Math.max(0, Math.min(100, (c.hp / c.hpMax) * 100));
  const hpTick = Math.round(hpPct);

  return (
    <div
      className="cp"
      data-mirror={mirror || undefined}
      data-active={c.active || undefined}
      data-low={c.hp / c.hpMax < 0.3 || undefined}
    >
      <div className="cp__head">
        <span className="cp__seat label">{c.seat === "challenger" ? "challenger" : "defender"}</span>
        {c.guard > 0 && <span className="cp__guard num">×{c.guard} guard</span>}
      </div>

      <div className="cp__idrow">
        <span className="cp__kanji kanji" aria-hidden="true">
          {kanji ?? "影"}
        </span>
        <div className="cp__ids">
          <h3 className="cp__name">{c.displayName}</h3>
          <span className="cp__shadow label">{c.shadowId}</span>
        </div>
      </div>

      <div className="cp__hp">
        <div className="cp__hp-track" aria-hidden="true">
          {/* Two layers: the ghost of what was lost stays as wet ink. */}
          <span className="cp__hp-ghost" style={{ width: `${hpPct}%` }} />
          <span className="cp__hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        <div className="cp__hp-meta">
          <span className="cp__hp-num num">
            {c.hp}
            <i>/{c.hpMax}</i>
          </span>
          <span className="cp__hp-tick label">{hpTick}%</span>
        </div>
      </div>

      <div className="cp__ki" role="group" aria-label={`ki ${c.ki} of 100`}>
        {Array.from({ length: 10 }).map((_, i) => {
          const lit = c.ki >= (i + 1) * 10;
          return <span className="cp__pip" data-lit={lit || undefined} key={i} />;
        })}
        <span className="cp__ki-num num">{c.ki}</span>
      </div>
    </div>
  );
}

/**
 * TurnRing.tsx — the clock, as an ensō being consumed. Drawn with SVG stroke
 * dash so the last second can be *accelerated* instead of just recoloured.
 */
export function TurnRing({
  ms,
  limit,
  urgent,
}: {
  ms: number;
  limit: number;
  urgent: boolean;
}) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const p = limit > 0 ? Math.max(0, Math.min(1, ms / limit)) : 0;
  const secs = Math.ceil(ms / 1000);

  return (
    <div className="ring" data-urgent={urgent || undefined}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={R} className="ring__track" strokeWidth="3" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={R}
          className="ring__value"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="ring__num num">{String(secs).padStart(2, "0")}</span>
      <span className="ring__unit label">sec</span>
    </div>
  );
}
