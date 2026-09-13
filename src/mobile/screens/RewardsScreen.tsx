/**
 * RewardsScreen.tsx — what the work has paid.
 *
 * Deliberately not a shop. Reward Points are earned by `completeTask` in
 * lib/todo and there is no spend mechanic behind them, so inventing one here
 * would put a number on screen the engine cannot honour. What this shows is
 * the real total, where it came from, what has been unlocked, and the last
 * few completions that produced it.
 */
import { useMemo } from "react";
import { completedTasks, todayISO } from "../../lib/todo";
import type { Ledger } from "../useLedger";
import { achievementsOf, rewardBreakdown } from "../stats";
import { Caption, Empty, Meter, Panel } from "../parts";

export function RewardsScreen({ ledger }: { ledger: Ledger }) {
  const { profile, tasks } = ledger;
  const done = useMemo(() => completedTasks(tasks), [tasks]);
  const breakdown = useMemo(() => rewardBreakdown(tasks), [tasks]);
  const achievements = useMemo(() => achievementsOf(profile, tasks), [profile, tasks]);

  const earned = achievements.filter((a) => a.earned).length;
  const top = breakdown[0];
  const maxPoints = Math.max(1, ...breakdown.map((b) => b.points));

  // Most recent first; the ledger has no event log, so completedAt is the
  // only honest ordering available.
  const recent = useMemo(
    () =>
      [...done]
        .filter((t) => t.completedAt)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 6),
    [done],
  );

  const todayStr = todayISO();

  return (
    <div className="m-screen m-rewards">
      <header className="m-head">
        <h1 className="m-head__t">Rewards</h1>
        <p className="m-head__s">{earned} of {achievements.length} marks earned</p>
      </header>

      <Panel glow className="m-rp">
        <span className="m-rp__seal" aria-hidden="true">
          褒
        </span>
        <span className="m-rp__l">Reward Points</span>
        <span className="m-rp__v num">{profile.rewardPoints.toLocaleString()}</span>
        <p className="m-rp__s">
          {profile.tasksCompleted} goal{profile.tasksCompleted === 1 ? "" : "s"} sealed
          {top ? ` · most from ${top.label}` : ""}
        </p>
      </Panel>

      {/* — where the points came from — */}
      <Caption>By category</Caption>
      {breakdown.length ? (
        <Panel className="m-brk">
          {breakdown.map((b) => (
            <div className="m-brk__row" key={b.label}>
              <span className="m-brk__l">{b.label}</span>
              <span className="m-brk__bar">
                <Meter value={(b.points / maxPoints) * 100} tone="gold" height={3} />
              </span>
              <span className="m-brk__v num">{b.points.toLocaleString()}</span>
              <span className="m-brk__c num">×{b.count}</span>
            </div>
          ))}
        </Panel>
      ) : (
        <Panel className="m-pad">
          <p className="m-note">No points banked yet. Seal a goal to start.</p>
        </Panel>
      )}

      {/* — marks — */}
      <Caption>
        Marks <span className="num">{earned}/{achievements.length}</span>
      </Caption>
      <div className="m-marks">
        {achievements.map((a) => (
          <div className={`m-mark ${a.earned ? "is-on" : ""}`} key={a.id}>
            <span className="m-mark__ja" aria-hidden="true">
              {a.ja}
            </span>
            <div className="m-mark__b">
              <span className="m-mark__n">{a.name}</span>
              <span className="m-mark__d">{a.detail}</span>
              {!a.earned && <Meter value={a.progress} tone="dim" height={2} />}
            </div>
            {a.earned ? <span className="m-mark__ok" aria-label="Earned">✓</span> : null}
          </div>
        ))}
      </div>

      {/* — recent — */}
      <Caption>Recently sealed</Caption>
      {recent.length ? (
        <div className="m-recent">
          {recent.map((t) => (
            <div className="m-recent__r" key={t.id}>
              <span className="m-recent__t">{t.title}</span>
              <span className="m-recent__w">
                {t.completedAt &&
                new Date(t.completedAt).toISOString().slice(0, 10) === todayStr
                  ? "Today"
                  : t.completedAt
                    ? new Date(t.completedAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })
                    : ""}
              </span>
              <span className="m-recent__p num is-gold">+{t.rewardPoints}</span>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Nothing sealed yet" hint="Completed goals are listed here." />
      )}
    </div>
  );
}
