/**
 * MobileApp.tsx — the phone face of ShadowQuest.
 *
 * A separate shell, not a rearranged desktop: its own chrome, its own dock,
 * its own screens, its own stylesheet. It is mounted by App.tsx only when the
 * viewport is phone-shaped (or the Capacitor APK is running), and it mounts
 * on the shell's existing `app` route, so hash routing, the auth gate and
 * every API keep behaving exactly as they did.
 *
 * What it reuses, unchanged:
 *   · lib/todo  — the whole task and profile engine, same storage keys
 *   · lib/auth  — the identity store and its gate
 *   · #/app/field and #/app/ladder — the Deep Work room and the ladder stay
 *     the shell's own routes, reached from Home and Profile
 *
 * The desktop dashboard is not rendered while this is, and is not modified.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gsap, REDUCED } from "../lib/motion";
import { logout, scopeOf, type User } from "../lib/auth";
import { forgetProvider } from "../lib/googleAuth";
import type { CompleteEvent, Task } from "../lib/todo";
import { useLedger } from "./useLedger";
import { useFactorTrends } from "../lib/factorTrends";
import {
  forgetRewardCache,
  protectedDatesOf,
  useRewards,
  type RewardNotice,
} from "../lib/rewards";
import { useRewardFx, RewardFx } from "./RewardFx";
import { BottomNav } from "./BottomNav";
import { TaskSheet } from "./TaskSheet";
import { tabFromHash, goToTab, type MobileTab } from "./nav";
import { HomeScreen } from "./screens/HomeScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { RewardsScreen } from "./screens/RewardsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SquadScreen } from "./screens/SquadScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { Avatar, initialsOf } from "./parts";
import { Sigil } from "../components/Sigil";

const TITLES: Record<MobileTab, string> = {
  home: "Today",
  tasks: "Tasks",
  progress: "Character",
  rewards: "Rewards",
  profile: "Profile",
  squad: "Squad",
  stats: "Stats",
};

export function MobileApp({ user }: { user: User }) {
  const scope = scopeOf(user);
  const { lines, fire } = useRewardFx();

  /**
   * Reward state is fetched before the ledger is built, because the ledger
   * needs to know which days a shield holds: a covered day keeps the streak
   * alive through a completion, and without it the engine would reset the
   * chain the operator paid to protect.
   */
  const onNotice = useCallback(
    (notice: RewardNotice) => fire([{ type: notice.kind, message: notice.message }]),
    [fire],
  );
  const rewardsRef = useRef<(points: number) => void>(() => undefined);
  const rewards = useRewards(scope, user, {
    onPoints: (points) => rewardsRef.current(points),
    onNotice,
  });
  const protectedKey = protectedDatesOf(rewards.state).join(",");
  const protectedDates = useMemo(
    () => (protectedKey ? protectedKey.split(",") : []),
    [protectedKey],
  );
  const ledger = useLedger(scope, protectedDates);
  rewardsRef.current = ledger.setRewardPoints;

  const trends = useFactorTrends(scope, user, ledger.profile, ledger.tasks);

  /**
   * The daily reward is automatic: the moment the server reports the day's
   * requirement met and the day unpaid, the ask goes out. The endpoint is
   * idempotent and refuses a replay, so a second device racing this one
   * cannot produce a second payout — and a session that already claimed
   * simply gets "claimed" back.
   */
  const askedRef = useRef<string>("");
  const claimReward = rewards.claim;
  const daily = rewards.state?.daily;
  useEffect(() => {
    if (!daily?.eligible || daily.claimed) return;
    if (askedRef.current === daily.day) return;
    askedRef.current = daily.day;
    void claimReward();
  }, [daily?.eligible, daily?.claimed, daily?.day, claimReward]);

  const [tab, setTab] = useState<MobileTab>(() => tabFromHash());
  const [sheet, setSheet] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // The shell owns the top-level route; the phone face owns what sits under
  // #/app. Listening to hashchange directly keeps the two independent.
  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // A tab change is a screen swap: one short lift, no wipe, no scroll flash.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    if (REDUCED || !mainRef.current) return;
    gsap.fromTo(
      mainRef.current,
      { autoAlpha: 0, y: 10 },
      { autoAlpha: 1, y: 0, duration: 0.34, ease: "power2.out", overwrite: "auto" },
    );
  }, [tab]);

  /**
   * The one place a task is sealed on the phone face. The engine returns the
   * events it produced and the reward layer stages them, so the numbers on
   * screen and the numbers written to storage come from the same call.
   */
  const onComplete = useCallback(
    (task: Task) => {
      const events: CompleteEvent[] = ledger.complete(task);
      fire(events);
    },
    [ledger, fire],
  );

  const onSignOut = useCallback(() => {
    // Sign-out leaves nothing behind that speaks for this operator — not the
    // identity, not the provider marker, and not the cached reward record.
    forgetRewardCache(scope);
    logout();
    forgetProvider();
  }, [scope]);

  return (
    <div className="m-app" data-tab={tab}>
      <header className="m-bar">
        <button
          type="button"
          className="m-bar__brand"
          onClick={() => goToTab("home")}
          aria-label="ShadowQuest home"
        >
          <span className="m-bar__seal" aria-hidden="true">
            <Sigil size={22} />
          </span>
          <span className="m-bar__word">
            Shadow<em>Quest</em>
          </span>
        </button>

        <div className="m-bar__end">
          <button
            type="button"
            className="m-bar__lv"
            onClick={() => goToTab("progress")}
            aria-label={`Life level ${ledger.profile.lifeLevel}, rank ${ledger.profile.growthRank}`}
          >
            <span className="num">Lv.{ledger.profile.lifeLevel}</span>
            <i className="m-bar__rank">{ledger.profile.growthRank}</i>
          </button>
          <button
            type="button"
            className="m-bar__av"
            onClick={() => goToTab("profile")}
            aria-label="Profile"
          >
            <Avatar initials={initialsOf(user.handle)} size={30} />
          </button>
        </div>
      </header>

      <div className="m-scroll">
        <div className="m-title" aria-hidden="true">
          {TITLES[tab]}
        </div>

        <main className="m-main" ref={mainRef} id="m-main">
          {tab === "home" && (
            <HomeScreen
              user={user}
              ledger={ledger}
              trends={trends.trends}
              onComplete={onComplete}
              onNew={() => setSheet(true)}
            />
          )}
          {tab === "tasks" && (
            <TasksScreen
              ledger={ledger}
              onComplete={onComplete}
              onReopen={ledger.reopen}
              onRemove={ledger.remove}
              onNew={() => setSheet(true)}
            />
          )}
          {tab === "progress" && <ProgressScreen ledger={ledger} trends={trends.trends} />}
          {tab === "rewards" && <RewardsScreen ledger={ledger} rewards={rewards} />}
          {tab === "profile" && (
            <ProfileScreen
              user={user}
              ledger={ledger}
              rewards={rewards}
              onSignOut={onSignOut}
            />
          )}
          {tab === "squad" && <SquadScreen user={user} profile={ledger.profile} />}
          {tab === "stats" && <StatsScreen user={user} ledger={ledger} />}
        </main>
      </div>

      <RewardFx lines={lines} />

      <BottomNav tab={tab} />

      <TaskSheet open={sheet} onClose={() => setSheet(false)} onAdd={ledger.add} />
    </div>
  );
}
