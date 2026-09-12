/**
 * Ticker.tsx — the ink rule between screens. The run is duplicated exactly
 * once, so looping xPercent 0 → -50 is seamless with no wrapping maths.
 *
 * Its speed is driven by scroll velocity: the marquee only feels alive while
 * you are actually moving through the page, and settles when you stop.
 */
import { useEffect, useRef } from "react";
import { gsap, REDUCED } from "../lib/motion";

const PHRASES = [
  "real action · real growth",
  "show up every day",
  "discipline compounds",
  "energy is a budget",
  "focus is a skill",
  "knowledge · focus · discipline · strength · energy · wellness · skills",
];

export function Ticker({ tone = "ink" }: { tone?: "ink" | "bone" }) {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el || REDUCED) return;

    const drive = gsap.to(el, {
      xPercent: -50,
      ease: "none",
      duration: 34,
      repeat: -1,
    });

    let raf = 0;
    let last = window.scrollY;
    let vel = 0;
    const tick = () => {
      const y = window.scrollY;
      const dy = y - last;
      vel = vel * 0.9 + Math.abs(dy) * 0.1;
      last = y;
      gsap.to(drive, {
        timeScale: 1 + Math.min(vel, 40) / 16,
        duration: 0.5,
        ease: "power2.out",
        overwrite: "auto",
      });
      // Velocity skew: the strip leans into fast scrolls, then straightens.
      gsap.to(el, {
        skewX: gsap.utils.clamp(-14, 14, dy * -0.55),
        duration: 0.4,
        ease: "power2.out",
        overwrite: "auto",
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Hovering the strip holds it still so a phrase can actually be read.
    const hold = () => drive.pause();
    const release = () => drive.play();
    el.addEventListener("pointerenter", hold, { passive: true });
    el.addEventListener("pointerleave", release, { passive: true });

    // Pause the loop when the strip is off-screen: no invisible work.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? drive.play() : drive.pause()),
      { threshold: 0 },
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerleave", release);
      drive.kill();
    };
  }, []);

  const run = [...PHRASES, ...PHRASES];

  return (
    <div className="ticker" data-tone={tone} aria-hidden="true">
      <div className="ticker__track" ref={track}>
        {run.map((p, i) => (
          <span className="ticker__item" key={i}>
            {p}
            <i className="ticker__dot" />
          </span>
        ))}
      </div>
    </div>
  );
}
