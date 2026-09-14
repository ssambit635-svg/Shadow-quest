/**
 * useGoogleAuth.ts — one Google sign-in state machine, shared by both gates.
 *
 * The desktop Login screen and the phone MobileLogin screen are separate
 * components with separate designs, but the flow behind the button is
 * identical, so it lives here once:
 *
 *   · the button is always drawn — website and APK, laptop and phone
 *   · on click, confirm the backend actually has Google OAuth live, then
 *     hand the page to Google's own consent screen
 *   · on the way back, redeem the one-time code and report the outcome
 *
 * Nothing here decides who anybody is — it only reflects what the backend
 * verified. There is no account chooser and no hardcoded identity. Every
 * failure path ends in a sentence the operator can read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeGoogleSignIn,
  googleErrorMessage,
  googleFailureReason,
  probeFailureReason,
  readGoogleReturn,
  startGoogleSignIn,
  welcomeFor,
} from "../lib/googleAuth";
import { API_BASE, fetchAuthProviders } from "../api/ledger";

export type GooglePhase = "idle" | "redirecting" | "finishing";

export interface GoogleAuth {
  /**
   * Always true: the gate draws Continue with Google on every surface.
   * Configuration is checked at click time, not at paint time — hiding the
   * button on the website while showing it in the APK was the old bug.
   */
  available: boolean;
  phase: GooglePhase;
  /** Non-null while the flow is in progress — render it as a loading line. */
  busyLabel: string | null;
  /** A user-facing failure, or null. */
  error: string | null;
  /** A user-facing success line ("New ledger opened…"), or null. */
  notice: string | null;
  begin: () => void;
  dismissError: () => void;
}

type Providers = {
  password: boolean;
  google: boolean;
  reachable: boolean;
  status?: number;
};

/**
 * @param onDone called after a successful sign-in, once the identity is
 *               written — the gate uses it to navigate to the ledger.
 */
export function useGoogleAuth(onDone: () => void): GoogleAuth {
  const [phase, setPhase] = useState<GooglePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const providersRef = useRef<Providers | null>(null);

  // Warm the providers probe so a click does not wait on a round trip.
  useEffect(() => {
    let alive = true;
    void fetchAuthProviders().then((p) => {
      if (alive) providersRef.current = p;
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * The return leg. Runs exactly once per page load, before anything else
   * can read the URL, because `readGoogleReturn` erases the parameters as it
   * reads them.
   */
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const back = readGoogleReturn();
    if (back.status === "none") return;
    if (back.status === "cancelled") {
      setError("Google sign-in was cancelled.");
      return;
    }
    if (back.status === "error") {
      setError(googleErrorMessage(back.reason));
      return;
    }
    setPhase("finishing");
    void completeGoogleSignIn(back.code)
      .then(({ mode }) => {
        setNotice(welcomeFor(mode));
        // A beat so the line is readable before the gate wipes away.
        window.setTimeout(() => doneRef.current(), 420);
      })
      .catch((err: unknown) => {
        setPhase("idle");
        const reason = googleFailureReason(err);
        // The operator gets a sentence; the console gets the reason, so a
        // support thread can tell 401 from 503 without reproducing anything.
        console.warn(`[google] exchange failed: ${reason}`, err);
        setError(googleErrorMessage(reason));
      });
  }, []);

  const begin = useCallback(() => {
    setError(null);
    setNotice(null);
    setPhase("redirecting");

    const go = (p: Providers) => {
      if (!p.reachable) {
        const reason = probeFailureReason(p.status);
        setPhase("idle");
        console.warn(`[google] API probe failed: ${reason}`, {
          status: p.status,
          apiBase: API_BASE,
        });
        setError(googleErrorMessage(reason));
        return;
      }
      if (!p.google) {
        setPhase("idle");
        setError(googleErrorMessage("unconfigured"));
        return;
      }
      // A full-page navigation: if it is somehow blocked, drop the spinner
      // rather than leaving the gate stuck reading "Signing in with Google…".
      try {
        startGoogleSignIn();
      } catch (err) {
        const reason = googleFailureReason(err);
        setPhase("idle");
        console.warn(`[google] could not start: ${reason}`, err);
        setError(googleErrorMessage(reason));
        return;
      }
      window.setTimeout(() => {
        setPhase((cur) => (cur === "redirecting" ? "idle" : cur));
      }, 8000);
    };

    if (providersRef.current) {
      go(providersRef.current);
      return;
    }
    void fetchAuthProviders()
      .then((p) => {
        providersRef.current = p;
        go(p);
      })
      .catch((err: unknown) => {
        const reason = googleFailureReason(err);
        setPhase("idle");
        console.warn(`[google] providers probe threw: ${reason}`, err);
        setError(googleErrorMessage(reason));
      });
  }, []);

  const busyLabel =
    phase === "redirecting"
      ? "Signing in with Google…"
      : phase === "finishing"
        ? "Verifying your Google account…"
        : null;

  return {
    available: true,
    phase,
    busyLabel,
    error,
    notice,
    begin,
    dismissError: useCallback(() => setError(null), []),
  };
}
