/**
 * Form.tsx — the growth loop, pinned and scroll-scrubbed.
 *
 * One ensō-style ring, four stations. The ring rotates against scroll while
 * each station's copy is cross-faded by direct GSAP writes — no React state
 * per frame, which is what would make a scrubbed section stutter.
 */
import { useEffect, useRef } from "react";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
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
          const d = Math.abs(p - center) / seg;
          const t = gsap.utils.clamp(0, 1, 1 - d * 1.35);
          gsap.set(el, {
            autoAlpha: t,
            yPercent: (1 - t) * 14,
            x: (1 - t) * -26,
            filter: `blur(${(1 - t) * 5}px)`,
          });
        });
        const now = Math.min(STATIONS.length - 1, Math.floor(p * STATIONS.length + 1e-4));
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
        <img src="/img/duel-wide.jpg" alt="Cinematic workspace" style={{ filter: "contrast(1.05) saturate(0.6) hue-rotate(-10deg) invert(1) grayscale(1) contrast(1.25)" }} />
        <figcaption className="label">
          real action → progress → growth — the loop runs every day
        </figcaption>
      </figure>
    </section>
  );
}
