/**
 * useGoogleAuth.ts — one Google sign-in state machine, shared by both gates.
 *
 * The desktop Login screen and the phone MobileLogin screen are separate
 * components with separate designs, but the flow behind the button is
 * identical, so it lives here once:
 *
 *   · ask the backend whether Google is configured at all (the button is
 *     not drawn against a deployment that has no client id)
 *   · start the redirect
 *   · on the way back, redeem the one-time code and report the outcome
 *
 * Nothing here decides who anybody is — it only reflects what the backend
 * verified. Every failure path ends in a sentence the operator can read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeGoogleSignIn,
  googleErrorMessage,
  GoogleAuthError,
  readGoogleReturn,
  startGoogleSignIn,
  welcomeFor,
} from "../lib/googleAuth";
import { fetchAuthProviders } from "../api/ledger";

export type GooglePhase = "idle" | "redirecting" | "finishing";

export interface GoogleAuth {
  /** True once the backend confirms it has Google OAuth configured. */
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

/**
 * @param onDone called after a successful sign-in, once the identity is
 *               written — the gate uses it to navigate to the ledger.
 */
export function useGoogleAuth(onDone: () => void): GoogleAuth {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<GooglePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Ask once per mount. A deployment without GOOGLE_CLIENT_ID answers
  // `google: false` and the button simply is not offered — better than a
  // button that always fails.
  useEffect(() => {
    let alive = true;
    void fetchAuthProviders().then((p) => {
      if (alive) setAvailable(p.google);
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
        setError(
          googleErrorMessage(err instanceof GoogleAuthError ? err.reason : "server"),
        );
      });
  }, []);

  const begin = useCallback(() => {
    setError(null);
    setNotice(null);
    setPhase("redirecting");
    // A full-page navigation: if it is somehow blocked, drop the spinner
    // rather than leaving the gate stuck reading "Signing in with Google…".
    try {
      startGoogleSignIn();
    } catch {
      setPhase("idle");
      setError(googleErrorMessage("network"));
      return;
    }
    window.setTimeout(() => {
      setPhase((p) => (p === "redirecting" ? "idle" : p));
    }, 8000);
  }, []);

  const busyLabel =
    phase === "redirecting"
      ? "Signing in with Google…"
      : phase === "finishing"
        ? "Verifying your Google account…"
        : null;

  return {
    available,
    phase,
    busyLabel,
    error,
    notice,
    begin,
    dismissError: useCallback(() => setError(null), []),
  };
}
