/**
 * RewardFx.tsx — the moment a task closes.
 *
 * The brief is explicit that this should read as a productivity app: the
 * reward is *information first*, delivered in the order the work earned it.
 * `+PROGRESS` lands, then each Life Factor the task touched, then a level or
 * rank change if one happened. No confetti, no particle burst, no sound.
 * One line at a time, a thin accent rule, a controlled glow, and it is gone.
 *
 * Sequencing is deliberately staged rather than simultaneous: reading
 * "+100 PROGRESS" and "KNOWLEDGE +4" in the same frame means reading
 * neither. The gap is the animation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, REDUCED } from "../lib/motion";
import type { CompleteEvent } from "../lib/todo";

export interface FxLine {
  id: string;
  /** Drives the accent: progress is the primary, factors the support. */
  kind: CompleteEvent["type"];
  text: string;
  /** Secondary line, e.g. the factor's tier change. */
  sub?: string;
}

const GAP_MS = 240;
const HOLD_MS = 2200;

export function useRewardFx() {
  const [lines, setLines] = useState<FxLine[]>([]);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const fire = useCallback(
    (events: CompleteEvent[]) => {
      if (!events.length) return;
      clearTimers();
      setLines([]);

      // Progress first, then factors, then the big changes last so the
      // last thing on screen is the most consequential.
      const order: CompleteEvent["type"][] = [
        "progress",
        "reward",
        "factor",
        "streak",
        "rankup",
        "levelup",
      ];
      const staged = [...events].sort(
        (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
      );

      staged.forEach((e, i) => {
        const line: FxLine = {
          id: `fx_${Date.now()}_${i}`,
          kind: e.type,
          text: e.message,
        };
        timers.current.push(
          window.setTimeout(() => {
            setLines((prev) => [...prev, line]);
          }, REDUCED ? 0 : i * GAP_MS),
        );
      });

      timers.current.push(
        window.setTimeout(() => setLines([]), REDUCED ? 400 : staged.length * GAP_MS + HOLD_MS),
      );
    },
    [clearTimers],
  );

  return { lines, fire };
}

export function RewardFx({ lines }: { lines: FxLine[] }) {
  const ref = useRef<HTMLDivElement>(null);

  // Each new line enters from below and settles. Existing lines are not
  // re-animated, so a burst reads as a queue rather than a flicker.
  useEffect(() => {
    if (REDUCED || !ref.current) return;
    const last = ref.current.lastElementChild as HTMLElement | null;
    if (!last) return;
    gsap.fromTo(
      last,
      { autoAlpha: 0, y: 10, scale: 0.985 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, ease: "power2.out" },
    );
    gsap.fromTo(
      last.querySelector(".fx__rule"),
      { scaleY: 0 },
      { scaleY: 1, duration: 0.5, ease: "power2.out" },
    );
  }, [lines.length]);

  if (!lines.length) return null;

  return (
    <div className="fx" ref={ref} aria-live="polite" aria-atomic="false">
      {lines.map((l) => (
        <div className={`fx__line fx__line--${l.kind}`} key={l.id}>
          <span className="fx__rule" aria-hidden="true" />
          <span className="fx__text num">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
