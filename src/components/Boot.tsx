/**
 * Boot.tsx — SITE LOADER (Your Loader)
 *
 * This is now THE official site loader for ShadowQuest.
 * It works in two layers:
 *  1) index.html has #sq-initial-loader with critical CSS that paints instantly
 *     before JS loads — no blank screen, no FOUC.
 *  2) This React component takes over the moment React mounts, animates the
 *     full cinematic sequence (ink aurora, grid, glyphs, ink particles, ensō
 *     draw, halo, flash, kanji slam, progress bar with shimmer, blade exit),
 *     then unmounts.
 *
 * Behavior:
 *  - Session-aware: shows once per tab session (sq.boot.seen.v3)
 *  - Reduced-motion: skips entirely
 *  - Skippable: any pointerdown / keydown fast-forwards
 *  - Safe: never locks scroll inside Capacitor WebView
 *  - Cleans up: removes #sq-initial-loader if still present
 */

import { useEffect, useRef, useState } from "react";
import { drawIn, gsap, REDUCED, scrambleTo, wipeIn } from "../lib/motion";
import { isNativeApp } from "../lib/native";
import { Sigil } from "./Sigil";

const SEEN_KEY = "sq.boot.seen.v3";

const STAGES = [
  "stirring the ink",
  "summoning the shadows",
  "sharpening the blade",
  "aligning the ring",
  "sealing the ledger",
];

const GLYPHS = ["影", "道", "忍", "修", "剣", "円", "気", "心", "武", "印"];

export function Boot({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ensoRef = useRef<SVGSVGElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const ringsRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => {
    try {
      // If initial HTML loader already handled it, or reduced motion, don't show React loader
      const initialGone = !document.getElementById("sq-initial-loader");
      const seen = !!sessionStorage.getItem(SEEN_KEY);
      // If initial loader already removed because it was seen, we also skip
      // If initial loader is still present, we will let React take over and remove it
      if (REDUCED) return false;
      if (initialGone && seen) return false;
      return !REDUCED;
    } catch {
      return !REDUCED;
    }
  });
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* Storage is optional. */
    }
    // Remove initial HTML loader if React is finishing first
    const initial = document.getElementById("sq-initial-loader");
    if (initial) {
      try {
        // @ts-ignore
        if (typeof window.__SQ_EXIT_INITIAL_LOADER === "function") {
          // @ts-ignore
          window.__SQ_EXIT_INITIAL_LOADER();
        } else {
          initial.remove();
        }
      } catch {
        initial.remove();
      }
    }
    setVisible(false);
    document.documentElement.style.overflow = "";
    onDone();
  };

  useEffect(() => {
    if (!visible) {
      finish();
      return;
    }

    // If initial loader still exists, remove it immediately — React now owns the boot
    const initial = document.getElementById("sq-initial-loader");
    if (initial) {
      initial.style.display = "none";
      setTimeout(() => {
        try {
          initial.remove();
        } catch {}
      }, 50);
    }

    const counter = { v: 0 };
    let displayedPercent = -1;
    const setProgress = gsap.quickSetter(fillRef.current, "scaleX");
    const setRingRotation = gsap.quickSetter(ringsRef.current, "rotation", "deg");
    const tl = gsap.timeline({
      defaults: { ease: "brush" },
      onComplete: finish,
    });

    let currentStage = "";
    let stageTween: gsap.core.Tween | undefined;
    const setStage = (s: string) => {
      if (s === currentStage) return;
      currentStage = s;
      stageTween?.kill();
      if (stageRef.current) stageTween = scrambleTo(stageRef.current, s, { duration: 0.18 });
    };

    const ctx = gsap.context(() => {
      tl.add(() => {
        if (!isNativeApp()) document.documentElement.style.overflow = "hidden";
      })
        .fromTo("[data-boot-sky]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0)
        .set("[data-boot-glyph], [data-boot-ink]", { visibility: "visible" }, 0.05)
        .add(
          drawIn(ensoRef.current?.querySelector("path") ?? "", {
            duration: 1.05,
          }),
          0.05,
        )
        .fromTo(
          "[data-boot-halo]",
          { autoAlpha: 0, scale: 0.6 },
          { autoAlpha: 0, scale: 1.6, duration: 1.4, ease: "power2.out" },
          0.15,
        )
        .to(
          counter,
          {
            v: 100,
            duration: 1.55,
            ease: "sine.inOut",
            onUpdate: () => {
              const p = Math.round(counter.v);
              if (numRef.current && displayedPercent !== p) {
                numRef.current.textContent = String(p).padStart(3, "0");
                displayedPercent = p;
              }
              setProgress(counter.v / 100);
              setRingRotation((counter.v / 100) * 240);
              if (p >= 84) setStage(STAGES[4]);
              else if (p >= 64) setStage(STAGES[3]);
              else if (p >= 44) setStage(STAGES[2]);
              else if (p >= 22) setStage(STAGES[1]);
              else setStage(STAGES[0]);
            },
          },
          0.1,
        )
        .fromTo("[data-boot-flash]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, 0.5)
        .fromTo(
          "[data-boot-kanji]",
          {
            clipPath: "inset(0 0 100% 0)",
            autoAlpha: 0,
            scale: 2.1,
          },
          {
            clipPath: "inset(0 0 0% 0)",
            autoAlpha: 1,
            scale: 1,
            duration: 0.75,
            ease: "snap",
          },
          0.52,
        )
        .to("[data-boot-flash]", { autoAlpha: 0, duration: 0.45 }, 0.6)
        .add(wipeIn("[data-boot-line]", { duration: 0.6 }), 0.75)
        .to("[data-boot-copy]", { opacity: 1, duration: 0.5 }, 0.85)
        .to("[data-boot-kanji]", { scale: 1.07, duration: 0.3, ease: "power2.out", transformOrigin: "center" }, 1.5)
        .to("[data-boot-kanji]", { scale: 1, duration: 0.38, ease: "brush" }, 1.8)
        .fromTo("[data-boot-shimmer]", { xPercent: -110 }, { xPercent: 110, duration: 0.85, ease: "power2.inOut" }, 1.75)
        .fromTo(
          "[data-boot-glow]",
          { autoAlpha: 0, scale: 0.92 },
          { autoAlpha: 1, scale: 1.06, duration: 0.4, yoyo: true, repeat: 1, ease: "power2.out" },
          1.85,
        )
        .fromTo("[data-boot-blade]", { scaleX: 0 }, { scaleX: 1, duration: 0.32, ease: "power4.in" }, 1.98)
        .to(
          "[data-boot-panel]",
          {
            yPercent: -101,
            duration: 0.72,
            ease: "power4.inOut",
            stagger: { each: 0.06, from: "start" },
          },
          2.0,
        )
        .to(".boot__inner", { opacity: 0, yPercent: -26, duration: 0.5, ease: "power2.in" }, 2.0)
        .to("[data-boot-sky], .boot__glyphs, .boot__ink, [data-boot-blade]", { opacity: 0, duration: 0.55, ease: "power2.out" }, 2.0)
        .add(() => {
          document.documentElement.style.overflow = "";
        }, 2.0);
    }, rootRef);

    const brand = rootRef.current?.querySelector<HTMLElement>("[data-boot-brand]");
    const brandTween = brand ? scrambleTo(brand, "SHADOWQUEST OS", { duration: 0.7 }) : undefined;
    const safetyTimer = window.setTimeout(finish, 4500);

    const skip = () => {
      tl.timeScale(8);
    };
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });

    // Also listen for initial loader done event — if HTML loader finishes first, React should finish too
    const onInitialDone = () => finish();
    window.addEventListener("sq:initial-loader-done" as any, onInitialDone);

    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("sq:initial-loader-done" as any, onInitialDone);
      window.clearTimeout(safetyTimer);
      stageTween?.kill();
      brandTween?.kill();
      ctx.revert();
      tl.kill();
      document.documentElement.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="boot" ref={rootRef} aria-hidden="true">
      <div className="boot__sky" data-boot-sky>
        <div className="boot__grid" aria-hidden="true" />
        <span className="boot__orb boot__orb--verm" aria-hidden="true" />
        <span className="boot__orb boot__orb--indigo" aria-hidden="true" />
        <span className="boot__orb boot__orb--brass" aria-hidden="true" />
        <span className="boot__scan" aria-hidden="true" />
      </div>

      <div className="boot__glyphs" aria-hidden="true">
        {GLYPHS.map((g, i) => (
          <span
            key={g}
            data-boot-glyph
            style={{ ["--gx" as string]: `${(i % 5) * 19 + 2}%`, ["--gd" as string]: `${(7 + i * 0.7).toFixed(1)}s` }}
          >
            {g}
          </span>
        ))}
      </div>

      <div className="boot__ink" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <i
            key={i}
            data-boot-ink
            style={{
              ["--ix" as string]: `${(i * 7.3 + 3) % 97}%`,
              ["--id" as string]: `${(2.1 + (i % 5) * 0.7).toFixed(1)}s`,
              ["--idl" as string]: `${(i % 4) * 0.45}s`,
            }}
          />
        ))}
      </div>

      <div className="boot__inner">
        <div className="boot__emblem">
          <div className="boot__rings" ref={ringsRef} aria-hidden="true">
            <span className="boot__ring boot__ring--dash" />
            <span className="boot__ring boot__ring--thin" />
          </div>
          <svg className="boot__enso" ref={ensoRef} viewBox="0 0 120 120" fill="none">
            <path
              d="M60 10 C 88 10, 110 32, 110 60 C 110 88, 88 110, 60 110 C 32 110, 10 88, 10 60 C 10 36, 27 16, 48 11"
              stroke="var(--bone-300)"
              strokeWidth={5}
              strokeLinecap="round"
            />
          </svg>
          <span className="boot__halo" data-boot-halo aria-hidden="true" />
          <span className="boot__flash" data-boot-flash aria-hidden="true" />
          <span className="boot__glow" data-boot-glow aria-hidden="true" />
          <div className="boot__kanji" data-boot-kanji>
            <Sigil size="100%" />
          </div>
        </div>

        <div className="boot__meta">
          <span className="label" data-boot-brand>
            SHADOWQUEST OS
          </span>
          <span className="boot__num num" ref={numRef}>
            000
          </span>
        </div>
        <div className="boot__bar" data-boot-line>
          <span ref={fillRef} />
          <i data-boot-shimmer aria-hidden="true" />
        </div>
        <span className="boot__stage num" ref={stageRef}>
          {STAGES[0]}
        </span>
        <p className="boot__copy" data-boot-copy>
          Real action. Real progress. Real growth.
        </p>
      </div>

      <span className="boot__blade" data-boot-blade aria-hidden="true" />

      {[0, 1, 2, 3, 4].map((i) => (
        <div className="boot__panel" data-boot-panel key={i} />
      ))}
    </div>
  );
}
