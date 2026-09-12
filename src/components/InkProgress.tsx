/**
 * InkProgress.tsx — replaces the basic red line with an ink-bloom scroll progress.
 * High-level GSAP: ScrollTrigger drives a proxy, which drives:
 *  - scaleX of the fill
 *  - turbulence baseFrequency for bleeding edge
 *  - bloom head scale + opacity
 *  - ink wash image reveal with displacement
 */
import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "../lib/motion";

export function InkProgress() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const wash = washRef.current;
    const bloom = bloomRef.current;
    const dot = dotRef.current;
    const turb = turbRef.current;
    const root = rootRef.current;
    if (!fill || !wash || !bloom || !dot || !root) return;

    // Initial state
    gsap.set(fill, { scaleX: 0, transformOrigin: "left center" });
    gsap.set(bloom, { scale: 0.6, opacity: 0 });
    gsap.set(dot, { scale: 0.8 });

    const proxy = { p: 0, v: 0 };
    let lastP = 0;
    let lastT = performance.now();

    const st = ScrollTrigger.create({
      start: 0,
      end: () => ScrollTrigger.maxScroll(window),
      onUpdate(self) {
        const now = performance.now();
        const dt = Math.max(16, now - lastT);
        const dp = self.progress - lastP;
        const vel = Math.abs(dp) / (dt / 1000); // velocity
        lastP = self.progress;
        lastT = now;

        // Smooth proxy
        gsap.to(proxy, {
          p: self.progress,
          v: vel,
          duration: 0.35,
          ease: "power3.out",
          overwrite: "auto",
          onUpdate: () => {
            gsap.set(fill, { scaleX: proxy.p });

            // Ink wash blooms slightly beyond fill with displacement
            gsap.set(wash, {
              xPercent: 0,
              scaleX: 1 + proxy.v * 0.08,
              transformOrigin: "left center",
            });

            // Bloom head rides the edge
            const headScale = 0.8 + proxy.p * 0.6 + proxy.v * 2.5;
            gsap.set(bloom, {
              scale: headScale,
              opacity: proxy.p > 0.01 ? 0.9 : 0,
            });
            gsap.set(dot, {
              scale: 0.9 + proxy.v * 3,
            });

            // Turbulence — edge bleeds more when scrolling fast
            if (turb) {
              const freq = 0.008 + proxy.v * 0.04 + proxy.p * 0.01;
              turb.setAttribute("baseFrequency", `${freq.toFixed(4)} ${ (freq * 6).toFixed(4)}`);
            }
          },
        });

        // Root opacity: hide at top
        gsap.to(root, {
          autoAlpha: self.progress > 0.001 ? 1 : 0,
          duration: 0.3,
          ease: "power2.out",
          overwrite: "auto",
        });
      },
    });

    // Entrance: ink line draws once on load
    gsap.fromTo(
      root,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.8, ease: "brush", delay: 1.2 },
    );

    return () => {
      st.kill();
    };
  }, []);

  return (
    <div className="ink-progress" ref={rootRef} aria-hidden="true">
      <div className="ink-progress__track" />
      <div className="ink-progress__fill" ref={fillRef}>
        <div className="ink-progress__wash" ref={washRef} style={{ filter: "url(#ink-bloom-filter)" }} />
        <div className="ink-progress__head">
          <span className="ink-progress__bloom" ref={bloomRef} />
          <span className="ink-progress__dot" ref={dotRef} />
          {/* secondary bloom for depth */}
          <span className="ink-progress__bloom ink-progress__bloom--2" />
        </div>
      </div>

      {/* SVG filter for ink bleed edge */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="ink-bloom-filter" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence
              ref={turbRef as any}
              type="fractalNoise"
              baseFrequency="0.012 0.08"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" result="disp" />
            <feGaussianBlur in="disp" stdDeviation="0.6" result="blur" />
            <feComponentTransfer in="blur" result="final">
              <feFuncA type="discrete" tableValues="0 1" />
            </feComponentTransfer>
          </filter>

          <radialGradient id="bloom-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--vermilion-lit)" stopOpacity="1" />
            <stop offset="35%" stopColor="var(--vermilion)" stopOpacity="0.8" />
            <stop offset="75%" stopColor="var(--vermilion-deep)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--vermilion-deep)" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
