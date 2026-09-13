/**
 * MobileLogin.tsx — the gate, on a phone.
 *
 * Two ways in, one key:
 *
 *   Google — a demo account chooser. ShadowQuest's sign-in is local-first
 *            (`login(handle, email)` in lib/auth), so a Google sign-in needs
 *            no client id and no server: it is the same call, with the name
 *            and address an account chooser would have handed over. Which
 *            provider was used is remembered separately so Profile can show
 *            it and offer to detach.
 *
 *   Name + email + passphrase — the only actual key. A hard password is
 *            required: the backend verifies (scrypt) when reachable, this
 *            device's PBKDF2 record verifies when it is not, and a weak
 *            password never leaves the form.
 *
 * Picking a Google account fills the form and hands the user the passphrase
 * field — the password is the gate for every identity, demo or not.
 *
 * The desktop Login screen is not touched by any of this; it is a separate
 * component and still renders on a laptop.
 */
import { useEffect, useRef, useState } from "react";
import { login, normalizeEmail, normalizeHandle, type User } from "../../lib/auth";
import { writeProvider, GOOGLE_ACCOUNTS, type GoogleAccount } from "../demoAccounts";
import {
  checkPassword,
  setLocalPassword,
  verifyLocalPassword,
  PASSWORD_MAX,
} from "../../lib/password";
import { PasswordError, signInWithPassword } from "../../api/ledger";
import { Avatar, Sheet, initialsOf } from "../parts";

/** RFC 5321's ceiling. Anything longer is not an address, it is a payload. */
const MAX_EMAIL = 254;
const MAX_HANDLE = 32;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = "idle" | "checking" | "granted";

export function MobileLogin({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [who, setWho] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwRef = useRef<HTMLInputElement>(null);
  const [google, setGoogle] = useState<GoogleAccount | null>(null);
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
    writeProvider(
      google ? { kind: "google", accountId: google.id, at: Date.now() } : { kind: "local", at: Date.now() },
    );
    setPhase("granted");
    window.setTimeout(onDone, 260);
  };

  /** The chooser fills the form; the passphrase field gets the focus. */
  const pick = (a: GoogleAccount | null) => {
    setGoogle(a);
    setName(a ? a.name : "Operator");
    setEmail(a ? a.email : "operator@local.device");
    setPicker(false);
    window.setTimeout(() => pwRef.current?.focus(), 60);
  };

  useEffect(() => {
    if (picker) pwRef.current?.blur();
  }, [picker]);

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

      <button
        type="button"
        className="m-gbtn"
        onClick={() => setPicker(true)}
        disabled={phase !== "idle"}
      >
        <GoogleMark />
        <span>Continue with Google</span>
      </button>

      <div className="m-login__or">
        <span aria-hidden="true" />
        <i>or</i>
        <span aria-hidden="true" />
      </div>

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
            disabled={phase !== "idle"}
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
            disabled={phase !== "idle"}
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
            ref={pwRef}
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value.slice(0, PASSWORD_MAX))}
            placeholder="12+ chars · upper · lower · digit · symbol"
            maxLength={PASSWORD_MAX}
            autoComplete="current-password"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            disabled={phase !== "idle"}
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
          disabled={phase !== "idle" || !name.trim() || !email.trim() || !password}
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

      <Sheet open={picker} onClose={() => setPicker(false)} title="Choose an account">
        <div className="m-gpick">
          <p className="m-gpick__h">to continue to ShadowQuest</p>
          {GOOGLE_ACCOUNTS.map((a) => (
            <button type="button" key={a.id} className="m-gpick__a" onClick={() => pick(a)}>
              <Avatar initials={a.initials} hue={a.hue} size={38} />
              <span className="m-gpick__b">
                <span className="m-gpick__n">{a.name}</span>
                <span className="m-gpick__e">{a.hint}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className="m-gpick__a m-gpick__a--alt"
            onClick={() => pick(null)}
          >
            <Avatar initials={initialsOf("Operator")} hue={6} size={38} />
            <span className="m-gpick__b">
              <span className="m-gpick__n">Continue without an account</span>
              <span className="m-gpick__e">operator@local.device</span>
            </span>
          </button>
          <p className="m-gpick__f">
            Demo identities — choosing one fills the form; your passphrase is
            still the key in.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

/** Google's mark, drawn inline so the button needs no network fetch. */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7C13.4 14.7 18.3 10.8 24 10.8z"
      />
    </svg>
  );
}
