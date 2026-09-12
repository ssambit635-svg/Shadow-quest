/**
 * QuestLog.tsx — THE main objective: to-do list.
 * Shadow Quest theme: tasks are duels, training, debts.
 * - Eurostile for all headings (per request)
 * - Ink bloom on add / complete / delete via GSAP
 * - LocalStorage persistence
 * - Priority, shadow association, filters
 * - Image blooming from ink: when task completed, ink-wash image blooms behind it
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, REDUCED } from "../lib/motion";
import { useReveals } from "../lib/reveal";

type Priority = "high" | "med" | "low";
type Task = {
  id: string;
  text: string;
  done: boolean;
  priority: Priority;
  shadow: string;
  createdAt: number;
};

const SHADOWS = ["kage", "yami", "suzume", "tetsu", "hannya", "bokushi"] as const;
const STORAGE_KEY = "sq.questlog.v2";

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "CUT",
  med: "GUARD",
  low: "BREATHE",
};

const uid = () => Math.random().toString(36).slice(2, 9);

const loadTasks = (): Task[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
};

const saveTasks = (tasks: Task[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {}
};

const DEFAULT_TASKS: Task[] = [
  { id: "d1", text: "Read opponent's stance — 20s clock", done: false, priority: "high", shadow: "kage", createdAt: Date.now() - 100000 },
  { id: "d2", text: "Hold zanshin after last cut", done: false, priority: "med", shadow: "yami", createdAt: Date.now() - 80000 },
  { id: "d3", text: "Ki budget: technique costs 42, guard returns 26", done: true, priority: "low", shadow: "suzume", createdAt: Date.now() - 60000 },
];

export function QuestLog() {
  const root = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>(() => {
    const loaded = loadTasks();
    return loaded.length ? loaded : DEFAULT_TASKS;
  });
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("high");
  const [shadow, setShadow] = useState<string>("kage");
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [q, setQ] = useState("");

  useReveals(root, [tasks.length]);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Entrance animations for the whole section
  useEffect(() => {
    if (REDUCED) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".questlog__title .st-char",
        { yPercent: 110 },
        {
          yPercent: 0,
          duration: 1,
          ease: "brush",
          stagger: 0.02,
          scrollTrigger: { trigger: root.current, start: "top 70%", once: true },
        },
      );
      gsap.fromTo(
        ".questlog__plate",
        { clipPath: "inset(0 100% 0 0)" },
        {
          clipPath: "inset(0 0% 0 0)",
          duration: 1.2,
          ease: "snap",
          scrollTrigger: { trigger: root.current, start: "top 70%", once: true },
        },
      );
      gsap.to(".questlog__ink-wash", {
        scale: 1.05,
        yPercent: -4,
        duration: 18,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const filtered = useMemo(() => {
    let t = tasks;
    if (filter === "active") t = t.filter((x) => !x.done);
    if (filter === "done") t = t.filter((x) => x.done);
    if (q.trim()) {
      const qq = q.toLowerCase();
      t = t.filter((x) => x.text.toLowerCase().includes(qq) || x.shadow.includes(qq));
    }
    return t.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pOrder = { high: 0, med: 1, low: 2 };
      if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
      return b.createdAt - a.createdAt;
    });
  }, [tasks, filter, q]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const active = total - done;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, active, pct };
  }, [tasks]);

  const addTask = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newTask: Task = {
      id: uid(),
      text: trimmed,
      done: false,
      priority,
      shadow,
      createdAt: Date.now(),
    };
    setTasks((prev) => [newTask, ...prev]);
    setText("");

    // GSAP ink bloom on add
    if (!REDUCED) {
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-task="${newTask.id}"]`) as HTMLElement;
        if (!el) return;
        gsap.fromTo(
          el,
          { clipPath: "inset(0 100% 0 0)", y: 12, autoAlpha: 0 },
          { clipPath: "inset(0 0% 0 0)", y: 0, autoAlpha: 1, duration: 0.7, ease: "ink" },
        );
        gsap.fromTo(
          el.querySelector(".questlog__task-ink"),
          { scaleX: 0, opacity: 0 },
          { scaleX: 1, opacity: 0.22, duration: 0.8, ease: "brush", transformOrigin: "left center" },
        );
        gsap.fromTo(
          el.querySelector(".questlog__task-bloom"),
          { scale: 0, opacity: 0 },
          { scale: 1.4, opacity: 0.35, duration: 0.9, ease: "brush" },
        );
      });
    }
    inputRef.current?.focus();
  };

  const toggle = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    if (!REDUCED) {
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-task="${id}"]`) as HTMLElement;
        if (!el) return;
        const isNowDone = !tasks.find((t) => t.id === id)?.done;
        if (isNowDone) {
          // Complete: ink blooms behind, image expands
          gsap.timeline()
            .to(el.querySelector(".questlog__task-ink"), {
              scaleX: 1,
              opacity: 0.55,
              duration: 0.5,
              ease: "ink",
              backgroundColor: "var(--vermilion)",
            })
            .fromTo(
              el.querySelector(".questlog__task-wash"),
              { clipPath: "circle(0% at 12% 50%)", opacity: 0 },
              { clipPath: "circle(110% at 12% 50%)", opacity: 0.42, duration: 1.1, ease: "brush" },
              0.1,
            )
            .fromTo(
              el.querySelector(".questlog__task-bloom"),
              { scale: 0, opacity: 0 },
              { scale: 2.2, opacity: 0.5, duration: 0.8, ease: "brush" },
              0,
            )
            .to(el.querySelector(".questlog__task-text"), { x: 6, duration: 0.3, ease: "snap" }, 0);
        } else {
          gsap.to(el.querySelector(".questlog__task-ink"), {
            scaleX: 0,
            opacity: 0.15,
            duration: 0.5,
            ease: "brush",
            backgroundColor: "var(--line-strong)",
          });
          gsap.to(el.querySelector(".questlog__task-wash"), {
            clipPath: "circle(0% at 12% 50%)",
            opacity: 0,
            duration: 0.6,
            ease: "brush",
          });
        }
      });
    }
  };

  const remove = (id: string) => {
    if (!REDUCED) {
      const el = listRef.current?.querySelector(`[data-task="${id}"]`) as HTMLElement;
      if (el) {
        gsap.to(el, {
          y: -12,
          autoAlpha: 0,
          clipPath: "inset(0 0 100% 0)",
          duration: 0.45,
          ease: "slash",
          onComplete: () => setTasks((prev) => prev.filter((t) => t.id !== id)),
        });
        return;
      }
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const clearDone = () => {
    if (!REDUCED && listRef.current) {
      const doneEls = listRef.current.querySelectorAll("[data-done='true']");
      gsap.to(doneEls, {
        x: -20,
        autoAlpha: 0,
        duration: 0.4,
        ease: "brush",
        stagger: 0.05,
        onComplete: () => setTasks((prev) => prev.filter((t) => !t.done)),
      });
    } else {
      setTasks((prev) => prev.filter((t) => !t.done));
    }
  };

  return (
    <section className="questlog section" id="questlog" ref={root}>
      <div className="shell questlog__grid">
        {/* Left — manifesto + stats + ink plate */}
        <div className="questlog__aside">
          <p className="label questlog__tag" data-rv="rise">
            00 — quest log · main
          </p>
          <h2 className="questlog__title" data-rv="brush">
            <span className="rv-line">
              <span>Your tasks</span>
            </span>
            <span className="rv-line questlog__title-em">
              <span>are your blade.</span>
            </span>
          </h2>
          <p className="questlog__lede" data-rv="rise">
            This is the core of Shadow Quest. Not the duel, not the roster — the list.
            Every task is a cut you owe. Track it in Eurostile, watch ink bloom when it’s done.
            Built with high-level GSAP: wash images expanding from a point, not a basic progress line.
          </p>

          <div className="questlog__stats" data-rv="rise">
            <div className="questlog__stat">
              <span className="label">total</span>
              <span className="questlog__stat-v num">{stats.total}</span>
            </div>
            <div className="questlog__stat">
              <span className="label">active</span>
              <span className="questlog__stat-v num">{stats.active}</span>
            </div>
            <div className="questlog__stat">
              <span className="label">done</span>
              <span className="questlog__stat-v num">{stats.done}</span>
            </div>
            <div className="questlog__stat questlog__stat--pct">
              <span className="label">form</span>
              <span className="questlog__stat-v num">{stats.pct}%</span>
              <span className="questlog__pct-bar">
                <span style={{ width: `${stats.pct}%` }} />
              </span>
            </div>
          </div>

          <figure className="questlog__plate" data-rv="bleed">
            <div className="questlog__ink-wash">
              <img src="/img/ink-wash.jpg" alt="" loading="lazy" />
              <div className="questlog__plate-bloom" />
            </div>
            <figcaption className="label">ink wash — task completion blooms from here</figcaption>
          </figure>

          <div className="questlog__meta" data-rv="rise">
            <p className="label">Font · Eurostile · Rosnoc</p>
            <p className="questlog__meta-small">Headings in Eurostile Extended, body in Manrope. No horizontal cursor trails. Scroll progress is an ink image blooming, not a red line.</p>
          </div>
        </div>

        {/* Right — input + list */}
        <div className="questlog__main">
          <div className="questlog__input-wrap" data-rv="rise">
            <div className="questlog__input-row">
              <input
                ref={inputRef}
                className="questlog__input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTask();
                }}
                placeholder="Add a cut you owe — e.g. 'Study Kage's riposte'"
                aria-label="New task"
              />
              <button className="btn btn--primary questlog__add" type="button" onClick={addTask} disabled={!text.trim()}>
                <span className="btn__slash" />
                Add
              </button>
            </div>

            <div className="questlog__controls">
              <div className="questlog__pills">
                {(["high", "med", "low"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="questlog__pill"
                    data-active={priority === p}
                    data-priority={p}
                    onClick={() => setPriority(p)}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>

              <div className="questlog__shadows">
                {SHADOWS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="questlog__shadow-chip"
                    data-active={shadow === s}
                    onClick={() => setShadow(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="questlog__filters" data-rv="rise">
            <div className="questlog__filter-tabs">
              {(["all", "active", "done"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="questlog__filter"
                  data-active={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <input
              className="questlog__search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter tasks…"
              aria-label="Filter tasks"
            />
            {stats.done > 0 && (
              <button type="button" className="questlog__clear" onClick={clearDone}>
                Clear done ({stats.done})
              </button>
            )}
          </div>

          <ul className="questlog__list" ref={listRef}>
            {filtered.length === 0 && (
              <li className="questlog__empty">
                <span className="label">no tasks</span>
                <p>— add your first cut. It will bloom in ink when you finish it.</p>
              </li>
            )}
            {filtered.map((t) => (
              <li key={t.id} className="questlog__task" data-task={t.id} data-done={t.done} data-priority={t.priority}>
                <span className="questlog__task-ink" aria-hidden="true" />
                <span className="questlog__task-wash" aria-hidden="true">
                  <img src="/img/ink-wash.jpg" alt="" loading="lazy" />
                </span>
                <span className="questlog__task-bloom" aria-hidden="true" />

                <button type="button" className="questlog__check" onClick={() => toggle(t.id)} aria-label={t.done ? "Mark active" : "Mark done"}>
                  <span className="questlog__check-box">
                    {t.done && (
                      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                        <path d="M1.5 6 L4.5 9 L10.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>

                <div className="questlog__task-body">
                  <p className="questlog__task-text" data-done={t.done}>
                    {t.text}
                  </p>
                  <div className="questlog__task-meta">
                    <span className="label questlog__task-priority" data-p={t.priority}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                    <span className="label">·</span>
                    <span className="label">{t.shadow}</span>
                    <span className="label">·</span>
                    <span className="label num">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <button type="button" className="questlog__delete" onClick={() => remove(t.id)} aria-label="Delete task">
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className="questlog__foot label">
            <span>{filtered.length} shown</span>
            <span>·</span>
            <span>Eurostile for headings, ink bloom for progress</span>
            <span>·</span>
            <span>GSAP ScrollTrigger + DrawSVG</span>
          </div>
        </div>
      </div>
    </section>
  );
}
