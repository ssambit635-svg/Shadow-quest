/**
 * Boot.tsx — the curtain, fully unleashed.
 *
 * The loader is now a short film: an ink aurora breathes behind a drifting
 * grid, stray kanji float past like embers, ink particles rise, the ensō
 * draws itself inside two counter-rotating rings while the counter scrambles
 * 000→100 through five warm-up stages, the mark slams in on a vermilion flash,
 * the progress bar fills with a shimmer sweep — and the curtain leaves
 * upward in five panels behind a blade line. Under three seconds, skippable
 * by any input, skipped entirely for reduced-motion users and for anyone who
 * has already seen it this session.
 *
 * Everything that loops is CSS: when the curtain unmounts, the loops die
 * with it — no rAF chains survive the boot.
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
  const [visible, setVisible] = useState(
    () => {
      try { return !sessionStorage.getItem(SEEN_KEY) && !REDUCED; }
      catch { return !REDUCED; }
    },
  );
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* Storage is optional. */ }
    setVisible(false);
    // The curtain locks the document for the length of its own run. Every way
    // out of it — the last frame, a skip, an unmount — has to hand the scroll
    // back: an inline `overflow: hidden` left on <html> is invisible to the eye
    // (the curtain is gone and every tap still lands) and freezes the page
    // under a thumb. Belt and braces with the timeline's own unlock.
    document.documentElement.style.overflow = "";
    onDone();
  };

  useEffect(() => {
    if (!visible) {
      finish();
      return;
    }

    const counter = { v: 0 };
    let displayedPercent = -1;
    const setProgress = gsap.quickSetter(fillRef.current, "scaleX");
    const setRingRotation = gsap.quickSetter(ringsRef.current, "rotation", "deg");
    const tl = gsap.timeline({
      defaults: { ease: "brush" },
      onComplete: finish,
    });

    // Stage line decodes in, then swaps words on the counter's way up.
    let currentStage = "";
    let stageTween: gsap.core.Tween | undefined;
    const setStage = (s: string) => {
      if (s === currentStage) return;
      currentStage = s;
      stageTween?.kill();
      if (stageRef.current) stageTween = scrambleTo(stageRef.current, s, { duration: 0.18 });
    };

    const ctx = gsap.context(() => {
      tl
        .add(() => {
          // Never lock <html> inside the APK WebView. An inline overflow:hidden
          // that fails to clear (skip, unmount, sessionStorage hiccup) freezes
          // the whole document under a thumb. The curtain is position:fixed and
          // already eats the screen; it does not need the lock.
          if (!isNativeApp()) document.documentElement.style.overflow = "hidden";
        })
        // 0 — the atmosphere fades up: aurora, grid, glyphs, ink.
        .fromTo(
          "[data-boot-sky]",
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.6 },
          0,
        )
        // CSS alone owns particle transforms/opacity; GSAP only reveals them.
        .set("[data-boot-glyph], [data-boot-ink]", { visibility: "visible" }, 0.05)
        // 1 — the ensō pulls itself in one breath, and a halo echoes out.
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
        // 2 — the counter, the rings and the bar are one instrument.
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
              // Smooth sub-percent movement without allocating two tweens per frame.
              setProgress(counter.v / 100);
              setRingRotation((counter.v / 100) * 240);
              // The warm-up has five beats, announced by the decode line.
              if (p >= 84) setStage(STAGES[4]);
              else if (p >= 64) setStage(STAGES[3]);
              else if (p >= 44) setStage(STAGES[2]);
              else if (p >= 22) setStage(STAGES[1]);
              else setStage(STAGES[0]);
            },
          },
          0.1,
        )
        // 3 — the mark slams in on a vermilion flash.
        .fromTo(
          "[data-boot-flash]",
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.05 },
          0.5,
        )
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
        // The mark takes one breath before the curtain lifts.
        .to(
          "[data-boot-kanji]",
          { scale: 1.07, duration: 0.3, ease: "power2.out", transformOrigin: "center" },
          1.5,
        )
        .to("[data-boot-kanji]", { scale: 1, duration: 0.38, ease: "brush" }, 1.8)
        // 4 — the bar completes: shimmer sweep + a glow pulse.
        .fromTo(
          "[data-boot-shimmer]",
          { xPercent: -110 },
          { xPercent: 110, duration: 0.85, ease: "power2.inOut" },
          1.75,
        )
        .fromTo(
          "[data-boot-glow]",
          { autoAlpha: 0, scale: 0.92 },
          { autoAlpha: 1, scale: 1.06, duration: 0.4, yoyo: true, repeat: 1, ease: "power2.out" },
          1.85,
        )
        // 5 — curtain leaves upward in five panels, behind a blade line.
        .fromTo(
          "[data-boot-blade]",
          { scaleX: 0 },
          { scaleX: 1, duration: 0.32, ease: "power4.in" },
          1.98,
        )
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
        .to(
          ".boot__inner",
          { opacity: 0, yPercent: -26, duration: 0.5, ease: "power2.in" },
          2.0,
        )
        .to("[data-boot-sky], .boot__glyphs, .boot__ink, [data-boot-blade]",
          { opacity: 0, duration: 0.55, ease: "power2.out" }, 2.0)
        .add(() => {
          document.documentElement.style.overflow = "";
        }, 2.0);
    }, rootRef);

    // The stage line's first word + the brand decode in with the kanji.
    const brand = rootRef.current?.querySelector<HTMLElement>("[data-boot-brand]");
    const brandTween = brand ? scrambleTo(brand, "SHADOWQUEST OS", { duration: 0.7 }) : undefined;
    const safetyTimer = window.setTimeout(finish, 4500);

    // Any input dismisses it. A curtain that can't be skipped is a captive audience.
    const skip = () => {
      tl.timeScale(8);
    };
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });

    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
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
      {/* the atmosphere */}
      <div className="boot__sky" data-boot-sky>
        <div className="boot__grid" aria-hidden="true" />
        <span className="boot__orb boot__orb--verm" aria-hidden="true" />
        <span className="boot__orb boot__orb--indigo" aria-hidden="true" />
        <span className="boot__orb boot__orb--brass" aria-hidden="true" />
        <span className="boot__scan" aria-hidden="true" />
      </div>

      {/* stray kanji, drifting like embers */}
      <div className="boot__glyphs" aria-hidden="true">
        {GLYPHS.map((g, i) => (
          <span key={g} data-boot-glyph style={{ ["--gx" as string]: `${(i % 5) * 19 + 2}%`, ["--gd" as string]: `${(7 + i * 0.7).toFixed(1)}s` }}>
            {g}
          </span>
        ))}
      </div>

      {/* rising ink */}
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

      {/* the stage */}
      <div className="boot__inner">
        <div className="boot__emblem">
          {/* only the rings rotate — the ensō and the mark stay upright */}
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

      {/* the blade that cuts the curtain open */}
      <span className="boot__blade" data-boot-blade aria-hidden="true" />

      {[0, 1, 2, 3, 4].map((i) => (
        <div className="boot__panel" data-boot-panel key={i} />
      ))}
    </div>
  );
}
