/**
 * Outro.tsx — the closing stroke: a single brush plate drawing itself under a
 * line of type, then the site ends. No newsletter, no "stay in the loop".
 */
import { useEffect, useRef } from "react";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";
import { SamuraiMark } from "../components/SamuraiMark";

export function Outro({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  useReveals(root);

  useEffect(() => {
    if (REDUCED) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".outro__mark .mark__stroke",
        { drawSVG: "0% 0%" },
        {
          drawSVG: "100% 0%",
          duration: 1.4,
          stagger: 0.06,
          ease: "steel",
          scrollTrigger: { trigger: root.current, start: "top 60%", once: true },
        },
      );
      // The huge type slides up against the mark, both on the same curve.
      gsap.fromTo(
        ".outro__word",
        { yPercent: 112 },
        {
          yPercent: 0,
          duration: 1.2,
          ease: "brush",
          stagger: 0.08,
          scrollTrigger: { trigger: root.current, start: "top 62%", once: true },
        },
      );
    }, root);
    return () => {
      ctx.revert();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <section className="outro section" ref={root}>
      <div className="shell outro__grid">
        <div className="outro__mark">
          <SamuraiMark size={210} inked blade />
        </div>

        <h2 className="outro__type">
          <span className="rv-line">
            <span className="outro__word">The ford</span>
          </span>
          <span className="rv-line">
            <span className="outro__word outro__word--em">is open.</span>
          </span>
        </h2>

        <div className="outro__actions" data-rv="rise">
          <button className="btn btn--primary" type="button" onClick={onEnter}>
            <span className="btn__slash" />
            Take the field
          </button>
          <a className="btn" href="#roster">
            Choose another shadow
          </a>
        </div>
      </div>

      <footer className="outro__foot shell">
        <p className="label">Shadow Quest — 影の道</p>
        <p className="label">built for the duel, not the feed</p>
        <p className="label num">MMXXVI · season of the ford</p>
      </footer>
    </section>
  );
}
