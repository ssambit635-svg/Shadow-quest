/**
 * Form.tsx — the turn structure, pinned and scroll-scrubbed.
 *
 * One ensō, four stations. The ring is drawn once, then rotates against scroll
 * while each station's copy is cross-faded by direct writes — no React state
 * per frame, which is what would make a scrubbed section stutter.
 */
import { useEffect, useRef } from "react";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";

const STATIONS = [
  {
    k: "01",
    title: "Stance",
    body: "The clock opens at twenty seconds. Both sides can see the other's ki, guard count, and how many turns they have spent cutting. Nothing is hidden except intent.",
  },
  {
    k: "02",
    title: "Commit",
    body: "One verb per turn: strike, guard, riposte, technique. It is sent to the server on its own — there is no queue, no cancel, no taking it back because the animation looked wrong.",
  },
  {
    k: "03",
    title: "Resolve",
    body: "Both commitments land in the same beat. Damage is cut minus the other side's guard soak, so a read is worth more than a statistic, and the log says exactly what happened.",
  },
  {
    k: "04",
    title: "Zanshin",
    body: "Hold the posture. The round is not yours until the sheath clicks, and the field keeps the score whether or not you are still looking at it.",
  },
];

export function Form() {
  const root = useRef<HTMLElement>(null);
  const ring = useRef<SVGSVGElement>(null);
  const proxy = useRef<HTMLDivElement>(null);
  useReveals(root);

  useEffect(() => {
    if (REDUCED) return;
    const panels = gsap.utils.toArray<HTMLElement>(".form__station");
    const dots = gsap.utils.toArray<HTMLElement>(".form__dot");
    const kanjis = gsap.utils.toArray<HTMLElement>(".form__kanji");

    const ctx = gsap.context(() => {
      // Draw the circle once on entry — the section's opening gesture.
      gsap.fromTo(
        ring.current?.querySelectorAll("path") ?? [],
        { drawSVG: "0% 0%" },
        { drawSVG: "100% 0%", duration: 1.8, ease: "steel" },
      );

      const state = { p: 0 };
      const seg = 1 / STATIONS.length;

      const progress = root.current?.querySelector<HTMLElement>("[data-form-progress]");
      const prevActive = { i: -1 };
      const render = () => {
        const p = state.p;
        if (ring.current) {
          gsap.set(ring.current, { rotate: p * 240 });
        }
        if (progress) gsap.set(progress, { scaleX: p });
        panels.forEach((el, i) => {
          const center = seg * i + seg / 2;
          const d = Math.abs(p - center) / seg; // 0 at its own centre, 1 one segment away
          const t = gsap.utils.clamp(0, 1, 1 - d * 1.35);
          gsap.set(el, {
            autoAlpha: t,
            yPercent: (1 - t) * 14,
            x: (1 - t) * -26,
            filter: `blur(${(1 - t) * 5}px)`,
          });
        });
        const now = Math.min(STATIONS.length - 1, Math.floor(p * STATIONS.length + 1e-4));
        // The ring inhales each time a new station takes over.
        if (now !== prevActive.i && ring.current) {
          prevActive.i = now;
          gsap.fromTo(
            ring.current,
            { scale: 0.965 },
            { scale: 1, duration: 0.7, ease: "brush", overwrite: "auto" },
          );
        }
        const active = Math.min(STATIONS.length - 1, Math.floor(p * STATIONS.length + 1e-4));
        dots.forEach((el, i) => {
          const on = i === active;
          gsap.set(el, { scale: on ? 1.9 : 1, background: on ? "var(--vermilion)" : "var(--bone-500)" });
        });
        kanjis.forEach((el, i) => {
          const on = i === active;
          gsap.to(el, {
            opacity: on ? 1 : 0.22,
            scale: on ? 1.22 : 1,
            color: on ? "var(--vermilion-lit)" : "var(--bone-400)",
            duration: 0.45,
            ease: "snap",
            overwrite: "auto",
          });
        });
        dots.forEach((el) => {
          gsap.to(el, {
            boxShadow: "0 0 0 rgba(0,0,0,0)",
            duration: 0.01,
            overwrite: "auto",
          });
        });
      };

      gsap.to(state, {
        p: 1,
        ease: "none",
        onUpdate: render,
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "+=2600",
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
      render();
    }, root);

    return () => {
      ctx.revert();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <section className="form section" id="form" ref={root}>
      <div className="form__stage shell">
        <p className="label form__tag" data-rv="rise">
          03 — the turn
        </p>

        <div className="form__grid">
          <div className="form__ring" ref={proxy}>
            <svg viewBox="0 0 300 300" ref={ring} aria-hidden="true">
              <path
                d="M150 22 C 219 22, 276 78, 276 150 C 276 221, 219 278, 150 278 C 80 278, 24 221, 24 150 C 24 88, 68 38, 122 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={7}
                strokeLinecap="round"
              />
            </svg>
            <div className="form__dots">
              {STATIONS.map((_, i) => (
                <span className="form__dot" key={i} style={{ ["--a" as string]: `${i * 90}deg` }} />
              ))}
            </div>
            <div className="form__orbit" aria-hidden="true">
              {STATIONS.map((s) => (
                <span className="form__kanji num" key={s.k}>
                  {s.k}
                </span>
              ))}
            </div>
          </div>

          <div className="form__copy">
            <h2 className="form__title" data-rv="brush">
              Four stations, one breath each.
            </h2>
            <div className="form__stations">
              {STATIONS.map((s, i) => (
                <article className="form__station" key={s.title} data-i={i}>
                  <span className="form__n num">0{i + 1} / 04</span>
                  <h3 className="form__h">
                    <span className="form__hk num">{s.k}</span>
                    {s.title}
                  </h3>
                  <p className="form__body">{s.body}</p>
                </article>
              ))}
            </div>
            <div className="form__progress" aria-hidden="true">
              <span data-form-progress />
            </div>
          </div>
        </div>
      </div>

      <figure className="form__plate">
        <img src="/img/duel-wide.jpg" alt="Two samurai facing one another across empty paper, sumi-e" />
        <figcaption className="label">
          the field, before either of them moves — and this is the only part of the game that is decoration
        </figcaption>
      </figure>
    </section>
  );
}
