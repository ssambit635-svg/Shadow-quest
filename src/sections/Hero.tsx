/**
 * Hero.tsx — one screen, one argument.
 *
 * The painting sits on the paper it was painted on (a bone plate against the
 * ink page) rather than being "cut out" with a fake glow. The drawn ronin mark
 * overlays it and inks itself in, so the hero's motion is a brush, not a fade.
 * Pointer parallax runs on lerped targets — never raw mousemove→transform.
 */
import { useEffect, useRef } from "react";
import { brushReveal, gsap, REDUCED, splitTo, wipeIn } from "../lib/motion";
import { useReady } from "../lib/ready";
import { SamuraiMark } from "../components/SamuraiMark";

export function Hero({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  const line1 = useRef<HTMLSpanElement>(null);
  const line2 = useRef<HTMLSpanElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const strokeRef = useRef<HTMLDivElement>(null);
  const ready = useReady();

  useEffect(() => {
    if (!ready) return;
    const self = root.current;
    if (!self) return;

    const s1 = splitTo(line1.current);
    const s2 = splitTo(line2.current);

    let detachParallax: (() => void) | undefined;

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
        // The plate wipes in from the left like a screen being slid open.
        .add(wipeIn("[data-hero-plate]", { duration: 1.2, delay: 0 }), 0.45)
        // …then the drawn ronin inks himself on top of it, stroke by stroke.
        .set(".hero__mark .mark__ink, .hero__mark .mark__blade", { opacity: 1 }, 0.95)
        .to(
          ".hero__mark .mark__stroke",
          { drawSVG: "100% 0%", duration: 1.3, stagger: 0.09, ease: "steel" },
          0.95,
        )
        .fromTo(
          "[data-hero-foot] > *",
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.06 },
          1.5,
        );

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
      }
    }, self);

    return () => {
      detachParallax?.();
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

      <div className="hero__grid shell">
        <div className="hero__text">
          <p className="hero__eyebrow" data-hero-meta>
            <span className="label">影 · Season of the Ford</span>
            <span className="hero__rule" />
            <span className="label">Turn-based duel</span>
          </p>

          <h1 className="hero__title">
            <span className="rv-line">
              <span ref={line1}>Ink dries.</span>
            </span>
            <span className="rv-line hero__title-em">
              <span ref={line2}>Steel doesn’t.</span>
            </span>
          </h1>

          <p className="hero__lede" data-hero-meta>
            Six shadows, one exchange per breath. Read the stance, commit the
            stroke, live with the consequence — no sparkles, no gacha, no
            victory you didn’t earn with patience.
          </p>

          <div className="hero__actions">
            <button className="btn btn--primary" type="button" onClick={onEnter}>
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
              src="/img/samurai-hero.jpg"
              alt="Sumi-e painting of a ronin with drawn katana before a vermilion sun"
            />
            {/* The drawn mark rides above the painting, inked in stroke by
                stroke — the plate reads as a study, then a finished cut. */}
            <SamuraiMark className="hero__mark" size="100%" inked={false} />
            <span className="hero__plate-tag label">study no. 01</span>
          </div>
          <p className="hero__caption label">
            影丸 — Kage Maru, at the ford. <br />
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
