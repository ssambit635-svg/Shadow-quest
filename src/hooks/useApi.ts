/**
 * hooks.ts — thin React bindings over the transport. No component calls
 * fetch/EventSource directly, so swapping transports never touches the view.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { MoveIntent, QuestState, Session } from "../api/types";

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** One-shot loader with retry. `load` must be stable (module-level or memoised). */
export function useResource<T>(load: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    load().then(
      (d) => {
        if (!alive.current) return;
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive.current) return;
        setError(e instanceof Error ? e.message : "unknown failure");
        setLoading(false);
      },
    );
    return () => {
      alive.current = false;
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Session handle for the nav chip. Cached across mounts on purpose. */
let sessionPromise: Promise<Session> | null = null;

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    sessionPromise ??= api.createSession();
    let alive = true;
    sessionPromise.then((s) => alive && setSession(s));
    return () => {
      alive = false;
    };
  }, []);
  return session;
}

export interface QuestHandle {
  state: QuestState | null;
  error: string | null;
  /** Local player's seat, from the first snapshot. */
  seat: QuestState["combatants"][number]["seat"] | null;
  /** True between commit and the state that confirms it — the HUD locks input
   *  and plays the lunge, so the resolve never feels like a page refresh. */
  pending: boolean;
  begin: (shadowId: string) => Promise<void>;
  join: (code: string, shadowId: string) => Promise<void>;
  move: (move: MoveIntent) => Promise<void>;
  forfeit: () => Promise<void>;
  reset: () => void;
}

/**
 * Owns one duel: subscribe to live state, submit moves, and expose `pending`
 * so the UI can hold its breath for exactly as long as the server takes.
 */
export function useQuest(): QuestHandle {
  const [state, setState] = useState<QuestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idRef = useRef<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const settledRef = useRef<number | null>(null);

  const attach = useCallback((id: string) => {
    unsubRef.current?.();
    idRef.current = id;
    unsubRef.current = api.subscribeQuest(id, (s) => {
      setState(s);
      // A move is "confirmed" when the round advances or the phase ends.
      if (settledRef.current !== null && (s.round !== settledRef.current || s.phase !== "stance")) {
        setPending(false);
        settledRef.current = null;
      }
    });
  }, []);

  useEffect(() => () => unsubRef.current?.(), []);

  const begin = useCallback(
    async (shadowId: string) => {
      setError(null);
      try {
        const q = await api.createQuest(shadowId);
        attach(q.id);
        setState(q);
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not open the field");
      }
    },
    [attach],
  );

  const join = useCallback(
    async (code: string, shadowId: string) => {
      setError(null);
      try {
        const q = await api.joinQuest(code, shadowId);
        attach(q.id);
        setState(q);
      } catch (e) {
        setError(e instanceof Error ? e.message : "no such code on the field");
      }
    },
    [attach],
  );

  const move = useCallback(async (intent: MoveIntent) => {
    if (!idRef.current) return;
    const before = state?.round ?? 0;
    setPending(true);
    settledRef.current = before;
    try {
      const next = await api.submitMove(idRef.current, intent);
      setState(next);
    } catch (e) {
      setPending(false);
      settledRef.current = null;
      setError(e instanceof Error ? e.message : "the move was refused");
    }
    // Safety net: never let a lost response wedge input forever.
    window.setTimeout(() => setPending(false), 4000);
  }, [state?.round]);

  const forfeit = useCallback(async () => {
    if (!idRef.current) return;
    try {
      setState(await api.forfeit(idRef.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not sheathe");
    }
  }, []);

  const reset = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    idRef.current = null;
    settledRef.current = null;
    setPending(false);
    setState(null);
  }, []);

  return {
    state,
    error,
    seat: state?.combatants.find((c) => c.active)?.seat ?? null,
    pending,
    begin,
    join,
    move,
    forfeit,
    reset,
  };
}

/** Reactive reduced-motion flag, for components that must skip a loop. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
