/**
 * Form.tsx — the growth loop, pinned and scroll-scrubbed.
 *
 * One ensō-style ring, four stations. Everything in the section is driven by
 * ONE number — the scrub progress `p` — so the ring, the station markers, the
 * orbit numerals and the copy can never disagree about which station the
 * reader is on:
 *
 *   · the ring turns exactly one full circle across the section (`p * 360`),
 *     so the brush gap arrives at station *i*'s marker at `p = i / N`;
 *   · the active station is `floor(p * N)` — N bands, one per station, equal;
 *   · a station's copy is at full opacity for the whole of its own band and
 *     cross-fades over half a band on either side, so the first and last
 *     stations are as readable as the middle ones;
 *   · every write is a `gsap.set`, never a tween started from inside
 *     `onUpdate`. A tween there restarts on every frame and therefore never
 *     arrives — that was the lag that made the numerals trail the ring.
 *
 * No React state per frame; direct GSAP writes only.
 */
import { useEffect, useRef } from "react";
import { gsap, isNarrow, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";

const STATIONS = [
  {
    k: "01",
    title: "Intention",
    body: "Every day starts with clarity. Your Today view shows the goals you chose, their Life Factor gains, the Progress they pay out, and the Reward Points waiting. Nothing is hidden except whether you will follow through.",
  },
  {
    k: "02",
    title: "Action",
    body: "One task at a time. Pick the next priority, execute with Focus, mark it complete. There is no queueing and no undo — real commitment is made in the moment you start, not when you move cards on a board.",
  },
  {
    k: "03",
    title: "Progress",
    body: "Every completion pays Progress that raises your Life Level, Reward Points you can spend on yourself, and Life Factor gains that reflect the real skill, strength or knowledge you just built. The log tells you exactly what you earned.",
  },
  {
    k: "04",
    title: "Follow-through",
    body: "Hold the posture. A growth day does not end when the last checkbox fills — reflect, rest, rebuild Energy. The system keeps your Consistency streak and Life Factor history whether or not you are still looking at it.",
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
      gsap.fromTo(
        ring.current?.querySelectorAll("path") ?? [],
        { drawSVG: "0% 0%" },
        { drawSVG: "100% 0%", duration: 1.8, ease: "steel" },
      );

      const state = { p: 0 };
      const N = STATIONS.length;
      const seg = 1 / N;
      /** Cross-fade window: half a band on either side of a station's own. */
      const fade = seg * 0.5;
      /** Blur costs a repaint per frame — only pay it where it is invisible. */
      const softEdge = !isNarrow();

      const progress = root.current?.querySelector<HTMLElement>("[data-form-progress]");
      const counter = root.current?.querySelector<HTMLElement>("[data-form-count]");
      const prevActive = { i: -1 };

      const render = () => {
        const p = gsap.utils.clamp(0, 1, state.p);

        // One full turn across the whole loop, so the gap meets marker i at
        // exactly the moment station i takes the stage.
        if (ring.current) gsap.set(ring.current, { rotate: p * 360 });
        if (progress) gsap.set(progress, { scaleX: p });

        // The active band. `floor` on an equal split — no off-by-one at p = 1.
        const active = Math.min(N - 1, Math.floor(p * N + 1e-6));
        if (counter) counter.textContent = `0${active + 1} / 0${N}`;

        panels.forEach((el, i) => {
          const start = seg * i;
          const end = seg * (i + 1);
          // Inside its own band a station is fully present; outside it falls
          // off across `fade`. The first station therefore opens at 1 and the
          // last one closes at 1 — the copy never peaks at a third opacity.
          const dist = p < start ? start - p : p > end ? p - end : 0;
          const t = gsap.utils.clamp(0, 1, 1 - dist / fade);
          gsap.set(el, {
            autoAlpha: t,
            yPercent: (1 - t) * 10,
            x: (1 - t) * -22,
            ...(softEdge ? { filter: `blur(${((1 - t) * 4).toFixed(2)}px)` } : {}),
          });
          // Keep the hidden stations out of the tab order and the a11y tree.
          el.setAttribute("aria-hidden", t < 0.5 ? "true" : "false");
        });

        // A beat of weight when the loop turns over to a new station.
        if (active !== prevActive.i && ring.current) {
          prevActive.i = active;
          if (!REDUCED) {
            gsap.fromTo(
              ring.current,
              { scale: 0.965 },
              { scale: 1, duration: 0.7, ease: "brush", overwrite: "auto" },
            );
          }
        }

        dots.forEach((el, i) => {
          const on = i === active;
          gsap.set(el, {
            scale: on ? 1.9 : 1,
            background: on ? "var(--vermilion)" : "var(--bone-500)",
          });
        });

        kanjis.forEach((el, i) => {
          const on = i === active;
          gsap.set(el, {
            opacity: on ? 1 : 0.22,
            scale: on ? 1.22 : 1,
            color: on ? "var(--vermilion-lit)" : "var(--bone-400)",
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
          // A phone flicks through a pin fast; give it less runway so the
          // loop still reads station by station instead of blurring past.
          end: () => `+=${isNarrow() ? 1500 : 2600}`,
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
          04 — the loop
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
              The Real-Life Growth Loop.
            </h2>
            <div className="form__stations">
              {STATIONS.map((s, i) => (
                <article className="form__station" key={s.title} data-i={i}>
                  <span className="form__n num">0{i + 1} / 0{STATIONS.length}</span>
                  <h3 className="form__h">
                    <span className="form__hk num">{s.k}</span>
                    {s.title}
                  </h3>
                  <p className="form__body">{s.body}</p>
                </article>
              ))}
            </div>
            <div className="form__meter">
              <span className="form__count num" data-form-count>
                01 / 0{STATIONS.length}
              </span>
              <div className="form__progress" aria-hidden="true">
                <span data-form-progress />
              </div>
            </div>
          </div>
        </div>
      </div>

      <figure className="form__plate">
        <img src="/img/duel-wide.jpg" alt="Cinematic workspace" style={{ filter: "contrast(1.05) saturate(0.6) hue-rotate(-10deg) invert(1) grayscale(1) contrast(1.25)" }} />
        <figcaption className="label">
          real action → progress → growth — the loop runs every day
        </figcaption>
      </figure>
    </section>
  );
}
