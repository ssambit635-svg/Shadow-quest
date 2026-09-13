/**
 * useLedger.ts — one copy of the operator's ledger for the whole phone face.
 *
 * The desktop dashboard owns its tasks and profile locally. The phone face
 * has five destinations that all read the same numbers, so the state is
 * lifted here and passed down: seal a task on the Tasks tab and the Home
 * bars, the character sheet and the Rewards total move in the same commit,
 * with no second source of truth to drift.
 *
 * It is the same engine the desktop uses — `loadTasks` / `saveTasks` /
 * `loadProfile` / `saveProfile` / `completeTask` from lib/todo, same storage
 * keys, same scope. Nothing is re-implemented and nothing is added to it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  completedTasks,
  completeTask,
  loadProfile,
  loadTasks,
  makeId,
  overdueTasks,
  saveProfile,
  saveTasks,
  sortTasks,
  tasksForToday,
  upcomingTasks,
  type CompleteEvent,
  type Profile,
  type Task,
} from "../lib/todo";

export interface Ledger {
  tasks: Task[];
  profile: Profile;
  today: Task[];
  upcoming: Task[];
  overdue: Task[];
  done: Task[];
  todayOpen: Task[];
  todayDoneCount: number;
  todayPct: number;
  add: (t: Omit<Task, "id" | "createdAt" | "status">) => Task;
  complete: (task: Task) => CompleteEvent[];
  reopen: (task: Task) => void;
  remove: (id: string) => void;
  reload: () => void;
}

export function useLedger(scope: string): Ledger {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(scope));
  const [profile, setProfile] = useState<Profile>(() => loadProfile(scope));

  // A different operator signs in: drop to their ledger, not the last one.
  useEffect(() => {
    setTasks(loadTasks(scope));
    setProfile(loadProfile(scope));
  }, [scope]);

  useEffect(() => saveTasks(scope, tasks), [scope, tasks]);
  useEffect(() => saveProfile(scope, profile), [scope, profile]);

  const today = useMemo(() => tasksForToday(tasks), [tasks]);
  const upcoming = useMemo(() => upcomingTasks(tasks), [tasks]);
  const overdue = useMemo(() => overdueTasks(tasks), [tasks]);
  const done = useMemo(() => completedTasks(tasks), [tasks]);
  const todayOpen = useMemo(
    () => sortTasks(today.filter((t) => t.status !== "completed")),
    [today],
  );

  const add = useCallback((t: Omit<Task, "id" | "createdAt" | "status">) => {
    const task: Task = { ...t, id: makeId(), createdAt: Date.now(), status: "pending" };
    setTasks((prev) => [...prev, task]);
    return task;
  }, []);

  const complete = useCallback(
    (task: Task): CompleteEvent[] => {
      if (task.status === "completed") return [];
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "completed", completedAt: Date.now() } : t,
        ),
      );
      const { profile: next, events } = completeTask(profile, task);
      setProfile(next);
      return events;
    },
    [profile],
  );

  /**
   * Undoing a completion puts the task back but does not claw the points
   * back out of the profile — the ledger records work that happened. It is
   * offered for a mis-tap, not as a way to re-earn.
   */
  const reopen = useCallback((task: Task) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: "pending", completedAt: undefined } : t,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const reload = useCallback(() => {
    setTasks(loadTasks(scope));
    setProfile(loadProfile(scope));
  }, [scope]);

  const todayDoneCount = today.filter((t) => t.status === "completed").length;

  return {
    tasks,
    profile,
    today,
    upcoming,
    overdue,
    done,
    todayOpen,
    todayDoneCount,
    todayPct: today.length ? Math.round((todayDoneCount / today.length) * 100) : 0,
    add,
    complete,
    reopen,
    remove,
    reload,
  };
}
