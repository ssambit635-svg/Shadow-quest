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
  "一期一会 — one time, one meeting",
  "no respawns",
  "残心 — hold the posture after the cut",
  "best of one",
  "read the breath",
  "影 · 鬼 · 雀 · 墨 · 鉄 · 暗",
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
      vel = vel * 0.9 + Math.abs(y - last) * 0.1;
      last = y;
      gsap.to(drive, {
        timeScale: 1 + Math.min(vel, 40) / 16,
        duration: 0.5,
        ease: "power2.out",
        overwrite: "auto",
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Pause the loop when the strip is off-screen: no invisible work.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? drive.play() : drive.pause()),
      { threshold: 0 },
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
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
