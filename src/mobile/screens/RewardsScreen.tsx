/**
 * RewardsScreen.tsx — what the work has paid, and the two things it can buy.
 *
 * Reward Points are earned by `completeTask` in lib/todo. There are exactly
 * two spends, and both are decided by the backend: the daily bonus (paid once
 * a day, when the day's requirement is met) and the Streak Shield (bought
 * with points, spent on one missed day). Nothing on this screen decides
 * either — it asks, and shows what came back.
 */
import { useMemo } from "react";
import { completedTasks, todayISO } from "../../lib/todo";
import type { Ledger } from "../useLedger";
import { achievementsOf, rewardBreakdown } from "../stats";
import { Caption, Empty, Meter, Panel } from "../parts";
import type { RewardsApi } from "../../lib/rewards";
import type { DailyRewardState, ShieldState } from "../../api/ledger";

export function RewardsScreen({
  ledger,
  rewards,
}: {
  ledger: Ledger;
  /** The server's reward state, and the three calls that change it. */
  rewards?: RewardsApi;
}) {
  const { profile, tasks } = ledger;
  const daily = rewards?.state?.daily;
  const shield = rewards?.state?.shield;
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

      {/* — the daily bonus: paid once a day, for a day that actually happened — */}
      <Caption>Daily Reward</Caption>
      <Panel className="m-daily">
        <div className="m-daily__head">
          <span className="m-daily__amt num">+{daily?.amount ?? 0}</span>
          <div className="m-daily__b">
            <span className="m-daily__t">Daily Reward</span>
            <span className="m-daily__s" data-state={dailyState(daily)}>
              {dailyNote(daily)}
            </span>
          </div>
          {rewards ? (
            <button
              type="button"
              className="m-daily__b-btn"
              onClick={() => void rewards.claim()}
              disabled={rewards.busy || !daily?.ready}
            >
              {daily?.claimed ? "Claimed" : daily?.ready ? "Claim" : "Locked"}
            </button>
          ) : null}
        </div>
        <p className="m-daily__meta">
          {daily?.claims
            ? `${daily.claims} daily reward${daily.claims === 1 ? "" : "s"} collected`
            : "Seal one goal or mark one habit today"}
          {daily?.claimedDate ? ` · last ${daily.claimedDate}` : ""}
        </p>
      </Panel>

      {/* — the shield: bought with points, spent on one missed day — */}
      <Caption>Streak Shield</Caption>
      <Panel className="m-shop">
        <div className="m-shop__row">
          <span className="m-shop__badge num">🛡️ Streak Shield: {shield?.count ?? 0}</span>
          <span className="m-shop__cost num">
            {shield ? `${shield.cost} RP · max ${shield.max}` : ""}
          </span>
        </div>
        <p className="m-shop__s" data-tone={shield?.canUse ? "ready" : undefined}>
          {shieldNote(shield)}
        </p>
        {rewards ? (
          <div className="m-shop__acts">
            <button
              type="button"
              className="m-btn m-btn--ghost"
              onClick={() => void rewards.use()}
              disabled={rewards.busy || !shield?.canUse}
            >
              {shield?.missedDate ? `Use shield · ${shield.missedDate}` : "Use shield"}
            </button>
            <button
              type="button"
              className="m-btn"
              onClick={() => void rewards.buy()}
              disabled={rewards.busy || !shield?.canBuy}
            >
              Buy · {shield?.cost ?? 0} RP
            </button>
          </div>
        ) : null}
        {(shield?.protectedDates?.length ?? 0) > 0 ? (
          <p className="m-shop__meta">
            Held: {shield!.protectedDates.join(", ")}
          </p>
        ) : null}
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

/* ------------------------------------------------------------------ *
 * the two lines that explain the state — no promise the server won't keep
 * ------------------------------------------------------------------ */

const dailyState = (d?: DailyRewardState): string =>
  !d ? "offline" : d.claimed ? "claimed" : d.ready ? "ready" : "locked";

function dailyNote(d?: DailyRewardState): string {
  if (!d) return "Connect to collect today's bonus.";
  if (d.claimed) return "Collected today. Back tomorrow.";
  if (d.ready) return `Ready — ${d.requirement.toLowerCase()} is done.`;
  if (d.reason === "too-soon") return "Collected less than a day ago.";
  return `Locked — ${d.requirement.toLowerCase()}.`;
}

function shieldNote(s?: ShieldState): string {
  if (!s) return "Connect to buy or spend a shield.";
  switch (s.useReason) {
    case "open":
      return `Yesterday was missed — the shield can hold it and keep the chain alive.`;
    case "no-shield":
      return `None held. Each shield protects one missed day.`;
    case "no-chain":
      return "No chain running yet — nothing to protect.";
    case "chain-broken":
      return "More than one day is missing; one shield cannot bridge that.";
    case "used-today":
      return "A shield was already spent today.";
    default:
      return "The chain is intact — nothing needs holding.";
  }
}
