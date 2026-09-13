/**
 * StreakBoard.tsx — the chain, made visible.
 *
 * The streak is the app's memory of showing up. This panel turns the
 * evidence into the picture: the live chain with its ember, the last 84
 * days as a heat grid, this week as a strip, and the milestone track the
 * chain climbs. Everything is derived — the engine and lib/streaks agree on
 * every number.
 */
import { useMemo } from "react";
import { streakSnapshot, type StreakSnapshot } from "../lib/streaks";
import type { Profile, Task } from "../lib/todo";
import type { Habit } from "../lib/habits";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const statusOf = (s: StreakSnapshot): { line: string; tone: "hold" | "open" | "broken" } => {
  if (s.todayActive) return { line: "sealed today — the chain holds", tone: "hold" };
  if (s.alive) return { line: "today is still open — seal one thing and it lives", tone: "open" };
  return { line: "the chain is broken — seal today to re-light it", tone: "broken" };
};

export function StreakBoard({
  profile,
  tasks,
  habits,
}: {
  profile: Profile;
  tasks: Task[];
  habits: Habit[];
}) {
  const snap = useMemo(() => streakSnapshot(profile, tasks, habits), [profile, tasks, habits]);
  const status = statusOf(snap);
  const last7 = snap.cells.slice(-7);
  const weeks = Math.ceil(snap.cells.length / 7);
  // GitHub-style columns: weeks run left→right, days top→bottom.
  const columns = Array.from({ length: weeks }, (_, w) => snap.cells.slice(w * 7, w * 7 + 7));

  return (
    <div className="streak" data-dash-panel>
      <div className="streak__head">
        <div>
          <p className="label dash__factors-label">The Chain</p>
          <p className="streak__status" data-tone={status.tone}>
            {status.line}
          </p>
        </div>
        <div className="streak__now">
          <span className="streak__ember" data-alive={snap.alive || undefined} aria-hidden="true">
            炎
          </span>
          <b className="streak__n num">{snap.current}</b>
          <span className="streak__n-label">
            day{snap.current === 1 ? "" : "s"} · best {snap.longest}
          </span>
        </div>
      </div>

      <div className="streak__body">
        {/* 84-day heat grid — one column per week, darkest ink = heaviest day */}
        <div className="streak__grid" role="img" aria-label="Streak heat map, last 84 days">
          {columns.map((week, w) => (
            <div className="streak__week" key={w}>
              {week.map((c) => (
                <i
                  key={c.date}
                  data-level={c.active ? Math.max(1, c.level) : 0}
                  title={c.active ? `${c.date} · ${c.level} seal${c.level === 1 ? "" : "s"}` : c.date}
                />
              ))}
            </div>
          ))}
        </div>

        {/* this week, spelled out */}
        <div className="streak__week-strip">
          {last7.map((c) => (
            <span key={c.date} className="streak__dot" data-active={c.active || undefined}>
              <i data-level={c.active ? Math.max(1, c.level) : 0} />
              <em>{DAY_LETTERS[(new Date(`${c.date}T00:00:00`).getDay() + 6) % 7]}</em>
            </span>
          ))}
        </div>
      </div>

      {/* the milestones the chain climbs */}
      <div className="streak__track">
        {snap.milestones.map((m) => (
          <span
            key={m.days}
            className="streak__mile"
            data-earned={m.earned || undefined}
            data-next={snap.next?.days === m.days || undefined}
          >
            <i aria-hidden="true">{m.earned ? "印" : "◇"}</i>
            <b className="num">{m.days}</b>
            <em>{m.label}</em>
            <span className="num">+{m.points}</span>
          </span>
        ))}
      </div>
      {snap.next && (
        <p className="streak__next label">
          next seal: {snap.next.days} days — pays {snap.next.points} reward points
        </p>
      )}
    </div>
  );
}
