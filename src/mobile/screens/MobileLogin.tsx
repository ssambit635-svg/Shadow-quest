/**
 * MobileLogin.tsx — the gate, on a phone.
 *
 * Two ways through, and the first is the one the brief asked for:
 *
 *   Google — a demo account chooser. ShadowQuest's sign-in is local-first
 *            (`login(handle, email)` in lib/auth), so a Google sign-in needs
 *            no client id and no server: it is the same call, with the name
 *            and address an account chooser would have handed over. Which
 *            provider was used is remembered separately so Profile can show
 *            it and offer to detach.
 *
 *   Name + email — the path the desktop gate has always had, kept intact so
 *            nobody loses a way in.
 *
 * The desktop Login screen is not touched by any of this; it is a separate
 * component and still renders on a laptop.
 */
import { useState } from "react";
import { login } from "../../lib/auth";
import { writeProvider, GOOGLE_ACCOUNTS, type GoogleAccount } from "../demoAccounts";
import { Avatar, Sheet, initialsOf } from "../parts";

type Phase = "idle" | "checking" | "granted";

export function MobileLogin({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [who, setWho] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  /**
   * One beat of "verifying" before the door opens. It is not theatre for its
   * own sake: it gives the account you picked time to appear next to the
   * mark, so the transition reads as a sign-in rather than a teleport.
   */
  const enter = (handle: string, mail: string, google: GoogleAccount | null) => {
    if (phase !== "idle") return;
    setWho(handle);
    setPhase("checking");
    window.setTimeout(
      () => {
        login(handle, mail);
        writeProvider(
          google
            ? { kind: "google", accountId: google.id, at: Date.now() }
            : { kind: "local", at: Date.now() },
        );
        setPhase("granted");
        window.setTimeout(onDone, 260);
      },
      480,
    );
  };

  const submitLocal = (e: React.FormEvent) => {
    e.preventDefault();
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!name.trim() || !okEmail) {
      setError("A name and a valid email are both needed.");
      return;
    }
    setError(null);
    enter(name.trim(), email.trim().toLowerCase(), null);
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
        Tasks, progress and streaks are scoped to whoever signs in, and stay
        on this device.
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
            onChange={(e) => setName(e.target.value)}
            placeholder="How the ledger calls you"
            maxLength={32}
            autoComplete="name"
            disabled={phase !== "idle"}
          />
        </label>
        <label className="m-field">
          <span className="m-field__l">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain"
            autoComplete="email"
            disabled={phase !== "idle"}
          />
        </label>
        {error ? (
          <p className="m-login__err" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="m-btn m-btn--go"
          disabled={phase !== "idle" || !name.trim() || !email.trim()}
        >
          {phase === "granted" ? "Granted" : phase === "checking" ? "Verifying" : "Continue"}
        </button>
      </form>

      <p className="m-login__foot">
        No password, no cloud. Sign-in lives on this device.
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
            <button
              type="button"
              key={a.id}
              className="m-gpick__a"
              onClick={() => {
                setPicker(false);
                enter(a.name, a.email, a);
              }}
            >
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
            onClick={() => {
              setPicker(false);
              enter("Operator", "operator@local.device", null);
            }}
          >
            <Avatar initials={initialsOf("Operator")} hue={210} size={38} />
            <span className="m-gpick__b">
              <span className="m-gpick__n">Continue without an account</span>
              <span className="m-gpick__e">operator@local.device</span>
            </span>
          </button>
          <p className="m-gpick__f">
            Demo identities — choosing one signs you in on this device only.
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
