/**
 * MobileLogin.tsx — the gate, on a phone.
 *
 * Two ways in:
 *
 *   Google — the real thing. The button hands the page to the backend, which
 *            redirects to Google's own consent screen; Google redirects back
 *            to the backend, which verifies the ID token's signature, finds
 *            or creates the MongoDB user, and returns a one-time code this
 *            page trades for the ordinary ShadowQuest session. No account is
 *            chosen here — Google's own chooser does that.
 *
 *   Name + email + passphrase — unchanged. A hard password is required: the
 *            backend verifies (scrypt) when reachable, this device's PBKDF2
 *            record verifies when it is not, and a weak password never
 *            leaves the form.
 *
 * The desktop Login screen is not touched by any of this; it is a separate
 * component and still renders on a laptop.
 */
import { useState } from "react";
import { login, normalizeEmail, normalizeHandle, type User } from "../../lib/auth";
import { writeProvider } from "../../lib/googleAuth";
import { useGoogleAuth } from "../../hooks/useGoogleAuth";
import { GoogleMark } from "../../components/GoogleMark";
import {
  checkPassword,
  setLocalPassword,
  verifyLocalPassword,
  PASSWORD_MAX,
} from "../../lib/password";
import { PasswordError, signInWithPassword } from "../../api/ledger";

/** RFC 5321's ceiling. Anything longer is not an address, it is a payload. */
const MAX_EMAIL = 254;
const MAX_HANDLE = 32;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = "idle" | "checking" | "granted";

export function MobileLogin({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [who, setWho] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The real OAuth flow: availability, the redirect, and the return leg.
  const google = useGoogleAuth(onDone);
  const googleBusy = google.phase !== "idle";

  const policy = checkPassword(password);
  const meterLabel = !password
    ? "empty"
    : policy.score <= 1
      ? "weak"
      : policy.score <= 3
        ? "fair"
        : policy.ok
          ? "hard"
          : "almost";

  /**
   * Both entry paths land here: the account chooser hands over name + email,
   * the form is the only way to present the passphrase. The check runs
   * against the backend first; when it is away, this device's own verifier
   * takes the gate. Identity is normalised before anything is written:
   * control characters and bidi overrides are stripped, the address is
   * lowercased and capped, and anything that is not shaped like an address
   * is refused rather than stored.
   */
  const submitLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== "idle") return;
    const cleanMail = normalizeEmail(email);
    if (!EMAIL_SHAPE.test(cleanMail)) {
      setError("That does not look like an email address.");
      return;
    }
    if (!policy.ok) {
      setError("Weak passphrase — needs " + policy.problems.join(", ") + ".");
      return;
    }
    const cleanName = normalizeHandle(name, cleanMail);
    setError(null);
    setWho(cleanName);
    setPhase("checking");

    let role: User["role"] = "operator";
    let failure: string | null = null;
    try {
      const result = await signInWithPassword({ handle: cleanName, email: cleanMail }, password);
      if (result) {
        role = result.role;
        void setLocalPassword({ handle: cleanName, email: cleanMail, joinedAt: Date.now() }, password);
      } else {
        const probe: User = { handle: cleanName, email: cleanMail, joinedAt: Date.now() };
        const verdict = await verifyLocalPassword(probe, password);
        if (verdict === "wrong") failure = "Wrong passphrase. Try again.";
        else if (verdict === "unset") await setLocalPassword(probe, password);
      }
    } catch (err) {
      if (err instanceof PasswordError) {
        failure =
          err.code === "wrong-password"
            ? "Wrong passphrase. Try again."
            : err.code === "throttled"
              ? "Too many attempts — wait a moment."
              : err.code === "closed"
                ? "Registration is closed right now."
                : "Passphrase refused — strengthen it first.";
      } else {
        failure = "Could not verify the passphrase.";
      }
    }
    if (failure) {
      setPhase("idle");
      setWho(null);
      setError(failure);
      return;
    }

    login(cleanName, cleanMail, role);
    // This path is the password gate, always — a Google session is written
    // by lib/googleAuth after the backend verified it.
    writeProvider({ kind: "local", at: Date.now() });
    setPhase("granted");
    window.setTimeout(onDone, 260);
  };

  return (
    <div className="m-login">
      <span className="m-login__seal" aria-hidden="true">
        影
      </span>

      <div className="m-login__brand">
        <span className="m-login__mark" aria-hidden="true">
          SQ
        </span>
        <span className="m-login__word">
          Shadow<em>Quest</em>
        </span>
      </div>

      <h1 className="m-login__t">Open your ledger</h1>
      <p className="m-login__s">
        Tasks, progress and streaks are scoped to whoever signs in — sealed by
        a hard passphrase, kept on this device, and synced with the backend
        when it answers.
      </p>

      {google.available ? (
        <>
          <button
            type="button"
            className="m-gbtn"
            onClick={google.begin}
            disabled={phase !== "idle" || googleBusy}
            aria-busy={googleBusy || undefined}
          >
            {googleBusy ? (
              <span className="m-gbtn__spin" aria-hidden="true" />
            ) : (
              <GoogleMark />
            )}
            <span>{google.busyLabel ?? "Continue with Google"}</span>
          </button>

          {google.error ? (
            <p className="m-login__err" role="alert">
              {google.error}
            </p>
          ) : null}
          {google.notice ? (
            <p className="m-login__note" role="status">
              {google.notice}
            </p>
          ) : null}

          <div className="m-login__or">
            <span aria-hidden="true" />
            <i>or</i>
            <span aria-hidden="true" />
          </div>
        </>
      ) : null}

      <form className="m-login__form" onSubmit={submitLocal} noValidate>
        <label className="m-field">
          <span className="m-field__l">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_HANDLE))}
            placeholder="How the ledger calls you"
            maxLength={MAX_HANDLE}
            autoComplete="name"
            spellCheck={false}
            disabled={phase !== "idle" || googleBusy}
          />
        </label>
        <label className="m-field">
          <span className="m-field__l">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.slice(0, MAX_EMAIL))}
            placeholder="you@domain"
            maxLength={MAX_EMAIL}
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            disabled={phase !== "idle" || googleBusy}
          />
        </label>
        <label className="m-field">
          <span className="m-field__l">
            Passphrase
            <button
              type="button"
              className="m-field__eye"
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
              aria-label={showPw ? "Hide passphrase" : "Show passphrase"}
            >
              {showPw ? "hide" : "show"}
            </button>
          </span>
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value.slice(0, PASSWORD_MAX))}
            placeholder="12+ chars · upper · lower · digit · symbol"
            maxLength={PASSWORD_MAX}
            autoComplete="current-password"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            disabled={phase !== "idle" || googleBusy}
          />
          <span className="m-field__meter" data-level={meterLabel} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} />
            ))}
          </span>
          <span className="m-field__policy" data-ok={policy.ok || undefined}>
            {policy.ok
              ? "passphrase meets the bar"
              : `needs: ${policy.problems.join(", ")}`}
          </span>
        </label>
        {error ? (
          <p className="m-login__err" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="m-btn m-btn--go"
          disabled={phase !== "idle" || googleBusy || !name.trim() || !email.trim() || !password}
        >
          {phase === "granted" ? "Granted" : phase === "checking" ? "Verifying" : "Continue"}
        </button>
      </form>

      <p className="m-login__foot">
        Hard password required. The key is scrypt-sealed on the server and
        PBKDF2-sealed on this device.
      </p>

      {phase !== "idle" && who ? (
        <div className="m-login__veil" aria-hidden="true">
          <span className="m-login__ok">
            <i className="num">✓</i>
            <b>{who}</b>
            <em>ledger open</em>
          </span>
        </div>
      ) : null}

    </div>
  );
}
