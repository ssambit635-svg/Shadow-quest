/**
 * Boot.tsx — the curtain, upgraded.
 *
 * An ensō inks itself, the 影 arrives on a vermilion slash, a stage line
 * decodes through the warm-up ("stirring the ink" → "sharpening the blade"
 * → "aligning the ring") while a thin progress line tracks the count, then
 * the paper lifts in three unequal panels. Under three seconds, skippable,
 * and skipped entirely for anyone who has already seen it this session.
 */
import { useEffect, useRef, useState } from "react";
import { drawIn, gsap, REDUCED, scrambleTo, wipeIn } from "../lib/motion";

const SEEN_KEY = "sq.boot.seen";

const STAGES = [
  "stirring the ink",
  "sharpening the blade",
  "aligning the ring",
];

export function Boot({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ensoRef = useRef<SVGSVGElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(
    () => !sessionStorage.getItem(SEEN_KEY) && !REDUCED,
  );
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    sessionStorage.setItem(SEEN_KEY, "1");
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
    const tl = gsap.timeline({
      defaults: { ease: "brush" },
      onComplete: finish,
    });

    // Stage line decodes in, then swaps words on the counter's way up.
    const setStage = (s: string) => {
      if (stageRef.current) scrambleTo(stageRef.current, s, { duration: 0.4 });
    };

    tl
      .add(() => {
        document.documentElement.style.overflow = "hidden";
      })
      // 1 — the circle is pulled in one breath.
      .add(
        drawIn(ensoRef.current?.querySelector("path") ?? "", {
          duration: 1.15,
        }),
        0,
      )
      // 2 — digits as instrumentation, and the line tracks them.
      .to(
        counter,
        {
          v: 100,
          duration: 1.35,
          ease: "power1.in",
          onUpdate: () => {
            const p = Math.round(counter.v);
            if (numRef.current) {
              numRef.current.textContent = String(p).padStart(3, "0");
            }
            if (fillRef.current) gsap.set(fillRef.current, { scaleX: p / 100 });
            // The warm-up has three beats, announced by the decode line.
            if (p >= 72) setStage(STAGES[2]);
            else if (p >= 36) setStage(STAGES[1]);
          },
        },
        0.1,
      )
      .fromTo(
        "[data-boot-kanji]",
        { clipPath: "inset(0 0 100% 0)", opacity: 0 },
        { clipPath: "inset(0 0 0% 0)", opacity: 1, duration: 0.85, ease: "snap" },
        0.5,
      )
      .add(wipeIn("[data-boot-line]", { duration: 0.7 }), 0.8)
      .to("[data-boot-copy]", { opacity: 1, duration: 0.5 }, 0.9)
      // The mark takes one breath before the curtain lifts.
      .to(
        "[data-boot-kanji]",
        { scale: 1.07, duration: 0.32, ease: "power2.out", transformOrigin: "center" },
        1.55,
      )
      .to("[data-boot-kanji]", { scale: 1, duration: 0.4, ease: "brush" }, 1.87)
      // 3 — curtain leaves upward in three unequal panels: a page turn, not a fade.
      .to(
        "[data-boot-panel]",
        {
          yPercent: -101,
          duration: 0.8,
          ease: "power4.inOut",
          stagger: { each: 0.07, from: "start" },
        },
        1.95,
      )
      .to(
        ".boot__inner",
        { opacity: 0, yPercent: -34, duration: 0.5, ease: "power2.in" },
        1.95,
      )
      .to(rootRef.current, { pointerEvents: "none", duration: 0.01 }, 1.95)
      .add(() => {
        document.documentElement.style.overflow = "";
      }, 1.95);

    // The stage line's first word + the brand decode in with the kanji.
    gsap.delayedCall(0.55, () => setStage(STAGES[0]));
    const brand = rootRef.current?.querySelector<HTMLElement>("[data-boot-brand]");
    if (brand) scrambleTo(brand, "SHADOWQUEST OS", { duration: 0.7 });

    // Any input dismisses it. A curtain that can't be skipped is a captive audience.
    const skip = () => {
      tl.timeScale(6);
    };
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });

    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      tl.kill();
      document.documentElement.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="boot" ref={rootRef} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="boot__panel" data-boot-panel key={i} />
      ))}
      <div className="boot__inner">
        <svg className="boot__enso" ref={ensoRef} viewBox="0 0 120 120" fill="none">
          <path
            d="M60 10 C 88 10, 110 32, 110 60 C 110 88, 88 110, 60 110 C 32 110, 10 88, 10 60 C 10 36, 27 16, 48 11"
            stroke="var(--bone-300)"
            strokeWidth={5}
            strokeLinecap="round"
          />
        </svg>

        <div className="boot__kanji" data-boot-kanji>
          影
        </div>

        <div className="boot__meta">
          <span className="label" data-boot-brand>
            SHADOWQUEST OS
          </span>
          <span className="boot__num num" ref={numRef}>
            000
          </span>
        </div>
        <div className="boot__line" data-boot-line>
          <span ref={fillRef} />
        </div>
        <span className="boot__stage num" ref={stageRef}>
          {STAGES[0]}
        </span>
        <p className="boot__copy" data-boot-copy>
          Real action. Real progress. Real growth.
        </p>
      </div>
    </div>
  );
}
