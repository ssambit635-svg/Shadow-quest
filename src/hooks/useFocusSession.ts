/**
 * useFocusSession.ts — the Deep Work session engine.
 *
 * Owns one session: which technique, which phase, how much focus has actually
 * been held. The clock is wall-clock based (`phaseEndsAt`), so a backgrounded
 * tab, a locked phone or a full refresh never loses a minute — the next tick
 * simply settles whatever the wall clock says has passed, even several phases
 * at once.
 *
 * Held time is honest: settling early (skip, or sheathing mid-focus) banks
 * only the minutes that actually elapsed, never the scheduled block.
 *
 * The session persists to localStorage on every mutation, which is what lets
 * "exit" mean "the session waits for you" instead of "the session is gone".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { techniqueOf, FLOW_CAP_MIN, type Technique } from "../lib/techniques";

export type SessionPhase = "focus" | "rest" | "done";

export interface SessionLogLine {
  id: string;
  at: number;
  kind: "focus" | "rest" | "system" | "task";
  text: string;
}

export interface FocusSessionState {
  techniqueId: string;
  phase: SessionPhase;
  /** 1-based index of the focus round currently on the seat. */
  cycle: number;
  cyclesDone: number;
  running: boolean;
  /** Scheduled length of the current phase (cap, for flow focus). */
  phaseLenMs: number;
  /** Timed phases: epoch ms the phase ends at, while running. */
  phaseEndsAt: number | null;
  /** Timed phases: ms left, while paused. */
  pausedMs: number | null;
  /** Count-up focus: ms banked across previous runs of this block. */
  flowBankMs: number;
  /** Count-up focus: epoch ms the current run started, while running. */
  flowStartedAt: number | null;
  focusMs: number;
  restMs: number;
  /** Task from the ledger this session is aimed at, if any. */
  taskId: string | null;
  /** Tasks sealed from inside the room. */
  sealed: number;
  log: SessionLogLine[];
  startedAt: number;
}

export type PhaseEvent =
  | { kind: "focus-held"; heldMs: number; restMs: number; cycle: number; cycles: number }
  | { kind: "rest-over"; cycle: number; cycles: number }
  | { kind: "session-done"; cyclesDone: number; focusMs: number };

export interface FocusSessionHandle {
  s: FocusSessionState | null;
  technique: Technique;
  /** ms left in a timed phase, or ms held in a flow focus block. */
  phaseMs: number;
  /** total ms of the current phase — the ring's full arc. */
  phaseLimitMs: number;
  /** 0..1 progress through the current phase. */
  fraction: number;
  start: (techniqueId: string) => void;
  hold: () => void;
  pause: () => void;
  /** Settle the current phase early and move on. */
  skip: () => void;
  end: () => void;
  reset: () => void;
  linkTask: (id: string | null) => void;
  note: (text: string, kind?: SessionLogLine["kind"]) => void;
}

const KEY = "sq.session.v2";
const MIN = 60_000;

/**
 * How often the clock re-reads the wall. The ensō's arc is a CSS transition
 * of exactly this length (see `--sq-tick` on `.sring`), which is what makes
 * the stroke a continuous ramp instead of a series of catches: a transition
 * longer than the tick never arrives, so the ring visibly trails the numerals.
 */
export const TICK_MS = 500;
const flowCapMs = (t: Technique) => (t.capMin ?? FLOW_CAP_MIN) * MIN;

function makeId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

function load(): FocusSessionState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return toSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

const PHASES: SessionPhase[] = ["focus", "rest", "done"];
const LOG_KINDS: SessionLogLine["kind"][] = ["focus", "rest", "system", "task"];

const n = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const nullable = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Rebuild a stored session, repairing every field.
 *
 * This record is written on every mutation and read on every mount, and the
 * room renders straight off it. A half-written or hand-edited copy used to
 * reach the ensō intact — `log` as a string took the whole room down with
 * `log.filter is not a function`, and a null `phaseLenMs` put `NaN:NaN` on the
 * clock face. Anything unusable is replaced with the technique's own default
 * rather than dropped, so a damaged session resumes instead of vanishing.
 */
function toSession(raw: unknown): FocusSessionState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.techniqueId !== "string") return null;

  const t = techniqueOf(r.techniqueId);
  const phase = PHASES.includes(r.phase as SessionPhase) ? (r.phase as SessionPhase) : "focus";
  const cycles = Math.max(1, Math.round(n(r.cycle, 1)));
  // A flow block has no scheduled length, so its default is the cap.
  const defaultLen = (t.focusMin ?? t.capMin ?? FLOW_CAP_MIN) * MIN;
  const lenMs = Math.max(MIN, Math.round(n(r.phaseLenMs, defaultLen)));
  const log = Array.isArray(r.log)
    ? (r.log.slice(-200) as unknown[])
        .map((l): SessionLogLine | null => {
          if (!l || typeof l !== "object") return null;
          const e = l as Record<string, unknown>;
          return {
            id: typeof e.id === "string" ? e.id : makeId(),
            at: n(e.at, Date.now()),
            kind: LOG_KINDS.includes(e.kind as SessionLogLine["kind"])
              ? (e.kind as SessionLogLine["kind"])
              : "system",
            text: typeof e.text === "string" ? e.text.slice(0, 400) : "",
          };
        })
        .filter((l): l is SessionLogLine => l !== null)
    : [];

  // A record that claims to be running but has lost the instant its phase
  // ends cannot be settled honestly — there is no way to know how much of the
  // block actually passed. Sit the operator down at a full, paused block
  // rather than letting the clock resolve to zero and skip the phase.
  const endsAt = nullable(r.phaseEndsAt);
  const pausedMs = nullable(r.pausedMs);
  const running = r.running === true && (endsAt !== null || pausedMs !== null);

  return {
    techniqueId: t.id,
    phase,
    cycle: cycles,
    cyclesDone: Math.max(0, Math.round(n(r.cyclesDone, 0))),
    running,
    phaseLenMs: lenMs,
    phaseEndsAt: running ? endsAt : null,
    pausedMs: running ? pausedMs : pausedMs ?? lenMs,
    flowBankMs: Math.max(0, n(r.flowBankMs, 0)),
    flowStartedAt: running ? nullable(r.flowStartedAt) : null,
    focusMs: Math.max(0, n(r.focusMs, 0)),
    restMs: Math.max(0, n(r.restMs, 0)),
    taskId: typeof r.taskId === "string" ? r.taskId : null,
    sealed: Math.max(0, Math.round(n(r.sealed, 0))),
    log,
    startedAt: n(r.startedAt, Date.now()),
  };
}

function save(s: FocusSessionState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage refused: the room keeps working, it just will not wait */
  }
}

function line(kind: SessionLogLine["kind"], text: string): SessionLogLine {
  return { id: makeId(), at: Date.now(), kind, text };
}

/**
 * Format milliseconds as `MM:SS`.
 *
 * A countdown rounds *up* — so the ring reads `25:00` for the whole of the
 * first second and only reaches `00:00` at the instant the phase actually
 * ends, never half a second early. A count-up (Flowmodoro) rounds down, so it
 * starts at `00:00` and earns each second. Getting this backwards is the
 * classic "the writing doesn't match the timing" bug.
 */
export function mmss(ms: number, dir: "down" | "up" = "down"): string {
  // Non-finite input must read as zero, never "NaN:NaN" on the clock face.
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const total = dir === "up" ? Math.floor(safe / 1000) : Math.ceil(safe / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** ms left in a timed phase, running or paused. */
function timedRemaining(st: FocusSessionState, wall: number): number {
  if (st.running) return Math.max(0, (st.phaseEndsAt ?? wall) - wall);
  return st.pausedMs ?? st.phaseLenMs;
}

/** ms held in a flow (count-up) focus block, running or paused. */
function flowElapsed(st: FocusSessionState, wall: number): number {
  return st.flowBankMs + (st.running && st.flowStartedAt !== null ? wall - st.flowStartedAt : 0);
}

export function useFocusSession(onPhase?: (e: PhaseEvent) => void): FocusSessionHandle {
  const [s, setS] = useState<FocusSessionState | null>(() => load());
  const [now, setNow] = useState(() => Date.now());
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  // Persist every mutation; the tick only moves `now`, never the record.
  useEffect(() => {
    save(s);
  }, [s]);

  /* ---------------- the clock ---------------- */
  useEffect(() => {
    if (!s?.running) return;
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, [s?.running]);

  const pushLog = (st: FocusSessionState, entry: SessionLogLine): FocusSessionState => ({
    ...st,
    log: [...st.log.slice(-59), entry],
  });

  /**
   * Settle whatever the wall clock says is over — possibly several phases at
   * once after a long background stretch. `force` settles the current phase
   * early (skip / sheathe) and banks only elapsed minutes.
   */
  const settle = useCallback((st: FocusSessionState, wall: number, force = false): FocusSessionState => {
    let cur = st;
    let guard = 0;
    while (cur.running && cur.phase !== "done" && guard++ < 12) {
      const t = techniqueOf(cur.techniqueId);

      if (cur.phase === "focus") {
        const open = t.focusMin === null;
        const elapsed = open ? flowElapsed(cur, wall) : cur.phaseLenMs - timedRemaining(cur, wall);
        if (!force && (open ? elapsed < flowCapMs(t) : timedRemaining(cur, wall) > 0)) break;
        force = false; // only the first phase may be settled early
        const held = open ? Math.min(elapsed, flowCapMs(t)) : elapsed;

        const cyclesDone = cur.cyclesDone + 1;
        cur = { ...cur, focusMs: cur.focusMs + held, cyclesDone };

        if (cyclesDone >= t.cycles || t.restMin === 0) {
          cur = pushLog(
            {
              ...cur,
              phase: "done",
              running: false,
              phaseEndsAt: null,
              pausedMs: null,
              flowStartedAt: null,
            },
            line(
              "system",
              `Session complete — ${cyclesDone} cycle${cyclesDone === 1 ? "" : "s"}, ${mmss(cur.focusMs)} of focus held.`,
            ),
          );
          onPhaseRef.current?.({ kind: "session-done", cyclesDone, focusMs: cur.focusMs });
          break;
        }

        const restMs =
          t.restMin === null
            ? Math.min(20 * MIN, Math.max(5 * MIN, Math.round(held / 5 / MIN) * MIN))
            : t.restMin * MIN;
        cur = pushLog(
          {
            ...cur,
            phase: "rest",
            phaseLenMs: restMs,
            phaseEndsAt: wall + restMs,
            pausedMs: null,
            flowBankMs: 0,
            flowStartedAt: null,
          },
          line("focus", `Focus held — ${mmss(held)} on cycle ${cur.cycle}/${t.cycles}. Rest ${mmss(restMs)}.`),
        );
        onPhaseRef.current?.({ kind: "focus-held", heldMs: held, restMs, cycle: cur.cycle, cycles: t.cycles });
        continue;
      }

      // rest — always timed
      const remaining = timedRemaining(cur, wall);
      if (!force && remaining > 0) break;
      force = false; // only the first phase may be settled early
      const rested = cur.phaseLenMs - remaining;
      const nextCycle = cur.cyclesDone + 1;
      const open = t.focusMin === null;
      const focusLen = open ? flowCapMs(t) : (t.focusMin as number) * MIN;
      cur = pushLog(
        {
          ...cur,
          phase: "focus",
          cycle: nextCycle,
          phaseLenMs: focusLen,
          phaseEndsAt: open ? null : wall + focusLen,
          pausedMs: open ? null : focusLen,
          flowBankMs: 0,
          flowStartedAt: open ? wall : null,
          restMs: cur.restMs + rested,
          running: true,
        },
        line("rest", `Rest over — ${mmss(rested)} stood down. Cycle ${nextCycle} begins.`),
      );
      onPhaseRef.current?.({ kind: "rest-over", cycle: nextCycle, cycles: t.cycles });
    }
    return cur;
  }, []);

  // One watcher: whenever the wall clock moves, settle overdue phases.
  useEffect(() => {
    if (!s?.running || s.phase === "done") return;
    const t = techniqueOf(s.techniqueId);
    const overdue =
      s.phase === "focus" && t.focusMin === null
        ? flowElapsed(s, now) >= flowCapMs(t)
        : timedRemaining(s, now) <= 0;
    if (!overdue) return;
    setS((prev) => (prev ? settle(prev, now) : prev));
  }, [now, s, settle]);

  /* ---------------- verbs ---------------- */

  const start = useCallback((techniqueId: string) => {
    const t = techniqueOf(techniqueId);
    const open = t.focusMin === null;
    const focusLen = open ? flowCapMs(t) : (t.focusMin as number) * MIN;
    const fresh: FocusSessionState = {
      techniqueId,
      phase: "focus",
      cycle: 1,
      cyclesDone: 0,
      running: false,
      phaseLenMs: focusLen,
      phaseEndsAt: null,
      pausedMs: open ? null : focusLen,
      flowBankMs: 0,
      flowStartedAt: null,
      focusMs: 0,
      restMs: 0,
      taskId: null,
      sealed: 0,
      log: [
        line(
          "system",
          `Session opened — ${t.name} · ${t.cycles} cycle${t.cycles === 1 ? "" : "s"}. Press hold when you are seated.`,
        ),
      ],
      startedAt: Date.now(),
    };
    setS(fresh);
  }, []);

  const hold = useCallback(() => {
    const wall = Date.now();
    setS((prev) => {
      if (!prev || prev.running || prev.phase === "done") return prev;
      const t = techniqueOf(prev.techniqueId);
      const open = t.focusMin === null && prev.phase === "focus";
      if (open) {
        return pushLog(
          { ...prev, running: true, flowStartedAt: wall },
          line("system", "Clock running — enter the current. Stop when the current stops."),
        );
      }
      const left = prev.pausedMs ?? prev.phaseLenMs;
      return pushLog(
        { ...prev, running: true, pausedMs: null, phaseEndsAt: wall + left },
        line(
          "system",
          prev.phase === "focus" ? "Focus begins — one task, one breath." : "Rest begins — stand up, look far away.",
        ),
      );
    });
  }, []);

  const pause = useCallback(() => {
    const wall = Date.now();
    setS((prev) => {
      if (!prev || !prev.running) return prev;
      const t = techniqueOf(prev.techniqueId);
      if (t.focusMin === null && prev.phase === "focus") {
        const bank = flowElapsed(prev, wall);
        return pushLog(
          { ...prev, running: false, flowBankMs: bank, flowStartedAt: null },
          line("system", `Held at ${mmss(bank)} — the current waits.`),
        );
      }
      const left = timedRemaining(prev, wall);
      return pushLog(
        { ...prev, running: false, phaseEndsAt: null, pausedMs: left },
        line("system", `Paused at ${mmss(left)} left — the seat keeps its shape.`),
      );
    });
  }, []);

  const skip = useCallback(() => {
    const wall = Date.now();
    setS((prev) => {
      if (!prev || prev.phase === "done") return prev;
      const wasPaused = !prev.running;
      // Rebuild a *running* state whose clocks say exactly what had already
      // elapsed, so settling early banks honest minutes — including from a
      // pause, where the leftover lives in `pausedMs`.
      const running: FocusSessionState = {
        ...prev,
        running: true,
        phaseEndsAt:
          prev.phaseEndsAt ?? (prev.pausedMs !== null ? wall + prev.pausedMs : wall),
        pausedMs: null,
        flowStartedAt:
          prev.flowStartedAt ??
          (techniqueOf(prev.techniqueId).focusMin === null && prev.phase === "focus" ? wall : null),
      };
      let next = settle(running, wall, true);
      // A skip from a pause hands over a paused next phase, not a running one.
      if (wasPaused && next.phase !== "done") {
        const openNext = techniqueOf(next.techniqueId).focusMin === null && next.phase === "focus";
        next = openNext
          ? { ...next, running: false, flowStartedAt: null }
          : { ...next, running: false, phaseEndsAt: null, pausedMs: next.phaseLenMs };
      }
      return next;
    });
  }, [settle]);

  const end = useCallback(() => {
    const wall = Date.now();
    setS((prev) => {
      if (!prev || prev.phase === "done") return prev;
      const t = techniqueOf(prev.techniqueId);
      let focusMs = prev.focusMs;
      let restMs = prev.restMs;
      if (prev.phase === "focus") {
        focusMs += t.focusMin === null ? flowElapsed(prev, wall) : prev.phaseLenMs - timedRemaining(prev, wall);
      } else {
        restMs += prev.phaseLenMs - timedRemaining(prev, wall);
      }
      const next: FocusSessionState = {
        ...prev,
        phase: "done",
        running: false,
        phaseEndsAt: null,
        pausedMs: null,
        flowStartedAt: null,
        focusMs,
        restMs,
      };
      onPhaseRef.current?.({ kind: "session-done", cyclesDone: next.cyclesDone, focusMs });
      return pushLog(
        next,
        line(
          "system",
          `Session sheathed — ${next.cyclesDone} cycle${next.cyclesDone === 1 ? "" : "s"} held, ${mmss(focusMs)} of focus.`,
        ),
      );
    });
  }, []);

  const reset = useCallback(() => setS(null), []);

  const linkTask = useCallback((id: string | null) => {
    setS((prev) => (prev ? { ...prev, taskId: id } : prev));
  }, []);

  const note = useCallback((text: string, kind: SessionLogLine["kind"] = "task") => {
    setS((prev) => (prev ? pushLog(prev, line(kind, text)) : prev));
  }, []);

  /* ---------------- derived readouts ---------------- */

  const t = techniqueOf(s?.techniqueId);
  let phaseMs = 0; // what the big numerals read
  let phaseLimitMs = 1;
  let fraction = 1; // ink laid so far this phase
  if (s) {
    if (s.phase === "done") {
      phaseMs = 0;
      phaseLimitMs = 1;
      fraction = 1;
    } else if (s.phase === "focus" && t.focusMin === null) {
      phaseMs = flowElapsed(s, now);
      phaseLimitMs = flowCapMs(t);
      fraction = phaseMs / phaseLimitMs;
    } else {
      const remaining = timedRemaining(s, now);
      phaseMs = remaining; // both timed focus and rest count *down*
      phaseLimitMs = s.phaseLenMs;
      // focus fills the ensō; rest drains it
      fraction = s.phase === "focus" ? (s.phaseLenMs - remaining) / s.phaseLenMs : remaining / s.phaseLenMs;
    }
  }
  fraction = Math.max(0, Math.min(1, fraction));

  return {
    s,
    technique: t,
    phaseMs,
    phaseLimitMs,
    fraction,
    start,
    hold,
    pause,
    skip,
    end,
    reset,
    linkTask,
    note,
  };
}
