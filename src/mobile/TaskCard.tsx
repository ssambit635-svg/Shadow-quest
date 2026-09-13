/**
 * TaskCard.tsx — one task, the way the phone face shows it.
 *
 * Still a real to-do row: the title leads, the completion target is 44px and
 * sits inside thumb reach, and the metadata (priority, difficulty, daily,
 * due, factors, payout) is all still here — folded into two quiet lines
 * rather than a wall of flags.
 *
 * It owns no state. Completing, reopening and removing are handed in, so the
 * same card serves the Home snapshot and the full Tasks ledger.
 */
import { useRef } from "react";
import { gsap, REDUCED } from "../lib/motion";
import {
  DIFFICULTY_META,
  LIFE_FACTOR_META,
  PRIORITY_META,
  todayISO,
  type Task,
} from "../lib/todo";

export function TaskCard({
  task,
  onComplete,
  onReopen,
  onRemove,
  /** Home shows a tighter row: no description, no remove. */
  compact = false,
}: {
  task: Task;
  onComplete: () => void;
  onReopen?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const done = task.status === "completed";
  const overdue = task.status === "overdue";
  const pm = PRIORITY_META[task.priority];
  const dm = DIFFICULTY_META[task.difficulty];
  const dueToday = task.dueDate === todayISO();

  const toggle = () => {
    if (!done && !REDUCED && ref.current) {
      // A single quiet confirmation: the row breathes once. The point is the
      // reward line that follows, not this.
      gsap
        .timeline()
        .to(ref.current, { scale: 0.985, duration: 0.1, ease: "power2.out" })
        .to(ref.current, { scale: 1, duration: 0.34, ease: "power2.out" });
    }
    if (done) onReopen?.();
    else onComplete();
  };

  return (
    <article
      ref={ref}
      className={`m-task ${done ? "is-done" : ""} ${overdue ? "is-overdue" : ""}`}
      data-task-id={task.id}
    >
      <button
        type="button"
        className={`m-task__check ${done ? "is-on" : ""}`}
        onClick={toggle}
        aria-pressed={done}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path
            d="M3 8.4l3.2 3.2L13 4.8"
            stroke="currentColor"
            strokeWidth="1.9"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="m-task__body">
        <h4 className={`m-task__title ${done ? "is-struck" : ""}`}>{task.title}</h4>

        {!compact && task.description ? (
          <p className="m-task__desc">{task.description}</p>
        ) : null}

        <div className="m-task__flags">
          <span className="m-flag" data-priority={task.priority} style={{ color: pm.color }}>
            {pm.label}
          </span>
          {!compact && <span className="m-flag is-dim">{dm.label}</span>}
          {task.daily && <span className="m-flag is-daily">Daily</span>}
          {overdue && <span className="m-flag is-late">Overdue</span>}
          {!overdue && task.dueDate && !task.daily && (
            <span className={`m-flag is-dim ${dueToday ? "is-today" : ""}`}>
              {dueToday ? "Today" : task.dueDate.slice(5)}
            </span>
          )}
        </div>

        <div className="m-task__foot">
          <div className="m-task__factors">
            {task.factors.map((g) => (
              <span
                key={g.factor}
                className="m-fchip"
                title={`${LIFE_FACTOR_META[g.factor].label} +${g.amount}`}
              >
                {LIFE_FACTOR_META[g.factor].code}
                <b className="num">+{g.amount}</b>
              </span>
            ))}
          </div>
          <div className="m-task__pay">
            <span className="num">+{task.progress}</span>
            <span className="m-task__pay-sep" aria-hidden="true">
              /
            </span>
            <span className="num is-gold">+{task.rewardPoints} RP</span>
            {onRemove && !compact ? (
              <button type="button" className="m-task__del" onClick={onRemove} aria-label={`Delete ${task.title}`}>
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
