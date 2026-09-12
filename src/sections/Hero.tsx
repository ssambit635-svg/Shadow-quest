/**
 * Hero.tsx — Eurostile headings, no horizontal cursor parallax.
 * The painting still breathes (Ken Burns), shine sweeps, but no pointermove lerp.
 */
import { useEffect, useRef } from "react";
import { brushReveal, gsap, REDUCED, splitTo, wipeIn } from "../lib/motion";
import { useReady } from "../lib/ready";

const DUST = 8;

export function Hero({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  const line1 = useRef<HTMLSpanElement>(null);
  const line2 = useRef<HTMLSpanElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const strokeRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const ready = useReady();

  useEffect(() => {
    if (!ready) return;
    const self = root.current;
    if (!self) return;

    const s1 = splitTo(line1.current);
    const s2 = splitTo(line2.current);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "brush" }, delay: 0.05 });

      tl
        .fromTo(
          "[data-hero-meta]",
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.08 },
          0,
        )
        .add(brushReveal(s1, { stagger: 0.03 }), 0.15)
        .add(brushReveal(s2, { stagger: 0.03 }), 0.3)
        .fromTo(
          "[data-hero-slash]",
          { scaleX: 0 },
          { scaleX: 1, duration: 0.7, ease: "slash" },
          0.85,
        )
        .add(wipeIn("[data-hero-plate]", { duration: 1.2, delay: 0 }), 0.45)
        .fromTo(
          "[data-hero-shine]",
          { xPercent: -160, opacity: 0 },
          { xPercent: 160, opacity: 1, duration: 1.1, ease: "slash" },
          1.15,
        )
        .to("[data-hero-shine]", { opacity: 0, duration: 0.3 }, 2.1)
        .fromTo(
          "[data-hero-foot] > *",
          { opacity: 0, y: 12, clipPath: "inset(0 0 100% 0)" },
          {
            opacity: 1,
            y: 0,
            clipPath: "inset(0 0 0% 0)",
            duration: 0.7,
            stagger: 0.07,
          },
          1.5,
        )
        .fromTo(
          "[data-hero-corner]",
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, ease: "snap", stagger: 0.06 },
          1.9,
        );

      if (!REDUCED) {
        gsap.to("[data-hero-painting]", {
          scale: 1.08,
          xPercent: -1,
          duration: 22,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        gsap.utils.toArray<HTMLElement>("[data-hero-dust] > i").forEach((mote, i) => {
          gsap.set(mote, {
            left: `${(i * 71 + 13) % 100}%`,
            top: `${(i * 37 + 8) % 100}%`,
          });
          gsap.to(mote, {
            y: -30 - (i % 4) * 10,
            opacity: 0,
            duration: 6 + (i % 5),
            ease: "sine.inOut",
            repeat: -1,
            delay: (i % 6) * 0.8,
            repeatDelay: 0.6,
            onRepeat: () => gsap.set(mote, { opacity: 0.45 }),
          });
        });
      }

      gsap.fromTo(
        "[data-hero-ghost]",
        { yPercent: 14, opacity: 0.16 },
        {
          yPercent: -26,
          opacity: 0.03,
          ease: "none",
          scrollTrigger: { trigger: self, start: "top top", end: "bottom top", scrub: true },
        },
      );
      gsap.to("[data-hero-plate]", {
        yPercent: -6,
        ease: "none",
        scrollTrigger: { trigger: self, start: "top top", end: "bottom top", scrub: 0.6 },
      });
      gsap.to("[data-hero-painting]", {
        yPercent: 7,
        ease: "none",
        scrollTrigger: { trigger: self, start: "top top", end: "bottom top", scrub: 0.8 },
      });
      gsap.to("[data-hero-title]", {
        yPercent: -16,
        autoAlpha: 0.3,
        ease: "none",
        scrollTrigger: { trigger: self, start: "top top", end: "70% top", scrub: 0.5 },
      });
      gsap.fromTo(
        strokeRef.current,
        { clipPath: "inset(0 100% 0 0)", opacity: 0.35 },
        {
          clipPath: "inset(0 0% 0 0)",
          opacity: 0.55,
          ease: "none",
          scrollTrigger: { trigger: self, start: "bottom 92%", end: "bottom 40%", scrub: 0.4 },
        },
      );
    }, self);

    return () => {
      ctx.revert();
      s1?.revert();
      s2?.revert();
    };
  }, [ready]);

  return (
    <section className="hero" ref={root} id="top">
      <div className="hero__ghost kanji" data-hero-ghost aria-hidden="true">
        影
      </div>
      <div className="hero__dust" data-hero-dust aria-hidden="true">
        {Array.from({ length: DUST }).map((_, i) => (
          <i key={i} />
        ))}
      </div>

      <div className="hero__grid shell">
        <div className="hero__text">
          <p className="hero__eyebrow" data-hero-meta>
            <span className="label">
              <span className="kanji hero__eyebrow-k">影</span> · Season of the Ford
            </span>
            <span className="hero__rule" />
            <span className="label">Turn-based duel · Quest Log</span>
          </p>

          <h1 className="hero__title" data-hero-title>
            <span className="rv-line">
              <span ref={line1}>Ink dries.</span>
            </span>
            <span className="rv-line hero__title-em">
              <span ref={line2}>Steel doesn’t.</span>
            </span>
            <span className="hero__slash" data-hero-slash aria-hidden="true" />
          </h1>

          <p className="hero__lede" data-hero-meta>
            Your tasks are your blade. The Quest Log is the core — track every cut,
            every guard, every debt you owe the ford. Eurostile for clarity, ink for weight.
          </p>

          <div className="hero__actions" data-hero-meta>
            <button className="btn btn--primary" type="button" onClick={onEnter} ref={ctaRef}>
              <span className="btn__slash" />
              Enter the field
            </button>
            <a className="hero__quiet" href="#questlog">
              <span>Open Quest Log</span>
              <svg viewBox="0 0 24 24" width="14" aria-hidden="true">
                <path d="M12 3v16M5 13l7 7 7-7" stroke="currentColor" strokeWidth="1.4" fill="none" />
              </svg>
            </a>
          </div>
        </div>

        <div className="hero__art">
          <div className="hero__plate" data-hero-plate ref={plate}>
            <img
              className="hero__painting"
              data-hero-painting
              src="/img/samurai-hero.jpg"
              alt="Sumi-e painting of a ronin with drawn katana before a vermilion sun"
            />
            <span className="hero__shine" data-hero-shine aria-hidden="true" />
            <span className="hero__plate-tag label">study no. 01 — Eurostile</span>
            <i className="hero__corner hero__corner--tl" data-hero-corner />
            <i className="hero__corner hero__corner--tr" data-hero-corner />
            <i className="hero__corner hero__corner--bl" data-hero-corner />
            <i className="hero__corner hero__corner--br" data-hero-corner />
          </div>
          <p className="hero__caption label">
            Kage Maru, at the ford. <br />
            <span>ink on paper, before the first cut</span>
          </p>
        </div>
      </div>

      <div className="hero__foot shell" data-hero-foot>
        {[
          ["Rounds", "best of one"],
          ["Turn clock", "20s"],
          ["Tasks", "infinite"],
          ["Font", "Eurostile"],
        ].map(([k, v]) => (
          <p key={k} className="hero__stat">
            <span className="label">{k}</span>
            <span className="hero__stat-v">{v}</span>
          </p>
        ))}
      </div>

      <div className="hero__brush" ref={strokeRef} aria-hidden="true" />
    </section>
  );
}
