/**
 * Login.tsx — the gate.
 *
 * One screen, one job: trade a name and a signal for the ledger. The left
 * half is the argument (the data is sealed, it is yours, it stays here); the
 * right half is the form. Everything in-world: ensō ink, split type, a
 * vermilion slash, a decode line that reports each stage of the check, and
 * the site's ink wipe as the door closing behind you.
 */
import { useEffect, useRef, useState } from "react";
import { Sigil } from "../components/Sigil";
import { login, normalizeEmail, normalizeHandle } from "../lib/auth";
import {
  brushReveal,
  gsap,
  REDUCED,
  scrambleTo,
  splitTo,
  attachWash,
} from "../lib/motion";
import { useReady } from "../lib/ready";

const STAGES = {
  idle: "awaiting signal",
  verifying: "verifying signal",
  granted: "gate open",
  refused: "signal refused — check your details",
};

/** RFC 5321's ceiling for an address; the design gives a name 32 characters. */
const MAX_EMAIL = 254;
const MAX_HANDLE = 32;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLElement>(null);
  const title1 = useRef<HTMLSpanElement>(null);
  const title2 = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ready = useReady();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "verifying" | "granted">("idle");
  const [refused, setRefused] = useState(false);

  // (A user already existing on this screen is handled by the app shell:
  //  it carries a signed-in operator straight over the gate to the ledger.)

  const setStatus = (s: string) => {
    if (statusRef.current) scrambleTo(statusRef.current, s, { duration: 0.55 });
  };

  useEffect(() => {
    if (!ready) return;
    const self = root.current;
    if (!self) return;

    const s1 = splitTo(title1.current);
    const s2 = splitTo(title2.current);
    let wash: (() => void) | undefined;

    const ctx = gsap.context(() => {
      // Hide everything the timeline will sweep in, before the first frame,
      // so nothing flashes and then retracts.
      gsap.set("[data-login-line], [data-login-form] > *", { autoAlpha: 0 });
      gsap.set("[data-login-slash]", { scaleX: 0 });
      gsap.set(progressRef.current, { scaleX: 0 });

      const tl = gsap.timeline({ defaults: { ease: "brush" } });
      tl
        .add(brushReveal(s1, { stagger: 0.026 }), 0.1)
        .add(brushReveal(s2, { stagger: 0.026 }), 0.22)
        .fromTo(
          "[data-login-slash]",
          { scaleX: 0 },
          { scaleX: 1, duration: 0.6, ease: "slash" },
          0.5,
        )
        .fromTo(
          "[data-login-form] > *",
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.06 },
          0.55,
        )
        // The sealed-plate half slides in like paper being dealt.
        .fromTo(
          "[data-login-plate]",
          { clipPath: "inset(0 100% 0 0)", autoAlpha: 0 },
          { clipPath: "inset(0 0% 0 0)", autoAlpha: 1, duration: 1.1, ease: "snap" },
          0.2,
        )
        .fromTo(
          "[data-login-line]",
          { autoAlpha: 0, x: -10 },
          { autoAlpha: 1, x: 0, duration: 0.6, stagger: 0.09 },
          0.7,
        )
        .fromTo(
          "[data-login-spec] > *",
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08 },
          0.95,
        );

      // Status line decodes in once the form is ready to receive.
      setStatus(STAGES.idle);

      const plate = self.querySelector<HTMLElement>("[data-login-plate]");
      if (plate && !REDUCED) wash = attachWash(plate);
    }, self);

    return () => {
      wash?.();
      ctx.revert();
      s1?.revert();
      s2?.revert();
    };
  }, [ready]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === "verifying") return;
    // Normalise once, here: what is validated is exactly what gets written.
    const cleanEmail = normalizeEmail(email);
    const cleanName = normalizeHandle(name, cleanEmail);
    const okEmail = EMAIL_SHAPE.test(cleanEmail);
    if (!name.trim() || !okEmail) {
      setRefused(true);
      setStatus(STAGES.refused);
      if (!REDUCED && formRef.current) {
        gsap
          .timeline()
          .to(formRef.current, { x: -7, duration: 0.06, ease: "none" })
          .to(formRef.current, { x: 6, duration: 0.06, ease: "none" })
          .to(formRef.current, { x: -3, duration: 0.06, ease: "none" })
          .to(formRef.current, { x: 0, duration: 0.1, ease: "none" });
      }
      return;
    }
    setRefused(false);
    setPhase("verifying");
    setStatus(STAGES.verifying);

    // The check takes one breath: the line fills, the mark pulses, the word
    // decodes — then the door closes.
    const p = gsap.fromTo(
      progressRef.current,
      { scaleX: 0 },
      { scaleX: 1, duration: REDUCED ? 0.05 : 1.05, ease: "power2.inOut" },
    );

    const finish = () => {
      setPhase("granted");
      setStatus(STAGES.granted);
      login(cleanName, cleanEmail);
      // A beat for the word to land before the wipe swallows the page.
      window.setTimeout(onDone, REDUCED ? 60 : 420);
    };

    if (REDUCED) {
      finish();
      return;
    }
    gsap
      .timeline({ onComplete: finish })
      .to("[data-login-mark]", { scale: 1.06, duration: 0.35, ease: "power2.out" }, 0.55)
      .to("[data-login-mark]", { scale: 1, duration: 0.5, ease: "brush" }, 0.9)
      .add(p, 0);
  };

  return (
    <section className="login" ref={root}>
      <div className="login__ghost kanji" aria-hidden="true">
        影
      </div>

      <div className="login__grid shell">
        {/* — the argument: sealed, yours, here — */}
        <div className="login__aside">
          <figure className="login__plate wash" data-login-plate>
            <img
              src="/img/ink-wash.jpg"
              alt="Ink wash study — the ledger, sealed"
              style={{ filter: "contrast(1.05) saturate(0.65)" }}
            />
            <span className="login__plate-tag label">ledger · sealed</span>
            <i className="login__corner login__corner--tl" aria-hidden="true" />
            <i className="login__corner login__corner--tr" aria-hidden="true" />
            <i className="login__corner login__corner--bl" aria-hidden="true" />
            <i className="login__corner login__corner--br" aria-hidden="true" />
          </figure>

          <div className="login__manifest" data-login-line>
            <p className="login__line">
              Every goal you set, every streak you hold, every point you earn
              lives in one ledger.
            </p>
            <p className="login__line">The ledger is sealed. The operator opens it.</p>
          </div>

          <div className="login__spec" data-login-spec data-login-line>
            <div className="login__spec-row">
              <span className="label">storage</span>
              <span>local-first · this device</span>
            </div>
            <div className="login__spec-row">
              <span className="label">sync</span>
              <span>none — nothing leaves</span>
            </div>
            <div className="login__spec-row">
              <span className="label">cost</span>
              <span>nothing</span>
            </div>
          </div>
        </div>

        {/* — the form — */}
        <div className="login__main">
          <p className="label login__tag" data-login-line>
            <span className="login__tag-k">◆</span> · shadowquest personal os
          </p>

          <h1 className="login__title">
            <span className="rv-line">
              <span ref={title1}>Enter the</span>
            </span>
            <span className="rv-line login__title-em">
              <span ref={title2}>Shadow.</span>
            </span>
            <span className="login__slash" data-login-slash aria-hidden="true" />
          </h1>

          <p className="login__sub" data-login-line>
            Sign in to open your ledger. Tasks, energy, streaks and growth are
            scoped to your signal and kept on this device.
          </p>

          <form
            className="login__form"
            data-login-form
            ref={formRef}
            onSubmit={submit}
            noValidate
          >
            <label className="entry login__entry">
              <span className="label">Designation</span>
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

            <label className="entry login__entry">
              <span className="label">Signal</span>
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

            <div className="login__submit">
              <button
                type="submit"
                className={`btn btn--primary login__btn ${phase === "granted" ? "is-granted" : ""}`}
                disabled={phase === "verifying"}
              >
                <span className="btn__slash" />
                {phase === "idle" && "Open the Gate"}
                {phase === "verifying" && "Verifying"}
                {phase === "granted" && "Granted"}
              </button>
              <span
                className="login__status num"
                ref={statusRef}
                data-refused={refused || undefined}
                aria-live="polite"
              >
                {STAGES.idle}
              </span>
            </div>

            <span className="login__progress" aria-hidden="true">
              <span ref={progressRef} />
            </span>
          </form>

          <p className="login__foot label" data-login-line>
            local sign-in · no password, no cloud, no accounts database
          </p>
        </div>
      </div>

      <div className="login__mark-wrap" data-login-mark aria-hidden="true">
        <Sigil size={54} />
      </div>
    </section>
  );
}
