/**
 * Roster.tsx — character select, drawn from the API (`GET /v1/shadows`).
 *
 * Cards are paper plates on the ink page. Hover does three things at once and
 * nothing else: the ink wash bleeds up behind the figure, the stat bars fill,
 * the blade line draws. Selecting a shadow is a real action — it's what the
 * field screen boots with.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Shadow } from "../api/types";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";
import { useResource } from "../hooks/useApi";
import { prefs } from "../lib/prefs";

const loadShadows = () => api.listShadows();

/** 0–10 authored scale → 0–100% bar width, one place. */
const pct = (v: number) => `${Math.max(4, Math.min(100, v * 10))}%`;

export function Roster({ onPick }: { onPick: (id: string) => void }) {
  const root = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<string>(() => prefs.shadow() ?? "kage");
  const { data, loading, error, reload } = useResource<Shadow[]>(loadShadows);
  const shadows = data ?? [];

  useReveals(root, [shadows.length]);

  // Bars fill once, when the card first enters — a readout, not a loop.
  useEffect(() => {
    if (REDUCED || !shadows.length) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".roster__card").forEach((card) => {
        const bars = card.querySelectorAll<HTMLElement>(".roster__bar-fill");
        gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
        ScrollTrigger.create({
          trigger: card,
          start: "top 86%",
          once: true,
          onEnter: () =>
            gsap.to(bars, {
              scaleX: 1,
              duration: 0.9,
              ease: "snap",
              stagger: 0.07,
              onComplete: () => gsap.set(bars, { clearProps: "transform" }),
            }),
        });
      });
    }, root);
    return () => ctx.revert();
  }, [shadows.length]);

  const pick = (id: string) => {
    setSelected(id);
    prefs.setShadow(id);
    const card = root.current?.querySelector<HTMLElement>(`[data-shadow="${id}"]`);
    // A stamp, not a bounce: the card compresses and the kanji flashes.
    if (card && !REDUCED) {
      gsap
        .timeline()
        .to(card, { scale: 0.985, duration: 0.09, ease: "power2.in" })
        .to(card, { scale: 1, duration: 0.5, ease: "brush" })
        .to(
          card.querySelector(".roster__kanji"),
          { color: "var(--vermilion)", duration: 0.12, yoyo: true, repeat: 1, ease: "none" },
          0,
        );
    }
  };

  return (
    <section className="roster section" id="roster" ref={root}>
      <header className="roster__head">
        <div>
          <p className="label roster__tag">第二段 — the shadows</p>
          <h2 className="roster__title" data-rv="brush">
            Six of them. You get one.
          </h2>
        </div>
        <p className="roster__lede" data-rv="rise">
          Stats are authored on the same zero-to-ten axis, so a nine in speed and
          a four in guard mean exactly what they look like. No hidden tiers, no
          unlock trees. Pick the shape of duel you want to lose in.
        </p>
      </header>

      {error && (
        <div className="roster__error">
          <p className="label">roster refused</p>
          <p>{error}</p>
          <button className="btn" type="button" onClick={reload}>
            <span className="btn__slash" />
            Retry
          </button>
        </div>
      )}

      {loading && !error && (
        <ul className="roster__grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li className="roster__card roster__card--skeleton" key={i}>
              <span className="sk sk--kanji" />
              <span className="sk sk--line" />
              <span className="sk sk--line sk--short" />
              <span className="sk sk--bar" />
              <span className="sk sk--bar" />
            </li>
          ))}
        </ul>
      )}

      {shadows.length > 0 && (
        <>
          <ul className="roster__grid">
            {shadows.map((s, i) => {
              const isSel = selected === s.id;
              return (
                <li
                  className="roster__card"
                  data-shadow={s.id}
                  data-sel={isSel}
                  key={s.id}
                  data-rv="rise"
                  data-rv-group="cards"
                  style={{ ["--i" as string]: i }}
                >
                  <button
                    type="button"
                    className="roster__hit"
                    onClick={() => pick(s.id)}
                    onPointerEnter={() => {
                      if (REDUCED) return;
                      gsap.to(`[data-shadow="${s.id}"] .roster__wash`, {
                        opacity: 0.5,
                        yPercent: 0,
                        duration: 0.7,
                        ease: "brush",
                      });
                      gsap.fromTo(
                        `[data-shadow="${s.id}"] .roster__blade`,
                        { drawSVG: "0% 0%" },
                        { drawSVG: "100% 0%", duration: 0.55, ease: "steel" },
                      );
                    }}
                    onPointerLeave={() => {
                      if (REDUCED) return;
                      gsap.to(`[data-shadow="${s.id}"] .roster__wash`, {
                        opacity: 0.14,
                        yPercent: 18,
                        duration: 0.8,
                        ease: "brush",
                      });
                    }}
                    aria-pressed={isSel}
                  >
                    <span className="roster__wash" aria-hidden="true" />
                    <span className="roster__top">
                      <span className="roster__kanji kanji">{s.kanji}</span>
                      <span className="roster__id num">{String(i + 1).padStart(2, "0")}</span>
                    </span>

                    <span className="roster__name">{s.name}</span>
                    <span className="roster__school label">{s.school}</span>
                    <span className="roster__vow">{s.vow}</span>

                    <span className="roster__stats">
                      {(
                        [
                          ["cut", s.stats.cut],
                          ["guard", s.stats.guard],
                          ["speed", s.stats.speed],
                          ["ki", s.stats.ki],
                        ] as const
                      ).map(([k, v]) => (
                        <span className="roster__stat" key={k}>
                          <span className="roster__stat-k label">{k}</span>
                          <span className="roster__bar">
                            <span className="roster__bar-fill" style={{ width: pct(v) }} />
                          </span>
                          <span className="roster__stat-v num">{v}</span>
                        </span>
                      ))}
                    </span>

                    <svg className="roster__blade" viewBox="0 0 100 4" aria-hidden="true">
                      <path d="M0 2 H100" stroke="var(--vermilion)" strokeWidth="2" fill="none" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="roster__cta">
            <p className="label">chosen</p>
            <p className="roster__chosen">
              {shadows.find((s) => s.id === selected)?.name ?? "—"}
              <span className="roster__chosen-kanji kanji">
                {shadows.find((s) => s.id === selected)?.kanji}
              </span>
            </p>
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => onPick(selected)}
              disabled={!selected}
            >
              <span className="btn__slash" />
              Take the field
            </button>
          </div>
        </>
      )}
    </section>
  );
}
