/**
 * Hero.tsx — one screen, one argument.
 *
 * The painting sits on the paper it was painted on (a bone plate against the
 * ink page). No sketch overlays it anymore — instead the plate gets cinema:
 * a slow Ken Burns drift, a shine that sweeps it on entry, ember dust in the
 * air, and a vermilion slash that draws itself under the title. Pointer
 * parallax runs on lerped targets — never raw mousemove→transform.
 */
import { useEffect, useRef } from "react";
import { brushReveal, gsap, magnetic, REDUCED, splitTo, wipeIn } from "../lib/motion";
import { useReady } from "../lib/ready";

const DUST = 14;

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

    let detachParallax: (() => void) | undefined;
    let detachMagnet: (() => void) | undefined;

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
        // The vermilion slash draws itself under the title as the second
        // line lands — the cut that punctuates the statement.
        .fromTo(
          "[data-hero-slash]",
          { scaleX: 0 },
          { scaleX: 1, duration: 0.7, ease: "slash" },
          0.85,
        )
        // The plate wipes in from the left like a screen being slid open.
        .add(wipeIn("[data-hero-plate]", { duration: 1.2, delay: 0 }), 0.45)
        // …then a shine sweeps the painting once, left to right.
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
        // Plate corners stamp in last, one beat apart.
        .fromTo(
          "[data-hero-corner]",
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, ease: "snap", stagger: 0.06 },
          1.9,
        );

      // The painting itself breathes: a 26-second Ken Burns drift. Pure
      // transform, so it costs one composited layer.
      if (!REDUCED) {
        gsap.to("[data-hero-painting]", {
          scale: 1.1,
          xPercent: -1.5,
          duration: 26,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        // Ember dust: each mote drifts on its own loop, desynced on purpose.
        gsap.utils.toArray<HTMLElement>("[data-hero-dust] > i").forEach((mote, i) => {
          gsap.set(mote, {
            left: `${(i * 71 + 13) % 100}%`,
            top: `${(i * 37 + 8) % 100}%`,
          });
          gsap.to(mote, {
            y: -40 - (i % 5) * 14,
            x: (i % 2 === 0 ? 1 : -1) * (10 + (i % 4) * 8),
            opacity: 0,
            duration: 5 + (i % 6),
            ease: "sine.inOut",
            repeat: -1,
            delay: (i % 7) * 0.9,
            yoyo: false,
            repeatDelay: 0.4,
            onRepeat: () => gsap.set(mote, { opacity: 0.5 }),
          });
        });
      }

      // Ghost kanji drifts up the page on scroll; the plate scales against it.
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
        yPercent: -7,
        ease: "none",
        scrollTrigger: { trigger: self, start: "top top", end: "bottom top", scrub: 0.6 },
      });
      // The painting parallaxes *inside* the plate in the opposite direction,
      // so the frame and the art separate as you leave.
      gsap.to("[data-hero-painting]", {
        yPercent: 9,
        ease: "none",
        scrollTrigger: { trigger: self, start: "top top", end: "bottom top", scrub: 0.8 },
      });
      // Title lifts and fades as the section leaves — the argument exits up.
      gsap.to("[data-hero-title]", {
        yPercent: -18,
        autoAlpha: 0.25,
        ease: "none",
        scrollTrigger: { trigger: self, start: "top top", end: "70% top", scrub: 0.5 },
      });
      // The brush rule under the hero draws itself as the section leaves.
      gsap.fromTo(
        strokeRef.current,
        { clipPath: "inset(0 100% 0 0)", opacity: 0.35 },
        {
          clipPath: "inset(0 0% 0 0)",
          opacity: 0.7,
          ease: "none",
          scrollTrigger: { trigger: self, start: "bottom 92%", end: "bottom 40%", scrub: 0.4 },
        },
      );

      // — pointer parallax, lerped on one tween so nothing jitters —
      if (!REDUCED) {
        const layers = gsap.utils.toArray<HTMLElement>("[data-depth]");
        const pos = { x: 0, y: 0 };
        const goal = { x: 0, y: 0 };
        const follow = () => {
          pos.x += (goal.x - pos.x) * 0.07;
          pos.y += (goal.y - pos.y) * 0.07;
          layers.forEach((el) => {
            const d = Number(el.dataset.depth ?? 0);
            gsap.set(el, { x: pos.x * d * 26, y: pos.y * d * 18 });
          });
        };
        const onMove = (e: PointerEvent) => {
          goal.x = (e.clientX / window.innerWidth - 0.5) * 2;
          goal.y = (e.clientY / window.innerHeight - 0.5) * 2;
        };
        gsap.ticker.add(follow);
        window.addEventListener("pointermove", onMove, { passive: true });
        detachParallax = () => {
          gsap.ticker.remove(follow);
          window.removeEventListener("pointermove", onMove);
        };
        // The CTA leans toward the pointer; hovering the plate re-sweeps it.
        if (ctaRef.current) detachMagnet = magnetic(ctaRef.current, 0.22, 160);
        const plateEl = plate.current;
        const resweep = () => {
          gsap.fromTo(
            "[data-hero-shine]",
            { xPercent: -160, opacity: 1 },
            { xPercent: 160, duration: 0.9, ease: "slash", overwrite: "auto" },
          );
        };
        plateEl?.addEventListener("pointerenter", resweep, { passive: true });
        const prevDetach = detachParallax;
        detachParallax = () => {
          prevDetach?.();
          plateEl?.removeEventListener("pointerenter", resweep);
        };
      }
    }, self);

    return () => {
      detachParallax?.();
      detachMagnet?.();
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
            <span className="label">Turn-based duel</span>
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
            Six shadows, one exchange per breath. Read the stance, commit the
            stroke, live with the consequence — no sparkles, no gacha, no
            victory you didn’t earn with patience.
          </p>

          <div className="hero__actions" data-hero-meta>
            <button
              className="btn btn--primary"
              type="button"
              onClick={onEnter}
              ref={ctaRef}
            >
              <span className="btn__slash" />
              Enter the field
            </button>
            <a className="hero__quiet" href="#way">
              <span>See the form</span>
              <svg viewBox="0 0 24 24" width="14" aria-hidden="true">
                <path d="M12 3v16M5 13l7 7 7-7" stroke="currentColor" strokeWidth="1.4" fill="none" />
              </svg>
            </a>
          </div>
        </div>

        <div className="hero__art" data-depth="1">
          <div className="hero__plate" data-hero-plate ref={plate}>
            <img
              className="hero__painting"
              data-hero-painting
              src="/img/samurai-hero.jpg"
              alt="Sumi-e painting of a ronin with drawn katana before a vermilion sun"
            />
            <span className="hero__shine" data-hero-shine aria-hidden="true" />
            <span className="hero__plate-tag label">study no. 01</span>
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
          ["Shadows", "six"],
          ["Price", "patience"],
        ].map(([k, v]) => (
          <p key={k} className="hero__stat">
            <span className="label">{k}</span>
            <span className="hero__stat-v">{v}</span>
          </p>
        ))}
      </div>

      {/* Painted through a mask rather than shown as an image: one asset, and
          the stroke can be any token colour without a second render pass. */}
      <div className="hero__brush" ref={strokeRef} data-depth="0.35" aria-hidden="true" />
    </section>
  );
}
