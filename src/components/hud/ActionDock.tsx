/**
 * ActionDock.tsx — the four verbs. Keyboard-first (1–4), because a duel you
 * have to find the mouse for is not a duel.
 *
 * The dock owns no game logic: it reports intent, and locks when the parent
 * says the exchange is in flight. That's why `pending` also drives the hairline
 * that sweeps across the dock — input is visibly *spent*, not merely disabled.
 */
import type { MoveIntent, MoveKind } from "../../api/types";

export interface ActionSpec {
  kind: MoveKind;
  kanji: string;
  label: string;
  detail: string;
  kiCost: number;
  key: string;
}

export const ACTIONS: ActionSpec[] = [
  { kind: "strike", kanji: "切", label: "Strike", detail: "reliable · costs nothing", kiCost: 0, key: "1" },
  { kind: "guard", kanji: "構", label: "Guard", detail: "+26 ki · stacks posture", kiCost: 0, key: "2" },
  { kind: "riposte", kanji: "受", label: "Riposte", detail: "punishes a strike", kiCost: 0, key: "3" },
  { kind: "technique", kanji: "術", label: "Technique", detail: "heavy · -42 ki", kiCost: 42, key: "4" },
];

export function ActionDock({
  onMove,
  disabled,
  ki,
}: {
  onMove: (m: MoveIntent) => void;
  disabled: boolean;
  ki: number;
}) {
  return (
    <div className="dock" data-busy={disabled || undefined}>
      <span className="dock__sweep" aria-hidden="true" />
      {ACTIONS.map((a) => {
        const unaffordable = a.kiCost > ki;
        const off = disabled || unaffordable;
        return (
          <button
            key={a.kind}
            type="button"
            className="dock__btn"
            disabled={off}
            data-unaffordable={unaffordable || undefined}
            onClick={() => onMove({ kind: a.kind, variant: 0 })}
          >
            <span className="dock__key label num">{a.key}</span>
            <span className="dock__kanji kanji" aria-hidden="true">
              {a.kanji}
            </span>
            <span className="dock__text">
              <span className="dock__label">{a.label}</span>
              <span className="dock__detail">{a.detail}</span>
            </span>
            {a.kiCost > 0 && <span className="dock__cost num">-{a.kiCost}</span>}
          </button>
        );
      })}
    </div>
  );
}
