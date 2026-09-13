/**
 * HabitsPanel.tsx — the daily ritual, on the ledger.
 *
 * Habits are not tasks: nothing to schedule, no progress points, no reward.
 * One row per thing you do every day, a seal per date, and the streak as the
 * only currency. Each habit carries a time of day; when the ritual is armed
 * and the browser allows it, a habit still open past its time raises exactly
 * one system notification per day — and glows brass inside the panel either
 * way, so the nudge survives blocked permissions and closed lids.
 */
import { useEffect, useRef, useState } from "react";
import {
  type Habit,
  addHabit,
  isDoneToday,
  lastDays,
  loadHabits,
  notificationPermission,
  notificationsSupported,
  patchHabit,
  remindersArmed,
  reminderAt,
  removeHabit,
  requestNotificationPermission,
  runReminderPass,
  saveHabits,
  setRemindersArmed,
  streakOf,
  toggleToday,
} from "../../lib/habits";
import { currentUser } from "../../lib/auth";
import { gsap, REDUCED } from "../../lib/motion";
import { fetchSnapshot, localSyncTs, schedulePush } from "../../lib/sync";

export function HabitsPanel({ scope }: { scope: string }) {
  const [habits, setHabits] = useState<Habit[]>(() => loadHabits(scope));
  const [armed, setArmed] = useState<boolean>(() => remindersArmed(scope));
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    notificationsSupported() ? notificationPermission() : "unsupported",
  );
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("20:00");
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const habitsRef = useRef(habits);
  habitsRef.current = habits;

  useEffect(() => {
    setHabits(loadHabits(scope));
    setArmed(remindersArmed(scope));
  }, [scope]);

  // Backend sync: when the stored ledger is newer than what this device
  // had at mount time, adopt its habits. The snapshot is shared with the
  // dashboard, so this costs nothing extra.
  useEffect(() => {
    let alive = true;
    const user = currentUser();
    if (!user) return;
    const startTs = localSyncTs(scope);
    void fetchSnapshot(scope, user).then((snap) => {
      if (!alive || !snap || snap.updatedAt <= startTs) return;
      saveHabits(scope, snap.habits);
      setHabits(snap.habits);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  // A slow clock: drives the "past its time" glow and the reminder pass.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // The reminder pass — any route, any tab, once per habit per day.
  useEffect(() => {
    const pass = () => {
      const fired = runReminderPass(scope, habitsRef.current);
      if (!fired.length || REDUCED) return;
      for (const id of fired) {
        const node = rootRef.current?.querySelector<HTMLElement>(`[data-habit="${id}"]`);
        if (node) {
          gsap.fromTo(
            node,
            { boxShadow: "0 0 0 0 color-mix(in srgb, var(--brass) 55%, transparent)" },
            {
              boxShadow: "0 0 0 10px color-mix(in srgb, var(--brass) 0%, transparent)",
              duration: 1.4,
              ease: "power2.out",
              clearProps: "boxShadow",
            },
          );
        }
      }
    };
    pass();
    const t = window.setInterval(pass, 30_000);
    return () => window.clearInterval(t);
  }, [scope]);

  const openCount = habits.filter((h) => !isDoneToday(h)).length;
  const lateCount = habits.filter((h) => !isDoneToday(h) && now >= reminderAt(h)).length;

  const arm = async () => {
    const next = !armed;
    setArmed(next);
    setRemindersArmed(scope, next);
    if (next && notificationsSupported() && Notification.permission === "default") {
      setPerm(await requestNotificationPermission());
    }
  };

  const toggle = (id: string) => {
    const was = habitsRef.current.find((h) => h.id === id);
    const next = toggleToday(scope, habitsRef.current, id);
    setHabits(next);
    schedulePush(scope);
    if (!REDUCED && was && !isDoneToday(was)) {
      const node = rootRef.current?.querySelector<HTMLElement>(`[data-habit="${id}"] .habit__seal`);
      if (node) {
        gsap.fromTo(
          node,
          { scale: 0.7, rotate: -10 },
          { scale: 1, rotate: 0, duration: 0.55, ease: "snap", clearProps: "all" },
        );
      }
    }
  };

  return (
    <div className="habits" data-dash-panel ref={rootRef}>
      <div className="habits__head">
        <div>
          <p className="label habits__tag">習慣 · the daily ritual</p>
          <h3 className="habits__title">Habits</h3>
        </div>
        <button
          type="button"
          className="habits__arm label"
          data-on={armed || undefined}
          onClick={() => void arm()}
          title="daily reminder — one notification per open habit, past its time"
        >
          {armed ? "reminder on" : "reminder off"}
        </button>
      </div>

      <p className="habits__note label">
        {openCount === 0
          ? "all sealed for today — the streak holds"
          : `${openCount} open today${lateCount > 0 ? ` · ${lateCount} past its time` : ""}`}
        {armed && perm === "unsupported" && " · this browser has no notifications — nudges stay in-app"}
        {armed && perm === "denied" && " · notifications blocked — nudges stay in-app"}
      </p>

      <ul className="habits__list">
        {habits.map((h) => {
          const done = isDoneToday(h);
          const late = !done && now >= reminderAt(h);
          return (
            <li className="habit" key={h.id} data-habit={h.id} data-late={late || undefined}>
              <span className="habit__seal" data-done={done || undefined} aria-hidden="true">
                {h.mark}
              </span>

              <div className="habit__body">
                <div className="habit__row">
                  <span className="habit__title">{h.title}</span>
                  <span className="habit__streak num" title="current streak">
                    ×{streakOf(h)}
                  </span>
                </div>
                <div className="habit__days" aria-label="last seven days">
                  {lastDays(h).map(([d, sealedDay]) => (
                    <i key={d} data-on={sealedDay || undefined} title={d} />
                  ))}
                </div>
              </div>

              <div className="habit__ctl">
                <label className="habit__time" title="reminder time">
                  <input
                    type="time"
                    value={h.time}
                    onChange={(e) => {
                      setHabits(patchHabit(scope, habitsRef.current, h.id, { time: e.target.value }));
                      schedulePush(scope);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="habit__bell label"
                  data-on={h.remind || undefined}
                  title="remind me daily"
                  onClick={() => {
                    setHabits(patchHabit(scope, habitsRef.current, h.id, { remind: !h.remind }));
                    schedulePush(scope);
                  }}
                >
                  {h.remind ? "on" : "off"}
                </button>
                <button
                  type="button"
                  className={`habit__check ${done ? "is-checked" : ""}`}
                  aria-label={done ? `unseal ${h.title} for today` : `seal ${h.title} for today`}
                  onClick={() => toggle(h.id)}
                >
                  <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                    <path
                      className="habit__check-stroke"
                      d="M4 10.5 L8.5 15 L16 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="habit__rm label"
                  aria-label={`remove ${h.title}`}
                  onClick={() => {
                    setHabits(removeHabit(scope, habitsRef.current, h.id));
                    schedulePush(scope);
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="habits__add">
        <label className="entry habits__add-entry" htmlFor="habit-title">
          <input
            id="habit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="add a daily habit…"
            maxLength={60}
          />
        </label>
        <input
          className="habits__add-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="reminder time for the new habit"
        />
        <button
          type="button"
          className="habits__add-go label"
          disabled={!title.trim()}
            onClick={() => {
              setHabits(addHabit(scope, habitsRef.current, title, time));
              setTitle("");
              schedulePush(scope);
            }}
        >
          add
        </button>
      </div>

      {armed && perm === "default" && (
        <button
          type="button"
          className="habits__perm label"
          onClick={() => void requestNotificationPermission().then(setPerm)}
        >
          allow browser notifications for the ritual
        </button>
      )}
    </div>
  );
}
