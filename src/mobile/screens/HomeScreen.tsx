/**
 * HomeScreen.tsx — the first thing the phone face shows.
 *
 * Order follows the brief exactly: Today, then Tasks, then Progress, then
 * Life Factors. The hero answers "where am I" in one glance — level, rank,
 * the bar to the next level, points, streak — and everything under it is a
 * way into the work rather than a second dashboard.
 *
 * Every number is the operator's real one, read from the shared ledger.
 */
import { useMemo } from "react";
import { LIFE_FACTOR_META, type LifeFactor, type Task } from "../../lib/todo";
import type { User } from "../../lib/auth";
import type { Ledger } from "../useLedger";
import { goToTab } from "../nav";
import { levelTrack, rankTrack } from "../stats";
import { Avatar, Caption, FactorRow, Meter, Panel } from "../parts";
import { TaskCard } from "../TaskCard";
import { initialsOf } from "../parts";

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Late shift";
}

function dateLine(d = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function HomeScreen({
  user,
  ledger,
  onComplete,
  onNew,
}: {
  user: User;
  ledger: Ledger;
  onComplete: (t: Task) => void;
  onNew: () => void;
}) {
  const { profile, todayOpen, today, todayDoneCount, todayPct } = ledger;
  const lv = levelTrack(profile);
  const rank = rankTrack(profile);

  // The three that matter most today, not the whole list.
  const top = useMemo(() => todayOpen.slice(0, 3), [todayOpen]);

  return (
    <div className="m-screen m-home">
      <header className="m-hi">
        <div>
          <p className="m-hi__date">{dateLine()}</p>
          <h1 className="m-hi__t">
            {greeting()}, <span>{user.handle}</span>
          </h1>
        </div>
        <button
          type="button"
          className="m-hi__av"
          onClick={() => goToTab("profile")}
          aria-label="Open profile"
        >
          <Avatar initials={initialsOf(user.handle)} size={38} />
        </button>
      </header>

      {/* — where am I — */}
      <Panel glow className="m-hero">
        <span className="m-hero__seal" aria-hidden="true">
          影
        </span>
        <div className="m-hero__top">
          <div className="m-hero__lv">
            <span className="m-hero__lv-l">Life Level</span>
            <span className="m-hero__lv-v num">{profile.lifeLevel}</span>
          </div>
          <div className="m-hero__rank" title={`Growth Rank ${profile.growthRank}`}>
            <span className="m-hero__rank-l">Rank</span>
            <span className="m-hero__rank-v">{profile.growthRank}</span>
          </div>
        </div>

        <Meter value={lv.pct} tone="accent" height={4} />
        <p className="m-hero__bar-l">
          <span className="num">{profile.levelProgress.toLocaleString()}</span>
          <span className="m-hero__bar-d">/ {profile.progressToNext.toLocaleString()}</span>
          <span className="m-hero__bar-n">
            {rank.next ? `${lv.remaining.toLocaleString()} to Lv.${lv.nextLevel}` : "Max level"}
          </span>
        </p>

        <div className="m-hero__stats">
          <button type="button" className="m-hero__s" onClick={() => goToTab("rewards")}>
            <span className="m-hero__s-l">Reward</span>
            <span className="m-hero__s-v num is-gold">
              {profile.rewardPoints.toLocaleString()}
            </span>
          </button>
          <span className="m-hero__div" aria-hidden="true" />
          <div className="m-hero__s">
            <span className="m-hero__s-l">Streak</span>
            <span className="m-hero__s-v num">
              {profile.streak}
              <i>d</i>
            </span>
          </div>
          <span className="m-hero__div" aria-hidden="true" />
          <button type="button" className="m-hero__s" onClick={() => goToTab("tasks")}>
            <span className="m-hero__s-l">Today</span>
            <span className="m-hero__s-v num">
              {todayDoneCount}
              <i>/{today.length}</i>
            </span>
          </button>
        </div>

        <Meter value={todayPct} tone="violet" height={2} />
        <p className="m-hero__today-l">
          {today.length === 0
            ? "Nothing set for today"
            : todayOpen.length === 0
              ? "Today is clear — every goal sealed"
              : `${todayOpen.length} open · ${todayPct}% sealed`}
        </p>
      </Panel>

      {/* — today's important tasks — */}
      <Caption
        right={
          <button type="button" className="m-link" onClick={() => goToTab("tasks")}>
            All tasks
          </button>
        }
      >
        Today
      </Caption>

      {top.length ? (
        <div className="m-list">
          {top.map((t) => (
            <TaskCard key={t.id} task={t} compact onComplete={() => onComplete(t)} />
          ))}
        </div>
      ) : (
        <div className="m-blank">
          <p>{today.length ? "Today is sealed. Well held." : "No goals for today yet."}</p>
          <button type="button" className="m-btn m-btn--ghost" onClick={onNew}>
            Add a goal
          </button>
        </div>
      )}

      {/* — life factors — */}
      <Caption
        right={
          <button type="button" className="m-link" onClick={() => goToTab("progress")}>
            Character sheet
          </button>
        }
      >
        Life Factors
      </Caption>

      <Panel className="m-factors">
        {(Object.keys(LIFE_FACTOR_META) as LifeFactor[]).map((f) => (
          <FactorRow key={f} factor={f} value={profile.factors[f]} compact />
        ))}
      </Panel>

      {/* — the rest of the app, one tap away — */}
      <Caption>Go</Caption>
      <div className="m-go">
        <button
          type="button"
          className="m-go__b"
          onClick={() => {
            window.location.hash = "#/app/field";
          }}
        >
          <span className="m-go__ja" aria-hidden="true">
            集中
          </span>
          <span className="m-go__t">Deep Work</span>
          <span className="m-go__s">Focus session</span>
        </button>
        <button
          type="button"
          className="m-go__b"
          onClick={() => {
            window.location.hash = "#/app/squad";
          }}
        >
          <span className="m-go__ja" aria-hidden="true">
            隊
          </span>
          <span className="m-go__t">Squad</span>
          <span className="m-go__s">Formation</span>
        </button>
        <button
          type="button"
          className="m-go__b"
          onClick={() => {
            window.location.hash = "#/app/ladder";
          }}
        >
          <span className="m-go__ja" aria-hidden="true">
            道
          </span>
          <span className="m-go__t">Milestones</span>
          <span className="m-go__s">The ladder</span>
        </button>
      </div>
    </div>
  );
}
