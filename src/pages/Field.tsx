/**
 * Field.tsx — the duel. This is the screen the marketing page exists to get
 * you into, so it borrows none of the landing page's manners: it is a HUD.
 *
 * State is entirely server-shaped (see api/types.ts): this component renders a
 * QuestState and emits MoveIntents. The only thing it invents is *feedback* —
 * impact fx from the log, so the numbers changing is also a physical event.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, IS_MOCK } from "../api";
import type { MoveIntent, QuestState, Seat } from "../api/types";
import { prefs } from "../lib/prefs";
import { useQuest, useResource } from "../hooks/useApi";
import { gsap, hitStop, REDUCED, scrambleTo, shake } from "../lib/motion";
import { CombatantPanel, TurnRing } from "../components/hud/CombatantPanel";
import { ActionDock } from "../components/hud/ActionDock";
import { DuelLog } from "../components/hud/DuelLog";
import { SamuraiMark } from "../components/SamuraiMark";

const loadShadows = () => api.listShadows();

interface Floater {
  id: string;
  seat: Seat;
  amount: number;
  type: "cut" | "block" | "miss";
}

export function Field({ onExit }: { onExit: () => void }) {
  const root = useRef<HTMLElement>(null);
  const { state, error, pending, begin, join, move, forfeit, reset } = useQuest();

  const roster = useResource(loadShadows);
  const shadows = roster.data ?? [];

  const [pick, setPick] = useState<string>(() => prefs.shadow() ?? "kage");
  const [code, setCode] = useState<string>(() => prefs.code() ?? "");
  const [copied, setCopied] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);

  const slashRef = useRef<HTMLDivElement>(null);
  const seenLogRef = useRef<string | null>(null);
  const timers = useRef<number[]>([]);

  // `you` comes from the state payload, never guessed from turn order.
  const me = state?.combatants.find((c) => c.seat === state.you) ?? null;
  const foe = state?.combatants.find((c) => c.seat !== state.you) ?? null;

  const kanjiOf = useCallback(
    (id?: string) => shadows.find((s) => s.id === id)?.kanji ?? "影",
    [shadows],
  );

  /* ---------------------------------------------------------------- *
   * Impact: read the log for fx the transport attached to a new entry
   * and spend them on the screen. One watcher, so any server-emitted
   * event animates without the reducer knowing about GSAP.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (!state) return;
    const last = state.log[state.log.length - 1];
    if (!last || last.id === seenLogRef.current) return;
    const prevIdx = seenLogRef.current
      ? state.log.findIndex((l) => l.id === seenLogRef.current)
      : -1;
    seenLogRef.current = last.id;

    const fresh = state.log.slice(prevIdx + 1).filter((l) => l.fx?.amount);
    if (!fresh.length || REDUCED) return;

    const hits: Floater[] = [];
    fresh.forEach((l, i) => {
      const fx = l.fx!;
      const amount = Math.max(0, Math.round(fx.amount ?? 0));
      hits.push({ id: `${l.id}-${i}`, seat: fx.target ?? "defender", amount, type: fx.type ?? "cut" });
      // Shake whichever panel was struck — found by role, not by ref juggling.
      const node = root.current?.querySelector<HTMLElement>(
        `[data-panel="${fx.target === me?.seat ? "me" : "foe"}"]`,
      );
      if (node) shake(node, fx.type === "block" ? 0.4 : 1);
    });

    hitStop(2);
    if (slashRef.current) {
      gsap
        .timeline()
        .fromTo(
          slashRef.current,
          { autoAlpha: 1, scaleX: 0, rotate: -14, transformOrigin: "left center" },
          { scaleX: 1, duration: 0.14, ease: "power2.in" },
        )
        .to(slashRef.current, { autoAlpha: 0, scaleX: 1.08, duration: 0.4, ease: "power2.out" });
    }

    setFloaters((f) => [...f, ...hits]);
    // Deliberately *not* returned as a cleanup: this effect re-runs on every
    // clock tick, and clearing here would strand the floaters on screen.
    const t = window.setTimeout(() => {
      setFloaters((f) => f.filter((x) => !hits.some((h) => h.id === x.id)));
    }, 1200);
    timers.current = [...timers.current.slice(-8), t];
  }, [state, me?.seat]);

  // Floaters rise, then leave — no CSS keyframes, same curve as everything else.
  useEffect(() => {
    if (REDUCED || !floaters.length) return;
    const nodes = root.current?.querySelectorAll(".field__float-new");
    if (!nodes?.length) return;
    gsap.fromTo(
      nodes,
      { yPercent: 20, autoAlpha: 0, scale: 0.9 },
      { yPercent: -90, autoAlpha: 1, scale: 1, duration: 0.5, ease: "snap", clearProps: "opacity,transform" },
    );
  }, [floaters]);

  /* ---------------------------------------------------------------- *
   * Keyboard: 1–4 commit, Esc leaves. `move` is stable enough to depend on.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        onExit();
        return;
      }
      if (!state || state.phase !== "stance" || pending) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx < 0) return;
      const kinds: MoveIntent["kind"][] = ["strike", "guard", "riposte", "technique"];
      const intent: MoveIntent = { kind: kinds[idx], variant: 0 };
      if (intent.kind === "technique" && (me?.ki ?? 0) < 42) return;
      e.preventDefault();
      void move(intent);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, pending, me?.ki, move, onExit]);

  // Section-in: the field assembles (bars out, panels in), not a fade.
  useEffect(() => {
    if (REDUCED) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "brush" } })
        .fromTo("[data-fx-bar]", { yPercent: -100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6 })
        .fromTo(
          "[data-fx-panel]",
          { xPercent: (i: number) => (i === 0 ? -8 : 8), autoAlpha: 0 },
          { xPercent: 0, autoAlpha: 1, duration: 0.8, stagger: 0.12 },
          0.15,
        )
        .fromTo("[data-fx-dock]", { yPercent: 120, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.7 }, 0.3)
        .fromTo(
          "[data-fx-lobby]",
          { yPercent: 60, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.9, stagger: 0.1 },
          0.1,
        )
        .fromTo(
          "[data-fx-mark] .mark__stroke",
          { drawSVG: "0% 0%" },
          { drawSVG: "100% 0%", duration: 2, stagger: 0.05, ease: "steel" },
          0.4
        );
    }, root);
    return () => {
      ctx.revert();
    };
  }, [state?.id]);

  // The one idle loop in the whole site: the ink beneath the field breathes.
  useEffect(() => {
    if (REDUCED) return;
    const t = gsap.to("[data-fx-bleed]", {
      scale: 1.045,
      opacity: 0.55,
      duration: 5.2,
      ease: "breath",
      yoyo: true,
      repeat: -1,
      transformOrigin: "center",
    });
    return () => {
      t.kill();
    };
  }, [state?.id]);

  const open = async () => {
    prefs.setShadow(pick);
    await begin(pick);
  };
  const answer = async () => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    prefs.setShadow(pick);
    prefs.setCode(clean);
    await join(clean, pick);
  };

  const copyCode = async () => {
    if (!state?.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  useEffect(
    () => () => timers.current.forEach((t) => window.clearTimeout(t)),
    [],
  );

  // The code decodes rather than appearing: it is the one piece of data you
  // hand to another person, so it should arrive like a transmission.
  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(".field__code");
    if (el && state?.code) scrambleTo(el, state.code, { duration: 0.75 });
  }, [state?.code]);

  // Keep the joinable code in the session: a refresh should not orphan a duel.
  useEffect(() => {
    if (state?.code) prefs.setCode(state.code);
  }, [state?.code]);

  const urgent = useMemo(
    () => (state?.phase === "stance" ? state.turnClockMs < 6000 : false),
    [state],
  );

  const phaseLabel: Record<QuestState["phase"], string> = {
    lobby: "not seated",
    awaiting: "opponent approaching",
    stance: "your commitment",
    resolving: "resolving",
    victory: "field held",
    defeat: "field lost",
  };

  /* ---------------------------------------------------------------- */

  if (!state) {
    return (
      <section className="field field--lobby" ref={root}>
        <header className="lobby__head shell" data-fx-lobby>
          <p className="label">影 — open a field</p>
          <h1 className="lobby__title">
            Choose the shadow you will
            <br />
            be judged by.
          </h1>
        </header>

        <div className="lobby__grid shell">
          <div className="lobby__pick" data-fx-lobby>
            <p className="label lobby__label">your shadow</p>
            <div className="lobby__chips">
              {roster.loading &&
                Array.from({ length: 6 }).map((_, i) => <span className="lobby__chip sk" key={i} />)}
              {shadows.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="lobby__chip"
                  data-sel={pick === s.id || undefined}
                  onClick={() => {
                    setPick(s.id);
                    prefs.setShadow(s.id);
                    gsap.fromTo(
                      `[data-shadow-chip="${s.id}"] .lobby__chip-k`,
                      { scale: 0.7 },
                      { scale: 1, duration: 0.5, ease: "brush" },
                    );
                  }}
                  data-shadow-chip={s.id}
                >
                  <span className="lobby__chip-k kanji">{s.kanji}</span>
                  <span className="lobby__chip-n">{s.name}</span>
                </button>
              ))}
            </div>
            {roster.error && <p className="lobby__err">{roster.error}</p>}
          </div>

          <div className="lobby__go" data-fx-lobby>
            <button className="btn btn--primary btn--wide" type="button" onClick={open} disabled={roster.loading}>
              <span className="btn__slash" />
              Open the field
            </button>

            <div className="lobby__or">
              <span className="lobby__or-line" />
              <span className="label">answer a call</span>
              <span className="lobby__or-line" />
            </div>

            <label className="entry lobby__code" htmlFor="code">
              <span className="label">code</span>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="KAGE-0000"
                maxLength={12}
                spellCheck={false}
              />
              <button type="button" className="lobby__code-go" onClick={answer} disabled={!code.trim()}>
                join
              </button>
            </label>
            {error && <p className="lobby__err">{error}</p>}
          </div>
        </div>

        <div className="lobby__mark" aria-hidden="true" data-fx-mark>
          <SamuraiMark size="100%" inked />
        </div>
      </section>
    );
  }

  const over = state.phase === "victory" || state.phase === "defeat";

  return (
    <section className="field" ref={root} data-phase={state.phase} data-urgent={urgent || undefined}>
      <div className="field__bleed" data-fx-bleed aria-hidden="true" />

      <header className="field__bar" data-fx-bar>
        <button className="field__leave label" type="button" onClick={onExit}>
          ← leave field
        </button>

        <div className="field__id">
          <span className="label">code</span>
          <button type="button" className="field__code num" onClick={copyCode} title="copy">
            {state.code}
          </button>
          <span className="field__copied" data-on={copied || undefined}>
            copied
          </span>
        </div>

        <div className="field__phase">
          <span className="field__phase-k kanji">{over ? "残" : "構"}</span>
          <span className="label">{phaseLabel[state.phase]}</span>
          <span className="field__round num">R{String(state.round).padStart(2, "0")}</span>
        </div>

        <TurnRing ms={state.turnClockMs} limit={state.turnLimitMs} urgent={urgent} />

        {IS_MOCK && <span className="field__mock label">in-page engine</span>}
      </header>

      <div className="field__slash" ref={slashRef} aria-hidden="true" />

      <div className="field__stage shell">
        <div className="field__vs">
          {foe && (
            <div data-fx-panel>
              <CombatantPanel c={foe} mirror kanji={kanjiOf(foe.shadowId)} />
            </div>
          )}

          <div className="field__mid" aria-hidden="true">
            <span className="field__mid-k kanji">{pending ? "決" : "対"}</span>
            <span className="field__mid-label label">{pending ? "resolving" : "vs"}</span>
          </div>

          {me && (
            <div data-fx-panel>
              <CombatantPanel c={me} kanji={kanjiOf(me.shadowId)} />
            </div>
          )}
        </div>

        {floaters.length > 0 && (
          <div className="field__floats" aria-live="polite">
            {floaters.map((f) => (
              <span
                key={f.id}
                className="field__float field__float-new"
                data-type={f.type}
                style={{ ["--at" as string]: f.seat === me?.seat ? "12%" : "88%" }}
              >
                {f.type === "block" ? "×" : "−"}
                {f.amount}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="field__lower shell">
        <div className="field__actions" data-fx-dock>
          {over ? (
            <div className="result" data-win={state.phase === "victory" || undefined}>
              <p className="result__k kanji">{state.phase === "victory" ? "勝" : "負"}</p>
              <div className="result__body">
                <h2 className="result__title">
                  {state.phase === "victory" ? "The field is yours." : "You were read."}
                </h2>
                <p className="result__sub">
                  {state.round} exchanges · {me?.hp ?? 0} hp left · ki {me?.ki ?? 0}
                </p>
              </div>
              <div className="result__actions">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => {
                    reset();
                    seenLogRef.current = null;
                    void begin(pick);
                  }}
                >
                  <span className="btn__slash" />
                  Again
                </button>
                <button className="btn" type="button" onClick={onExit}>
                  Leave
                </button>
              </div>
            </div>
          ) : (
            <ActionDock
              onMove={(m) => void move(m)}
              disabled={pending || state.phase !== "stance"}
              ki={me?.ki ?? 0}
            />
          )}
        </div>

        <aside className="field__log" data-fx-panel>
          <DuelLog log={state.log} note={state.note} />
          <div className="field__log-foot">
            <button className="field__forfeit label" type="button" onClick={() => void forfeit()} disabled={over}>
              sheathe (concede)
            </button>
            {error && <p className="field__err">{error}</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
