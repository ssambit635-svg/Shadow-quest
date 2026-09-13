/**
 * TasksScreen.tsx — the whole ledger, as a to-do app.
 *
 * This is the screen that has to keep working like a real task manager: the
 * five filters the desktop has, the full task row with every field on it,
 * delete, reopen, and a floating add that never scrolls away. Nothing was
 * taken out — it is the same `Task` shape, the same `sortTasks` ordering and
 * the same storage, presented at thumb scale.
 */
import { useMemo, useState } from "react";
import { sortTasks, type Task } from "../../lib/todo";
import type { Ledger } from "../useLedger";
import { Chips, Caption, Empty } from "../parts";
import { TaskCard } from "../TaskCard";

type Filter = "today" | "upcoming" | "overdue" | "completed" | "all";

export function TasksScreen({
  ledger,
  onComplete,
  onRemove,
  onReopen,
  onNew,
}: {
  ledger: Ledger;
  onComplete: (t: Task) => void;
  onRemove: (id: string) => void;
  onReopen: (t: Task) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("today");
  const { tasks, today, upcoming, overdue, done } = ledger;

  const openToday = useMemo(
    () => today.filter((t) => t.status !== "completed"),
    [today],
  );

  const list = useMemo(() => {
    switch (filter) {
      case "today":
        return sortTasks(openToday);
      case "upcoming":
        return sortTasks(upcoming);
      case "overdue":
        return sortTasks(overdue);
      case "completed":
        return sortTasks(done);
      default:
        return sortTasks(tasks);
    }
  }, [filter, openToday, upcoming, overdue, done, tasks]);

  const counts: { id: Filter; label: string }[] = [
    { id: "today", label: `Today ${openToday.length}` },
    { id: "upcoming", label: `Upcoming ${upcoming.length}` },
    { id: "overdue", label: `Overdue ${overdue.length}` },
    { id: "completed", label: `Done ${done.length}` },
    { id: "all", label: `All ${tasks.filter((t) => t.status !== "completed").length}` },
  ];

  return (
    <div className="m-screen m-tasks">
      <header className="m-head">
        <h1 className="m-head__t">Tasks</h1>
        <p className="m-head__s">
          {openToday.length
            ? `${openToday.length} open today`
            : today.length
              ? "Today is clear"
              : "Nothing scheduled today"}
        </p>
      </header>

      <div className="m-sticky">
        <Chips options={counts} value={filter} onChange={setFilter} />
      </div>

      {list.length ? (
        <div className="m-list">
          {list.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onComplete={() => onComplete(t)}
              onReopen={() => onReopen(t)}
              onRemove={() => onRemove(t.id)}
            />
          ))}
        </div>
      ) : (
        <Empty
          title={
            filter === "completed"
              ? "Nothing completed yet"
              : filter === "overdue"
                ? "Nothing overdue"
                : "No tasks here"
          }
          hint="Add one and it shows up in today's ledger."
        />
      )}

      {/* Held above the dock, not inside the scroll: it must not move. */}
      <button type="button" className="m-fab" onClick={onNew} aria-label="New goal">
        <span aria-hidden="true">+</span>
      </button>

      <Caption>
        {done.length} sealed all time
      </Caption>
    </div>
  );
}
