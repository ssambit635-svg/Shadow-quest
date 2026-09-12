/**
 * ActionDock.tsx — the four verbs. Keyboard-first (1–4), because a duel you
 * have to find the mouse for is not a duel.
 *
 * The dock owns no game logic: it reports intent, and locks when the parent
 * says the exchange is in flight. That's why `pending` also drives the hairline
 * that sweeps across the dock — input is visibly *spent*, not merely disabled.
 * Each verb carries a geometric icon: slash, wall, cross, burst.
 */
import type { MoveIntent, MoveKind } from "../../api/types";

function Icon({ kind }: { kind: MoveKind }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 26,
    height: 26,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "square" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "strike":
      return (
        <svg {...common}>
          <path d="M4 20 L20 4" />
          <path d="M9 20 L20 9" opacity={0.45} />
        </svg>
      );
    case "guard":
      return (
        <svg {...common}>
          <path d="M5 5 L5 19 M5 12 L19 12" />
          <path d="M12 5 L12 19" opacity={0.45} />
        </svg>
      );
    case "riposte":
      return (
        <svg {...common}>
          <path d="M5 5 L19 19 M19 5 L5 19" />
        </svg>
      );
    case "technique":
      return (
        <svg {...common}>
          <path d="M12 3 L12 21 M3 12 L21 12" />
          <rect x="8" y="8" width="8" height="8" transform="rotate(45 12 12)" />
        </svg>
      );
  }
}

export interface ActionSpec {
  kind: MoveKind;
  label: string;
  detail: string;
  kiCost: number;
  key: string;
}

export const ACTIONS: ActionSpec[] = [
  { kind: "strike", label: "Strike", detail: "reliable · costs nothing", kiCost: 0, key: "1" },
  { kind: "guard", label: "Guard", detail: "+26 ki · stacks posture", kiCost: 0, key: "2" },
  { kind: "riposte", label: "Riposte", detail: "punishes a strike", kiCost: 0, key: "3" },
  { kind: "technique", label: "Technique", detail: "heavy · -42 ki", kiCost: 42, key: "4" },
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
            <span className="dock__icon" aria-hidden="true">
              <Icon kind={a.kind} />
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
