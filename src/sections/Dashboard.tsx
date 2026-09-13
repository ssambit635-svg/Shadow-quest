/**
 * Dashboard.tsx — the core To-Do / Productivity hub.
 *
 * This is the screen that must read as a productivity app first and an RPG
 * second. It shows what needs doing TODAY, upcoming, completed, progress,
 * rewards, streaks and life factor growth — all at a glance.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, REDUCED, registerVelTargets } from "../lib/motion";
import { useReveals } from "../lib/reveal";
import { HabitsPanel } from "../components/habits/HabitsPanel";
import { StreakBoard } from "./StreakBoard";
import { streakSnapshot, useHabitsLive } from "../lib/streaks";
import { ApkLink } from "../components/ApkLink";
import type { User } from "../lib/auth";
import { adoptSnapshot, fetchSnapshot, schedulePush, shouldAdopt } from "../lib/sync";
import {
  type Task,
  type Profile,
  type CompleteEvent,
  type LifeFactor,
  type TaskPriority,
  type TaskDifficulty,
  LIFE_FACTOR_META,
  PRIORITY_META,
  DIFFICULTY_META,
  loadTasks,
  saveTasks,
  loadProfile,
  saveProfile,
  completeTask,
  sortTasks,
  tasksForToday,
  upcomingTasks,
  overdueTasks,
  completedTasks,
  makeId,
  todayISO,
} from "../lib/todo";

type Filter = "all" | "today" | "upcoming" | "completed" | "overdue";

/**
 * Dashboard — today's ledger. The real interface: the To-Do at its core,
 * with the growth readouts around it. Everything is scoped to the signed-in
 * operator — their tasks, their points, their streaks, their name.
 */
export function Dashboard({ scope, user }: { scope: string; user: User }) {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(scope));
  const [profile, setProfile] = useState<Profile>(() => loadProfile(scope));
  const [filter, setFilter] = useState<Filter>("today");
  const [showAdd, setShowAdd] = useState(false);
  const [events, setEvents] = useState<(CompleteEvent & { eid: string; born: number })[]>([]);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  // The chain reads every source of evidence: tasks, habits, the engine's
  // last-active record. Habits stay owned by the panel; this view follows.
  const habits = useHabitsLive(scope);
  const snap = useMemo(() => streakSnapshot(profile, tasks, habits), [profile, tasks, habits]);

  // Re-load when the operator changes (sign out → someone else signs in).
  useEffect(() => {
    setTasks(loadTasks(scope));
    setProfile(loadProfile(scope));
  }, [scope]);

  useEffect(() => saveTasks(scope, tasks), [scope, tasks]);
  useEffect(() => saveProfile(scope, profile), [scope, profile]);

  // Backend sync: the stored ledger wins when it is newer than this
  // device's copy. With no backend the pull resolves null and the local
  // ledger stays in charge — the screen behaves exactly as before.
  useEffect(() => {
    let alive = true;
    void fetchSnapshot(scope, user).then((snap) => {
      if (!alive || !snap || !shouldAdopt(scope, snap)) return;
      adoptSnapshot(scope, snap);
      setTasks(snap.tasks);
      if (snap.profile) setProfile(snap.profile);
    });
    return () => {
      alive = false;
    };
  }, [scope, user]);

  // The section header reveals once on entry; rows added later get the
  // scroll-lean registration as they mount.
  useReveals(rootRef);
  useEffect(() => {
    registerVelTargets(rootRef.current);
  }, [tasks.length]);

  const today = useMemo(() => tasksForToday(tasks), [tasks]);
  const overdue = useMemo(() => overdueTasks(tasks), [tasks]);
  const upcoming = useMemo(() => upcomingTasks(tasks), [tasks]);
  const done = useMemo(() => completedTasks(tasks), [tasks]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "today":
        return sortTasks(today.filter((t) => t.status !== "completed"));
      case "upcoming":
        return sortTasks(upcoming);
      case "completed":
        return sortTasks(done);
      case "overdue":
        return sortTasks(overdue);
      default:
        return sortTasks(tasks);
    }
  }, [filter, today, upcoming, done, overdue]);

  // Today progress (daily goals)
  const todayTotal = today.length;
  const todayDone = today.filter((t) => t.status === "completed").length;
  const todayPct = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0;

  // Level progress
  const levelPct = Math.round(
    (profile.levelProgress / profile.progressToNext) * 100,
  );

  const complete = (task: Task) => {
    if (task.status === "completed") return;
    const updated: Task = { ...task, status: "completed", completedAt: Date.now() };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    const { profile: newP, events: evs } = completeTask(profile, task);
    setProfile(newP);
    schedulePush(scope);
    const born = Date.now();
    const stamped = evs.map((e, i) => ({ ...e, eid: `ev_${born}_${i}`, born }));
    setEvents((prev) => [...prev.slice(-7), ...stamped]);
    // Auto-clear floaters
    setTimeout(() => {
      setEvents((prev) => prev.filter((e) => e.born !== born));
    }, 2600);

    if (!REDUCED) {
      gsap.fromTo(
        `[data-task-id="${task.id}"]`,
        { background: "color-mix(in srgb, var(--ok) 35%, transparent)" },
        {
          background: "color-mix(in srgb, var(--ok) 0%, transparent)",
          duration: 1.2,
          ease: "power2.out",
        },
      );
    }
  };

  const remove = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    schedulePush(scope);
  };

  const addTask = (t: Omit<Task, "id" | "createdAt" | "status">) => {
    const newTask: Task = {
      ...t,
      id: makeId(),
      createdAt: Date.now(),
      status: "pending",
    };
    setTasks((prev) => [...prev, newTask]);
    setShowAdd(false);
    schedulePush(scope);
    if (!REDUCED) {
      setTimeout(() => {
        gsap.fromTo(
          `[data-task-id="${newTask.id}"]`,
          { yPercent: -20, autoAlpha: 0, clipPath: "inset(0 100% 0 0)" },
          {
            yPercent: 0,
            autoAlpha: 1,
            clipPath: "inset(0 0% 0 0)",
            duration: 0.7,
            ease: "brush",
          },
        );
      }, 10);
    }
  };

  // Section entry animation
  useEffect(() => {
    if (REDUCED || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "brush" } })
        .fromTo("[data-dash-stat]", { yPercent: 30, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08 }, 0)
        .fromTo("[data-dash-panel]", { yPercent: 20, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1 }, 0.2);
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={rootRef} className="dash section" id="dashboard">
      <div className="shell">
        <header className="dash__head">
          <div>
            <p className="label dash__tag">01 — the ledger of {user.handle}</p>
            <h2 className="dash__title" data-rv="brush">
              Today&apos;s Goals
            </h2>
            <p className="dash__sub">
              Complete real tasks. Grow real areas of your life. This ledger
              is yours — sealed to your signal.
            </p>
          </div>
          <div className="dash__head-actions">
            <ApkLink compact />
            <button
              type="button"
              className="btn btn--primary dash__new-btn"
              onClick={() => setShowAdd((s) => !s)}
            >
              <span className="btn__slash" />
              {showAdd ? "Close" : "New Goal"}
            </button>
          </div>
        </header>

        {/* Top stats row — two accents only: vermilion acts, brass pays. */}
        <div className="dash__stats">
          <StatCard
            label="Life Level"
            value={profile.lifeLevel}
            sub={`Rank ${profile.growthRank}`}
            progress={levelPct}
            color="var(--vermilion)"
            icon="LV"
            mono
          />
          <StatCard
            label="Today"
            value={`${todayDone}/${todayTotal}`}
            sub={`${todayPct}% complete`}
            progress={todayPct}
            color="var(--vermilion)"
            icon="TD"
          />
          <StatCard
            label="Consistency"
            value={`${snap.current}`}
            sub={`${snap.longest} best`}
            progress={Math.min(100, snap.current * 5)}
            color="var(--brass)"
            icon="ST"
            mono
          />
          <StatCard
            label="Reward Points"
            value={profile.rewardPoints.toLocaleString()}
            sub={`${profile.tasksCompleted} goals done`}
            progress={Math.min(100, profile.rewardPoints / 5)}
            color="var(--brass)"
            icon="RP"
            mono
          />
          <StatCard
            label="Energy"
            value={`${profile.energy}`}
            sub={`of ${profile.energyMax}`}
            progress={(profile.energy / profile.energyMax) * 100}
            color="var(--bone-300)"
            icon="EN"
            mono
          />
        </div>

        {/* Life Factors */}
        <div className="dash__factors" data-dash-panel>

          <p className="label dash__factors-label">Life Factors</p>
          <div className="dash__factors-grid">
            {(Object.keys(LIFE_FACTOR_META) as LifeFactor[]).map((f) => {
              const meta = LIFE_FACTOR_META[f];
              const val = Math.round(profile.factors[f]);
              return (
                <div key={f} className="factor" data-vel>
                  <span className="factor__code num" aria-hidden="true">{meta.code}</span>
                  <div className="factor__body">
                    <div className="factor__row">
                      <span className="factor__label">{meta.label}</span>
                      <span className="factor__val num">{val}</span>
                    </div>
                    <div className="factor__bar">
                      <span className="factor__fill" style={{ width: `${val}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Habits — the daily ritual, with its own reminders. */}
        <HabitsPanel scope={scope} />

        {/* The chain — every day of evidence, the heat, the milestones. */}
        <StreakBoard profile={profile} tasks={tasks} habits={habits} />

        {showAdd && <AddTaskForm onAdd={addTask} onCancel={() => setShowAdd(false)} />}

        {/* Filters */}
        <div className="dash__filters" data-dash-panel>
          {(
            [
              ["today", `Today (${today.filter((t) => t.status !== "completed").length})`],
              ["upcoming", `Upcoming (${upcoming.length})`],
              ["overdue", `Overdue (${overdue.length})`],
              ["completed", `Completed (${done.length})`],
              ["all", `All (${tasks.filter((t) => t.status !== "completed").length})`],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`dash__filter ${filter === id ? "is-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tasks list */}
        <ul className="dash__list" ref={listRef} data-dash-panel>
          {filtered.length === 0 && (
            <li className="dash__empty">
              <span className="dash__empty-icon">◇</span>
              <p>No goals in this view. Add a new goal to begin.</p>
            </li>
          )}
          {filtered.map((t) => (
            <TaskRow key={t.id} task={t} onComplete={() => complete(t)} onRemove={() => remove(t.id)} />
          ))}
        </ul>
      </div>

      {/* Completion event floaters */}
      <div className="dash__events" aria-live="polite">
        {events.map((e) => (
          <span key={e.eid} className={`dash__event dash__event--${e.type}`}>
            {e.message}
          </span>
        ))}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  progress,
  color,
  icon,
  mono,
}: {
  label: string;
  value: string | number;
  sub: string;
  progress: number;
  color: string;
  icon: string;
  mono?: boolean;
}) {
  const barRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(
      barRef.current,
      { scaleX: 0 },
      { scaleX: Math.max(0, Math.min(1, progress / 100)), duration: 1.2, ease: "brush", delay: 0.3 },
    );
  }, [progress]);
  return (
    <div className="stat-card" data-dash-stat data-vel>
      <div className="stat-card__head">
        <span className="stat-card__icon num" style={{ color }}>{icon}</span>
        <span className="stat-card__label label">{label}</span>
      </div>
      <div className={`stat-card__value ${mono ? "num" : ""}`}>{value}</div>
      <div className="stat-card__sub">{sub}</div>
      <div className="stat-card__bar">
        <span ref={barRef} style={{ background: color }} />
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onComplete,
  onRemove,
}: {
  task: Task;
  onComplete: () => void;
  onRemove: () => void;
}) {
  const done = task.status === "completed";
  const pmeta = PRIORITY_META[task.priority];
  const dmeta = DIFFICULTY_META[task.difficulty];
  return (
    <li
      className={`task ${done ? "is-done" : ""} ${task.status === "overdue" ? "is-overdue" : ""}`}
      data-task-id={task.id}
      data-vel
    >
      <button
        type="button"
        className={`task__check ${done ? "is-checked" : ""}`}
        onClick={onComplete}
        aria-label={done ? "Completed" : "Mark complete"}
      >
        <span className="task__check-inner">
          {done && (
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>

      <div className="task__body">
        <div className="task__top">
          <h4 className={`task__title ${done ? "is-struck" : ""}`}>{task.title}</h4>
          <div className="task__flags">
            <span
              className="task__flag"
              style={{ color: pmeta.color, borderColor: `${pmeta.color}60` }}
            >
              {pmeta.label}
            </span>
            <span className="task__flag task__flag--dim">{dmeta.label}</span>
            {task.daily && <span className="task__flag task__flag--daily">DAILY</span>}
            {task.status === "overdue" && (
              <span className="task__flag task__flag--overdue">OVERDUE</span>
            )}
          </div>
        </div>
        {task.description && <p className="task__desc">{task.description}</p>}
        <div className="task__meta">
          <div className="task__factors">
            {task.factors.map((g) => (
              <span
                key={g.factor}
                className="task__factor"
                title={`${LIFE_FACTOR_META[g.factor].label} +${g.amount}`}
              >
                {LIFE_FACTOR_META[g.factor].code}+{g.amount}
              </span>
            ))}
          </div>
          <div className="task__rewards">
            <span className="task__prog">+{task.progress} PROGRESS</span>
            <span className="task__rp">+{task.rewardPoints} RP</span>
            {task.dueDate && (
              <span className="task__due label">
                {task.dueDate === todayISO() ? "TODAY" : task.dueDate}
              </span>
            )}
            <button type="button" className="task__remove label" onClick={onRemove}>
              remove
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function AddTaskForm({
  onAdd,
  onCancel,
}: {
  onAdd: (t: Omit<Task, "id" | "createdAt" | "status">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [difficulty, setDifficulty] = useState<TaskDifficulty>("normal");
  const [dueDate, setDueDate] = useState(todayISO());
  const [daily, setDaily] = useState(false);
  const [selFactors, setSelFactors] = useState<Record<LifeFactor, number>>({
    knowledge: 0,
    focus: 0,
    discipline: 0,
    strength: 0,
    energy: 0,
    wellness: 0,
    skills: 0,
  });

  // Auto-compute progress & rewards based on difficulty + factor count
  const factorSum = Object.values(selFactors).reduce((a, b) => a + b, 0);
  const diffMeta = DIFFICULTY_META[difficulty];
  const progress = Math.round((40 + factorSum * 15) / diffMeta.progressMul * diffMeta.progressMul);
  const rewardPoints = Math.round((10 + factorSum * 4) / diffMeta.rewardMul * diffMeta.rewardMul);

  const toggleFactor = (f: LifeFactor) => {
    setSelFactors((prev) => {
      const current = prev[f];
      const next = current >= 4 ? 0 : current + (current === 0 ? 2 : 1);
      return { ...prev, [f]: next };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const factors = (Object.keys(selFactors) as LifeFactor[])
      .filter((f) => selFactors[f] > 0)
      .map((f) => ({ factor: f, amount: selFactors[f] }));
    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      difficulty,
      dueDate: daily ? undefined : dueDate || undefined,
      daily,
      factors,
      progress,
      rewardPoints,
      category: "General",
    });
  };

  return (
    <form className="add-form" data-dash-panel onSubmit={submit}>
      <div className="add-form__grid">
        <div className="add-form__main">
          <label className="entry add-form__entry">
            <span className="label">Goal Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete coding project"
              maxLength={80}
            />
          </label>
          <label className="entry add-form__entry">
            <span className="label">Description (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to happen?"
              maxLength={160}
            />
          </label>

          <div className="add-form__row">
            <div className="add-form__field">
              <span className="label">Priority</span>
              <div className="add-form__chips">
                {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                  <button
                    type="button"
                    key={p}
                    className={`chip ${priority === p ? "is-active" : ""}`}
                    onClick={() => setPriority(p)}
                    style={priority === p ? { borderColor: PRIORITY_META[p].color, color: PRIORITY_META[p].color } : undefined}
                  >
                    {PRIORITY_META[p].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="add-form__field">
              <span className="label">Difficulty</span>
              <div className="add-form__chips">
                {(Object.keys(DIFFICULTY_META) as TaskDifficulty[]).map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`chip ${difficulty === d ? "is-active" : ""}`}
                    onClick={() => setDifficulty(d)}
                  >
                    {DIFFICULTY_META[d].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="add-form__row">
            <label className="add-form__check">
              <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
              <span className="add-form__check-box" />
              <span>Daily Goal (repeats every day)</span>
            </label>
            {!daily && (
              <label className="entry add-form__date">
                <span className="label">Due</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            )}
          </div>
        </div>

        <div className="add-form__side">
          <span className="label">Life Factors Improved</span>
          <div className="add-form__factors">
            {(Object.keys(LIFE_FACTOR_META) as LifeFactor[]).map((f) => {
              const m = LIFE_FACTOR_META[f];
              const v = selFactors[f];
              return (
                <button
                  type="button"
                  key={f}
                  className={`factor-chip ${v > 0 ? "is-active" : ""}`}
                  onClick={() => toggleFactor(f)}
                >
                  <span className="factor-chip__code num" aria-hidden="true">{m.code}</span>
                  <span className="factor-chip__name">{m.label}</span>
                  {v > 0 && <span className="factor-chip__v num">+{v}</span>}
                </button>
              );
            })}
          </div>

          <div className="add-form__rewards">
            <div className="add-form__reward">
              <span className="label">Progress</span>
              <span className="add-form__reward-v num">+{progress}</span>
            </div>
            <div className="add-form__reward">
              <span className="label">Reward Points</span>
              <span className="add-form__reward-v num">+{rewardPoints}</span>
            </div>
          </div>

          <div className="add-form__actions">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={!title.trim()}>
              <span className="btn__slash" />
              Add Goal
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
