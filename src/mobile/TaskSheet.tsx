/**
 * TaskSheet.tsx — creating a goal on a phone.
 *
 * The desktop form is a two-column grid with every field visible at once.
 * On a phone that is a wall. Here the fields that matter are one column,
 * the Life Factors are a tap-to-step grid, and Progress / Reward Points are
 * *derived live* from difficulty and factors rather than typed — which is
 * the same arithmetic the desktop form runs, just shown instead of asked.
 */
import { useMemo, useState } from "react";
import {
  DIFFICULTY_META,
  LIFE_FACTOR_META,
  PRIORITY_META,
  todayISO,
  type LifeFactor,
  type Task,
  type TaskDifficulty,
  type TaskPriority,
} from "../lib/todo";
import { Chips, Sheet } from "./parts";

export function TaskSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (t: Omit<Task, "id" | "createdAt" | "status">) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [difficulty, setDifficulty] = useState<TaskDifficulty>("normal");
  const [dueDate, setDueDate] = useState(todayISO());
  const [daily, setDaily] = useState(false);
  const [sel, setSel] = useState<Record<LifeFactor, number>>({
    knowledge: 0,
    focus: 0,
    discipline: 0,
    strength: 0,
    energy: 0,
    wellness: 0,
    skills: 0,
  });

  const factorSum = useMemo(
    () => Object.values(sel).reduce((a, b) => a + b, 0),
    [sel],
  );

  // Same derivation the desktop form uses, kept identical on purpose.
  const progress = Math.round(40 + factorSum * 15);
  const rewardPoints = Math.round(10 + factorSum * 4);

  const step = (f: LifeFactor) =>
    setSel((prev) => {
      const cur = prev[f];
      return { ...prev, [f]: cur >= 4 ? 0 : cur === 0 ? 2 : cur + 1 };
    });

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDifficulty("normal");
    setDueDate(todayISO());
    setDaily(false);
    setSel({
      knowledge: 0,
      focus: 0,
      discipline: 0,
      strength: 0,
      energy: 0,
      wellness: 0,
      skills: 0,
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    onAdd({
      title: clean,
      description: description.trim() || undefined,
      priority,
      difficulty,
      dueDate: daily ? undefined : dueDate || undefined,
      daily,
      factors: (Object.keys(sel) as LifeFactor[])
        .filter((f) => sel[f] > 0)
        .map((f) => ({ factor: f, amount: sel[f] })),
      progress,
      rewardPoints,
      category: "General",
    });
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="New goal">
      <form className="m-form" onSubmit={submit}>
        <label className="m-field">
          <span className="m-field__l">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing"
            maxLength={80}
            autoFocus
          />
        </label>

        <label className="m-field">
          <span className="m-field__l">Note</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            maxLength={160}
          />
        </label>

        <div className="m-field">
          <span className="m-field__l">Priority</span>
          <Chips
            value={priority}
            onChange={setPriority}
            options={(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => ({
              id: p,
              label: PRIORITY_META[p].label,
            }))}
          />
        </div>

        <div className="m-field">
          <span className="m-field__l">Effort</span>
          <Chips
            value={difficulty}
            onChange={setDifficulty}
            options={(Object.keys(DIFFICULTY_META) as TaskDifficulty[]).map((d) => ({
              id: d,
              label: DIFFICULTY_META[d].label,
            }))}
          />
        </div>

        <label className="m-toggle">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          <span className="m-toggle__box" aria-hidden="true" />
          <span className="m-toggle__t">Repeats daily</span>
        </label>

        {!daily && (
          <label className="m-field">
            <span className="m-field__l">Due</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        )}

        <div className="m-field">
          <span className="m-field__l">Life Factors improved</span>
          <div className="m-pick">
            {(Object.keys(LIFE_FACTOR_META) as LifeFactor[]).map((f) => {
              const v = sel[f];
              return (
                <button
                  key={f}
                  type="button"
                  className={`m-pick__b ${v ? "is-on" : ""}`}
                  onClick={() => step(f)}
                  aria-pressed={v > 0}
                >
                  <span className="m-pick__c num">{LIFE_FACTOR_META[f].code}</span>
                  <span className="m-pick__n">{LIFE_FACTOR_META[f].label}</span>
                  {v ? <span className="m-pick__v num">+{v}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="m-payout" aria-live="polite">
          <span>
            Progress <b className="num">+{progress}</b>
          </span>
          <span>
            Reward <b className="num is-gold">+{rewardPoints} RP</b>
          </span>
        </div>

        <button type="submit" className="m-btn m-btn--go" disabled={!title.trim()}>
          Add goal
        </button>
      </form>
    </Sheet>
  );
}
