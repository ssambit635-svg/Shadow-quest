/**
 * Hero.tsx — one screen, one argument.
 *
 * The plate on the right is no longer a painting: it is an instrument. A live
 * WebGL render of a black hole — the accretion disk, the photon ring, the
 * shadow — sits where the samurai used to, inside the same bone frame with
 * the same corner stamps. The plate still gets cinema: a shine that sweeps it
 * on entry, ember dust in the air, a pointer wash, a vermilion slash under
 * the title. The CTA is the gate — sign in, or open the OS if you already
 * are in.
 *
 * Two motion decisions are deliberate. The plate keeps its scroll parallax
 * but the render's own Ken Burns is gone: CSS-scaling a canvas that a
 * fragment shader paints every frame buys nothing and costs sharpness, and
 * the black hole is already moving inside its own frame. Everything that
 * moves on the plate is therefore either chrome (GSAP, on the DOM) or the
 * renderer's business (inside the canvas) — never both on the same node.
 */
import { useEffect, useRef } from "react";
import {
  attachWash,
  CAN_HOVER,
  gsap,
  isNarrow,
  magnetic,
  REDUCED,
  wipeIn,
} from "../lib/motion";
import { useReady } from "../lib/ready";
import { BlackHole } from "../components/blackhole/BlackHole";
import type { User } from "../lib/auth";

const DUST = 14;

export function Hero({ user, onEnter }: { user: User | null; onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const strokeRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const ready = useReady();

  useEffect(() => {
    if (!ready || REDUCED) return;
    const self = root.current;
    if (!self) return;

    let detachParallax: (() => void) | undefined;
    let detachMagnet: (() => void) | undefined;
    let detachWash: (() => void) | undefined;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "brush" }, delay: 0.05 });

      tl
        .fromTo(
          "[data-hero-meta]",
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.08 },
          0,
        )
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

      // Ember dust over the plate: each mote drifts on its own loop,
      // desynced on purpose. The plate's own image is left alone — the
      // renderer inside it is the thing that moves.
      if (!REDUCED && !isNarrow()) {
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
        // The plate listens: a soft light follows the pointer across the
        // paper while it sits there.
        if (plate.current) detachWash = attachWash(plate.current);
      }

      // Ghost mark drifts up the page on scroll; the plate scales against it.
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
      // The headline is ordinary text: never split, hidden, or scroll-scrubbed.
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
      // Gated on a pointer that can genuinely hover, like every other
      // pointer-chasing effect here (magnetic, wash, tilt): on glass this is a
      // rAF loop that runs for the whole session and, worse, `pointermove`
      // fires *during the scroll drag*, so the hero slides sideways under the
      // thumb while the phone is already paying for the scroll.
      if (!REDUCED && CAN_HOVER) {
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
      detachWash?.();
      ctx.revert();
    };
  }, [ready]);

  const goSystem = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("way")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
              <span className="hero__eyebrow-k">◆</span> · ShadowQuest Personal OS
            </span>
            <span className="hero__rule" />
            <span className="label">Productivity · Growth · Progress</span>
          </p>

          <h1 className="hero__title" data-hero-title>
            <span className="hero__headline-line">
              <span>Real action.</span>
            </span>
            <span className="hero__headline-line hero__title-em">
              <span>Real growth.</span>
            </span>
            <span className="hero__slash" data-hero-slash aria-hidden="true" />
          </h1>

          <p className="hero__lede" data-hero-meta>
            A personal operating system that turns real-world work into
            measurable progress. Set real goals, spend real energy, hold real
            streaks — and watch the numbers move only when you do.
          </p>

          <div className="hero__actions" data-hero-meta>
            <button type="button" className="btn btn--primary" ref={ctaRef} onClick={onEnter}>
              <span className="btn__slash" />
              {user ? "Open Your OS" : "Sign In"}
            </button>
            <a className="hero__quiet" href="#way" onClick={goSystem}>
              <span>See the System</span>
              <svg viewBox="0 0 24 24" width="14" aria-hidden="true">
                <path d="M12 3v16M5 13l7 7 7-7" stroke="currentColor" strokeWidth="1.4" fill="none" />
              </svg>
            </a>
          </div>
        </div>

        <div className="hero__art" data-depth="1">
          <div className="hero__plate hero__plate--void wash" data-hero-plate ref={plate}>
            <BlackHole />
            <span className="hero__shine" data-hero-shine aria-hidden="true" />
            <span className="hero__plate-tag label">system build v1.0</span>
            <i className="hero__corner hero__corner--tl" data-hero-corner />
            <i className="hero__corner hero__corner--tr" data-hero-corner />
            <i className="hero__corner hero__corner--bl" data-hero-corner />
            <i className="hero__corner hero__corner--br" data-hero-corner />
          </div>
          <p className="hero__caption label">
            Schwarzschild · 3.0–13.5 r<sub>s</sub> · null geodesics, live <br />
            <span>drag the frame to orbit the singularity</span>
          </p>
        </div>
      </div>

      <div className="hero__foot shell" data-hero-foot>
        {[
          ["Goals / day", "∞"],
          ["Life Factors", "7"],
          ["Growth Ranks", "10"],
          ["Reward", "earned"],
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
