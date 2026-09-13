/**
 * habits.ts — the daily ritual.
 *
 * A habit is one thing you do every day: sealed or not, per date. No XP, no
 * reward points — the ledger stays honest about *work*, and habits stay
 * honest about *showing up*. The only currency here is the streak.
 *
 * Reminders: each habit carries a time of day. While the app is open (any
 * tab, any route) a light scheduler checks the clock and, if the browser
 * allows it, raises a system notification for habits still open past their
 * time — once per habit per day. Without permission the same nudge shows
 * inside the panel instead.
 */
import { todayISO } from "./todo";

export interface Habit {
  id: string;
  title: string;
  /** Kanji worn as the seal; assigned from the palette on creation. */
  mark: string;
  /** Reminder time of day, "HH:MM" (local). */
  time: string;
  /** Whether the daily reminder is armed for this habit. */
  remind: boolean;
  createdAt: number;
  /** Dates (YYYY-MM-DD) the habit was sealed. Append-only. */
  history: string[];
}

const MARKS = ["節", "習", "鍛", "読", "瞑", "走", "筆", "静"];

const key = (scope: string) => `sq.habits.${scope}`;
const remindKey = (scope: string) => `sq.habits.remind.${scope}`;
const notifiedKey = (scope: string, date: string) => `sq.habits.notified.${scope}.${date}`;

/**
 * Repair an arbitrary habit array — the same list can arrive from storage
 * or from the backend, so both pass through one validator.
 */
export function sanitizeHabits(raw: unknown): Habit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === "object")
    .map((h) => ({
      id: String(h.id ?? "").slice(0, 64),
      title: String(h.title ?? "").slice(0, 120),
      mark: String(h.mark ?? "節").slice(0, 4) || "節",
      time: normalizeTime(String(h.time ?? "20:00")),
      remind: h.remind === true,
      createdAt: typeof h.createdAt === "number" ? h.createdAt : Date.now(),
      history: Array.isArray(h.history)
        ? h.history
            .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
            .slice(-800)
        : [],
    }))
    .filter((h) => h.id && h.title);
}

export function loadHabits(scope: string): Habit[] {
  try {
    const raw = localStorage.getItem(key(scope));
    if (!raw) return [];
    return sanitizeHabits(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveHabits(scope: string, habits: Habit[]): void {
  localStorage.setItem(key(scope), JSON.stringify(habits));
  // Anything derived from habits (the streak board) re-reads on this beat.
  try {
    window.dispatchEvent(new CustomEvent("sq:habits"));
  } catch {
    /* derived views simply wait for the next mount */
  }
}

export function makeHabitId(): string {
  return `h_${Math.random().toString(36).slice(2, 10)}`;
}

export function addHabit(scope: string, habits: Habit[], title: string, time: string): Habit[] {
  const clean = title.trim();
  if (!clean) return habits;
  const habit: Habit = {
    id: makeHabitId(),
    title: clean,
    mark: MARKS[habits.length % MARKS.length],
    time: normalizeTime(time),
    remind: remindersArmed(scope),
    createdAt: Date.now(),
    history: [],
  };
  const next = [...habits, habit];
  saveHabits(scope, next);
  return next;
}

export function removeHabit(scope: string, habits: Habit[], id: string): Habit[] {
  const next = habits.filter((h) => h.id !== id);
  saveHabits(scope, next);
  return next;
}

export function patchHabit(scope: string, habits: Habit[], id: string, patch: Partial<Habit>): Habit[] {
  const next = habits.map((h) => (h.id === id ? { ...h, ...patch } : h));
  saveHabits(scope, next);
  return next;
}

/** Seal (or unseal) today. Returns the new list. */
export function toggleToday(scope: string, habits: Habit[], id: string): Habit[] {
  const date = todayISO();
  const next = habits.map((h) => {
    if (h.id !== id) return h;
    const done = h.history.includes(date);
    return {
      ...h,
      history: done ? h.history.filter((d) => d !== date) : [...h.history, date],
    };
  });
  saveHabits(scope, next);
  return next;
}

export function isDoneToday(h: Habit): boolean {
  return h.history.includes(todayISO());
}

/** Consecutive sealed days ending today (or yesterday, if today is open). */
export function streakOf(h: Habit): number {
  const done = new Set(h.history);
  const d = new Date();
  if (!done.has(iso(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (done.has(iso(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Last `n` days oldest-first, as [date, sealed] pairs for the dot row. */
export function lastDays(h: Habit, n = 7): [string, boolean][] {
  const done = new Set(h.history);
  const out: [string, boolean][] = [];
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push([iso(d), done.has(iso(d))]);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function normalizeTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return "20:00";
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Epoch ms of a habit's reminder time today. */
export function reminderAt(h: Habit): number {
  const [hh, mm] = normalizeTime(h.time).split(":").map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/* ------------------------------------------------------------------ *
 * Reminders
 * ------------------------------------------------------------------ */

export const notificationsSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

export const notificationPermission = (): NotificationPermission =>
  notificationsSupported() ? Notification.permission : "denied";

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Master arm for the whole ritual — survives per scope. */
export function remindersArmed(scope: string): boolean {
  return localStorage.getItem(remindKey(scope)) === "1";
}

export function setRemindersArmed(scope: string, on: boolean): void {
  localStorage.setItem(remindKey(scope), on ? "1" : "0");
}

function alreadyNotified(scope: string, id: string): boolean {
  try {
    const raw = localStorage.getItem(notifiedKey(scope, todayISO()));
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return list.includes(id);
  } catch {
    return false;
  }
}

function markNotified(scope: string, id: string): void {
  const k = notifiedKey(scope, todayISO());
  let list: string[] = [];
  try {
    list = JSON.parse(localStorage.getItem(k) ?? "[]") as string[];
  } catch {
    list = [];
  }
  localStorage.setItem(k, JSON.stringify([...list, id]));
}

export function fireHabitReminder(h: Habit): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(`ShadowQuest — ${h.mark} habit open`, {
      body: `“${h.title}” is still open today. Seal it and keep the streak.`,
      tag: `sq-habit-${h.id}-${todayISO()}`,
    });
  } catch {
    /* notification constructors can throw on some Androids; the in-app
       nudge in the panel covers us there. */
  }
}

/**
 * One pass of the reminder clock: every armed habit past its time and still
 * open gets exactly one system notification per day. Returns the ids it
 * fired for, so the panel can pulse them.
 */
export function runReminderPass(scope: string, habits: Habit[]): string[] {
  if (!remindersArmed(scope)) return [];
  const now = Date.now();
  const fired: string[] = [];
  for (const h of habits) {
    if (!h.remind || isDoneToday(h) || alreadyNotified(scope, h.id)) continue;
    if (now < reminderAt(h)) continue;
    markNotified(scope, h.id);
    fireHabitReminder(h);
    fired.push(h.id);
  }
  return fired;
}
