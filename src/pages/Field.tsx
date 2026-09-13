/**
 * Field.tsx — the Deep Work room.
 *
 * Not a duel any more. You choose the *rhythm* you want to work in — one of
 * six techniques, each a cycle shape with a kanji seal — and the room holds
 * that rhythm with you: an ensō clock that fills while focus is held and
 * drains while rest is taken, cycle seals that stamp themselves, and a rail
 * that keeps the real ledger within reach so a finished task can be sealed
 * without leaving the seat.
 *
 * The session is wall-clock based and persisted, so exiting (or a refresh,
 * or a dead battery) never burns a minute: the room is exactly as you left
 * it, and the log tells you what happened while you were gone.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scopeOf, useUser } from "../lib/auth";
import {
  type Task,
  loadTasks,
  saveTasks,
  loadProfile,
  saveProfile,
  completeTask,
  tasksForToday,
  makeId,
  todayISO,
} from "../lib/todo";
import { TECHNIQUES, cycleLine } from "../lib/techniques";
import { mmss, useFocusSession, type PhaseEvent } from "../hooks/useFocusSession";
import { prefs } from "../lib/prefs";
import { notificationPermission, requestNotificationPermission } from "../lib/habits";
import { gsap, REDUCED } from "../lib/motion";
import { SessionRing } from "../components/session/SessionRing";

const PHASE_KANJI = { focus: "集中", rest: "休息", done: "完" } as const;
const PHASE_LABEL = { focus: "focus held", rest: "rest taken", done: "session complete" } as const;

function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Field({ onExit }: { onExit: () => void }) {
  const user = useUser();
  const scope = scopeOf(user);
  const root = useRef<HTMLElement>(null);

  const [pick, setPick] = useState<string>(() => prefs.technique() ?? "pomodoro");
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(scope));
  const [alerts, setAlerts] = useState<boolean>(() => prefs.phaseAlerts());
  const [quick, setQuick] = useState("");

  /* ---------------------------------------------------------------- *
   * Phase feedback: one stamp of ink on the ring, and — if the operator
   * armed them and the browser allows it — one system notification.
   * ---------------------------------------------------------------- */
  const onPhase = useCallback((e: PhaseEvent) => {
    if (!REDUCED) {
      const pulse = root.current?.querySelector<HTMLElement>(".sring__pulse");
      if (pulse) {
        gsap.fromTo(
          pulse,
          { autoAlpha: 0.55, scale: 0.72 },
          { autoAlpha: 0, scale: 1.28, duration: 1.1, ease: "power2.out", clearProps: "all" },
        );
      }
    }
    if (!prefs.phaseAlerts() || notificationPermission() !== "granted") return;
    const body =
      e.kind === "focus-held"
        ? `Focus held — ${mmss(e.heldMs)}. Rest ${mmss(e.restMs)}: stand up, look far away.`
        : e.kind === "rest-over"
          ? `Rest over — cycle ${e.cycle} of ${e.cycles}. Back to the seat.`
          : `Session complete — ${e.cyclesDone} cycles, ${mmss(e.focusMs)} of focus. The seal is yours.`;
    try {
      new Notification("ShadowQuest — deep work", { body, tag: `sq-phase-${Date.now()}` });
    } catch {
      /* some platforms refuse construction; the log already carries it */
    }
  }, []);

  const sess = useFocusSession(onPhase);
  const { s } = sess;

  // A different operator signs in → their ledger, not yours.
  useEffect(() => {
    setTasks(loadTasks(scope));
  }, [scope]);

  const open = useMemo(
    () => tasksForToday(tasks).filter((t) => t.status !== "completed"),
    [tasks],
  );
  const linked = useMemo(() => tasks.find((t) => t.id === s?.taskId) ?? null, [tasks, s?.taskId]);
  const sealed = useMemo(
    () => s?.log.filter((l) => l.kind === "task" && l.text.startsWith("Sealed")).length ?? 0,
    [s],
  );

  /* ---------------- ledger verbs, from inside the room ---------------- */

  const sealTask = useCallback(
    (task: Task) => {
      const stored = loadTasks(scope).map((t) =>
        t.id === task.id ? { ...t, status: "completed" as const, completedAt: Date.now() } : t,
      );
      saveTasks(scope, stored);
      const profile = loadProfile(scope);
      const done = stored.find((t) => t.id === task.id);
      if (done) {
        const { profile: next } = completeTask(profile, done);
        saveProfile(scope, next);
      }
      setTasks(stored);
      sess.note(`Sealed: ${task.title} (+${task.progress} progress · +${task.rewardPoints} RP)`);
      if (s?.taskId === task.id) sess.linkTask(null);
    },
    [scope, sess, s?.taskId],
  );

  const quickAdd = useCallback(() => {
    const title = quick.trim();
    if (!title) return;
    const task: Task = {
      id: makeId(),
      title,
      priority: "medium",
      difficulty: "normal",
      dueDate: todayISO(),
      daily: false,
      factors: [{ factor: "focus", amount: 1 }],
      progress: 40,
      rewardPoints: 10,
      status: "pending",
      createdAt: Date.now(),
      category: "Deep Work",
    };
    const stored = [...loadTasks(scope), task];
    saveTasks(scope, stored);
    setTasks(stored);
    sess.linkTask(task.id);
    sess.note(`Added to the ledger: ${title}`);
    setQuick("");
  }, [quick, scope, sess]);

  /* ---------------- room furniture ---------------- */

  const toggleAlerts = useCallback(async () => {
    const next = !alerts;
    setAlerts(next);
    prefs.setPhaseAlerts(next);
    if (next && notificationPermission() === "default") {
      const perm = await requestNotificationPermission();
      if (perm !== "granted") {
        sess.note("Browser blocked notifications — phase alerts stay in the log.", "system");
      }
    }
  }, [alerts, sess]);

  // Keyboard: space holds/pauses, s settles the phase early, Esc leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (!s) return;
      if (e.key === "Escape") {
        onExit();
        return;
      }
      if (s.phase === "done") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (s.running) sess.pause();
        else sess.hold();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        sess.skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, sess, onExit]);

  // The tab title carries the clock, so an alt-tabbed operator still sees it.
  useEffect(() => {
    if (!s || s.phase === "done" || !s.running) {
      document.title = "ShadowQuest — Personal OS";
      return;
    }
    document.title = `${mmss(sess.phaseMs)} · ${s.phase === "focus" ? "focus" : "rest"} — ShadowQuest`;
    return () => {
      document.title = "ShadowQuest — Personal OS";
    };
  }, [s, sess.phaseMs]);

  // Entry: the picker deals itself; the room assembles bar → ring → rail.
  useEffect(() => {
    if (REDUCED) return;
    const ctx = gsap.context(() => {
      if (!s) {
        gsap.fromTo(
          "[data-fx-pick]",
          { yPercent: 40, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.8, ease: "brush", stagger: 0.07 },
        );
        gsap.fromTo(
          "[data-fx-mark]",
          { clipPath: "inset(0 0 100% 0)", autoAlpha: 0 },
          { clipPath: "inset(0 0 0% 0)", autoAlpha: 1, duration: 1.2, ease: "brush", delay: 0.2 },
        );
      } else {
        gsap
          .timeline({ defaults: { ease: "brush" } })
          .fromTo("[data-fx-bar]", { yPercent: -100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6 })
          .fromTo("[data-fx-ring]", { scale: 0.92, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.9 }, 0.15)
          .fromTo("[data-fx-rail]", { xPercent: 6, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: 0.8 }, 0.3)
          .fromTo("[data-fx-ctl]", { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, stagger: 0.06 }, 0.4);
      }
    }, root);
    return () => ctx.revert();
  }, [Boolean(s)]); // eslint-disable-line react-hooks/exhaustive-deps

  // The one idle loop here: the ink beneath the room breathes.
  useEffect(() => {
    if (REDUCED) return;
    const t = gsap.to("[data-fx-bleed]", {
      scale: 1.045,
      opacity: 0.55,
      duration: 5.2,
      ease: "breath",
      yoyo: true,
      repeat: -1,
      transformOrigin: "center",
    });
    return () => {
      t.kill();
    };
  }, [Boolean(s)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase changes swap the watermark kanji with a brush reveal.
  useEffect(() => {
    if (REDUCED || !s) return;
    gsap.fromTo(
      ".sring__kanji",
      { autoAlpha: 0, clipPath: "inset(0 0 100% 0)" },
      { autoAlpha: 1, clipPath: "inset(0 0 0% 0)", duration: 0.9, ease: "brush", clearProps: "clipPath" },
    );
  }, [s?.phase, Boolean(s)]);

  /* ---------------------------------------------------------------- *
   * Screen 1 — the picker. No session on the seat yet.
   * ---------------------------------------------------------------- */
  if (!s) {
    return (
      <section className="field field--pick" ref={root}>
        <div className="field__bleed" data-fx-bleed aria-hidden="true" />
        <header className="pick__head shell" data-fx-pick>
          <p className="label">Deep Work Session</p>
          <h1 className="pick__title">
            Choose the rhythm
            <br />
            you will keep today.
          </h1>
          <p className="pick__sub">
            Every technique is only a cycle shape — how long you hold, how long
            you stand down, how many rounds. Pick the one that matches the work
            in front of you. The room keeps the count so you don&apos;t have to.
          </p>
        </header>

        <div className="pick__grid shell">
          {TECHNIQUES.map((t) => (
            <button
              type="button"
              key={t.id}
              className="tech"
              data-sel={pick === t.id || undefined}
              data-fx-pick
              onClick={() => {
                setPick(t.id);
                prefs.setTechnique(t.id);
                if (!REDUCED) {
                  gsap.fromTo(
                    `[data-tech="${t.id}"] .tech__seal`,
                    { scale: 0.8, rotate: -8 },
                    { scale: 1, rotate: 0, duration: 0.5, ease: "snap", clearProps: "all" },
                  );
                }
              }}
              data-tech={t.id}
            >
              <span className="tech__seal" aria-hidden="true">
                {t.kanji}
              </span>
              <span className="tech__name">{t.name}</span>
              <span className="tech__romaji label">{t.romaji}</span>
              <span className="tech__cycle num">{cycleLine(t)}</span>
              <span className="tech__line">{t.line}</span>
              <span className="tech__tick" aria-hidden="true">
                ✓
              </span>
            </button>
          ))}
        </div>

        <div className="pick__go shell" data-fx-pick>
          <button
            className="btn btn--primary btn--wide"
            type="button"
            onClick={() => {
              prefs.setTechnique(pick);
              sess.start(pick);
            }}
          >
            <span className="btn__slash" />
            Begin Session
          </button>
          <p className="pick__hint label">
            the clock is wall-clock — a refresh, a closed lid, a dead battery: the room waits
          </p>
        </div>

        <div className="pick__mark" aria-hidden="true" data-fx-mark>
          <img
            src="/img/ink-wash.jpg"
            alt=""
            loading="lazy"
            style={{ filter: "contrast(1.05) saturate(0.55) brightness(0.8)" }}
          />
        </div>
      </section>
    );
  }

  /* ---------------------------------------------------------------- *
   * Screen 2 — the room.
   * ---------------------------------------------------------------- */
  const t = sess.technique;
  const over = s.phase === "done";
  const timed = t.focusMin !== null || s.phase === "rest";
  const urgent =
    s.phase === "focus" && s.running && timed && t.focusMin !== null && sess.phaseMs <= 10_000;

  return (
    <section className="field field--room" ref={root} data-phase={s.phase}>
      <div className="field__bleed" data-fx-bleed aria-hidden="true" />

      <header className="field__bar" data-fx-bar>
        <button className="field__leave label" type="button" onClick={onExit}>
          ← exit — the session waits
        </button>

        <div className="field__tech">
          <span className="field__tech-seal" aria-hidden="true">
            {t.kanji}
          </span>
          <span className="label">{t.name}</span>
        </div>

        <div
          className="field__cycles"
          role="group"
          aria-label={`cycle ${Math.min(s.cycle, t.cycles)} of ${t.cycles}`}
        >
          {Array.from({ length: t.cycles }).map((_, i) => (
            <i
              key={i}
              data-done={i < s.cyclesDone || undefined}
              data-now={i === s.cyclesDone && !over || undefined}
            />
          ))}
        </div>

        <div className="field__phase">
          <span className="field__pip" data-over={over || undefined} aria-hidden="true" />
          <span className="label">{PHASE_LABEL[s.phase]}</span>
        </div>

        <button
          className="field__bell label"
          type="button"
          data-on={alerts || undefined}
          onClick={() => void toggleAlerts()}
          title="phase alerts — one notification per phase change"
        >
          {alerts ? "alerts on" : "alerts off"}
        </button>
      </header>

      <div className="sess shell">
        <div className="sess__main">
          <div data-fx-ring>
            <SessionRing
              ms={sess.phaseMs}
              limit={sess.phaseLimitMs}
              fraction={sess.fraction}
              phase={s.phase}
              running={s.running}
              urgent={urgent}
              kanji={PHASE_KANJI[s.phase]}
            />
          </div>

          <p className="sess__vow">{t.line}</p>

          <div className="sess__ctl">
            {!over && (
              <button
                className="btn btn--primary"
                type="button"
                data-fx-ctl
                onClick={() => (s.running ? sess.pause() : sess.hold())}
              >
                <span className="btn__slash" />
                {s.running ? "Pause" : "Hold"}
                <span className="sess__key label">space</span>
              </button>
            )}
            {!over && (
              <button className="btn" type="button" data-fx-ctl onClick={() => sess.skip()}>
                <span className="btn__slash" />
                {s.phase === "focus" ? "Settle focus" : "Skip rest"}
                <span className="sess__key label">s</span>
              </button>
            )}
            <button
              className="btn btn--ghost"
              type="button"
              data-fx-ctl
              onClick={() => sess.end()}
              disabled={over}
            >
              sheathe session
            </button>
          </div>
        </div>

        <aside className="sess__rail" data-fx-rail>
          <div className="target">
            <div className="target__head">
              <span className="label">current target</span>
              {linked && (
                <button className="target__seal-btn" type="button" onClick={() => sealTask(linked)}>
                  seal ✓
                </button>
              )}
            </div>

            {linked && <p className="target__linked">{linked.title}</p>}

            <div className="target__list" role="group" aria-label="today's open goals">
              {open.length === 0 && (
                <p className="target__empty">The ledger is clear for today. Add one below, or just sit.</p>
              )}
              {open.slice(0, 6).map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className="target__row"
                  data-sel={linked?.id === task.id || undefined}
                  onClick={() => sess.linkTask(linked?.id === task.id ? null : task.id)}
                >
                  <span className="target__dot" aria-hidden="true" />
                  <span className="target__title">{task.title}</span>
                  <span className="target__prog num">+{task.progress}</span>
                </button>
              ))}
            </div>

            <label className="entry target__add" htmlFor="quick">
              <input
                id="quick"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") quickAdd();
                }}
                placeholder="add a goal for today…"
                maxLength={90}
              />
              <button type="button" className="target__add-go" onClick={quickAdd} disabled={!quick.trim()}>
                add
              </button>
            </label>
          </div>

          <SessionLog log={s.log} />

          <div className="sess__foot">
            <span className="label num">
              {mmss(s.focusMs)} focus · {mmss(s.restMs)} rest · {sealed} sealed
            </span>
            <button className="field__forfeit label" type="button" onClick={() => sess.end()} disabled={over}>
              end session
            </button>
          </div>
        </aside>
      </div>

      {over && (
        <div className="summ" role="dialog" aria-label="session summary">
          <div className="summ__card">
            <span className="summ__seal" aria-hidden="true">
              完
            </span>
            <h2 className="summ__title">The seat is swept.</h2>
            <p className="summ__sub num">
              {t.name} · {s.cyclesDone}/{t.cycles} cycles · {mmss(s.focusMs)} focus · {mmss(s.restMs)} rest ·{" "}
              {sealed} task{sealed === 1 ? "" : "s"} sealed
            </p>
            <div className="summ__actions">
              <button className="btn btn--primary" type="button" onClick={() => sess.reset()}>
                <span className="btn__slash" />
                New Session
              </button>
              <button className="btn" type="button" onClick={onExit}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The room's log — pre-written sentences, newest at the bottom, each line
 * arriving with the same brush curve the rest of the site moves on.
 */
function SessionLog({ log }: { log: { id: string; at: number; kind: string; text: string }[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const seenRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log.length]);

  useEffect(() => {
    const list = listRef.current;
    if (REDUCED || !list) return;
    const last = log[log.length - 1]?.id ?? null;
    if (last === seenRef.current) return;
    const prevIdx = seenRef.current ? log.findIndex((l) => l.id === seenRef.current) : -1;
    seenRef.current = last;
    const fresh = log.length - (prevIdx + 1);
    if (fresh <= 0) return;
    const nodes = Array.from(list.children as HTMLCollectionOf<HTMLLIElement>).slice(-fresh);
    gsap.fromTo(
      nodes,
      { yPercent: 90, autoAlpha: 0 },
      { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: "brush", stagger: 0.05, clearProps: "all" },
    );
  }, [log]);

  return (
    <div className="slog">
      <div className="slog__head">
        <span className="label">session log</span>
        <span className="slog__count num">{String(log.length).padStart(3, "0")}</span>
      </div>
      <ul className="slog__list" ref={listRef}>
        {log.map((l) => (
          <li className="slog__row" data-kind={l.kind} key={l.id}>
            <span className="slog__at num">{hhmm(l.at)}</span>
            <span className="slog__text">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
