/**
 * hooks.ts — thin React bindings over the transport. No component calls
 * fetch/EventSource directly, so swapping transports never touches the view.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Session } from "../api/types";

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
