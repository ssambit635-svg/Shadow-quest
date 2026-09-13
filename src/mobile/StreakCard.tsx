/**
 * StreakCard.tsx — the chain, on a phone.
 *
 * Compact twin of the desktop StreakBoard: the live chain, the last 28 days
 * as a heat strip, and the milestone track. Same derivation, same numbers —
 * the phone face has no habits, so the evidence is tasks + the engine's
 * last-active record.
 */
import { useMemo } from "react";
import { streakSnapshot, type StreakSnapshot } from "../lib/streaks";
import type { Profile, Task } from "../lib/todo";
import { Caption, Panel } from "./parts";

const statusOf = (s: StreakSnapshot): { line: string; tone: "hold" | "open" | "broken" } => {
  if (s.todayActive) return { line: "Sealed today — the chain holds.", tone: "hold" };
  if (s.alive) return { line: "Today is still open. Seal one thing and it lives.", tone: "open" };
  return { line: "The chain is broken. Seal today to re-light it.", tone: "broken" };
};

export function StreakCard({ profile, tasks }: { profile: Profile; tasks: Task[] }) {
  const snap = useMemo(() => streakSnapshot(profile, tasks, []), [profile, tasks]);
  const status = statusOf(snap);
  const last28 = snap.cells.slice(-28);

  return (
    <>
      <Caption>The Chain</Caption>
      <Panel glow className="m-streak">
        <div className="m-streak__head">
          <span
            className="m-streak__ember"
            data-alive={snap.alive || undefined}
            aria-hidden="true"
          >
            炎
          </span>
          <b className="num">{snap.current}</b>
          <span className="m-streak__sub">
            day{snap.current === 1 ? "" : "s"} · best {snap.longest}
          </span>
        </div>
        <p className="m-streak__status" data-tone={status.tone}>
          {status.line}
        </p>
        <div className="m-streak__grid" role="img" aria-label="Streak heat, last 28 days">
          {last28.map((c) => (
            <i
              key={c.date}
              data-level={c.active ? Math.max(1, c.level) : 0}
              title={c.date}
            />
          ))}
        </div>
        <div className="m-streak__miles">
          {snap.milestones.slice(0, 4).map((m) => (
            <span key={m.days} data-earned={m.earned || undefined}>
              <i aria-hidden="true">{m.earned ? "印" : "◇"}</i>
              <b className="num">{m.days}d</b>
            </span>
          ))}
          {snap.next && (
            <em className="m-streak__next">
              next: {snap.next.days}d → +{snap.next.points}
            </em>
          )}
        </div>
      </Panel>
    </>
  );
}
