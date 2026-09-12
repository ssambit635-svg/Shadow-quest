/**
 * Outro.tsx — no magnetic, Eurostile.
 */
import { useEffect, useRef } from "react";
import { gsap, REDUCED, ScrollTrigger, wipeIn } from "../lib/motion";
import { useReveals } from "../lib/reveal";

export function Outro({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  useReveals(root);

  useEffect(() => {
    if (REDUCED) return;
    const ctx = gsap.context(() => {
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
      const plateTl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top 62%", once: true },
      });
      plateTl
        .add(wipeIn(".outro__plate", { duration: 1.1 }), 0.1)
        .fromTo(
          ".outro__plate img",
          { scale: 1.18 },
          { scale: 1, duration: 1.6, ease: "brush" },
          0.1,
        )
        .fromTo(
          ".outro__plate-tag",
          { opacity: 0, x: -12 },
          { opacity: 1, x: 0, duration: 0.6, ease: "snap" },
          0.9,
        );
      gsap.to(".outro__plate", {
        yPercent: -10,
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top bottom",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });
    }, root);
    return () => {
      ctx.revert();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <section className="outro section" ref={root}>
      <div className="shell outro__grid">
        <figure className="outro__plate" aria-hidden="true">
          <img src="/img/ink-wash.jpg" alt="" loading="lazy" />
          <figcaption className="outro__plate-tag label">the last page — Eurostile</figcaption>
        </figure>

        <h2 className="outro__type">
          <span className="rv-line">
            <span className="outro__word">The ford</span>
          </span>
          <span className="rv-line">
            <span className="outro__word outro__word--em">is open.</span>
          </span>
        </h2>

        <div className="outro__actions" data-rv="rise">
          <button className="btn btn--primary" type="button" onClick={onEnter} ref={ctaRef}>
            <span className="btn__slash" />
            Take the field
          </button>
          <a className="btn" href="#roster">
            Choose another shadow
          </a>
        </div>
      </div>

      <footer className="outro__foot shell">
        <p className="label">Shadow Quest — Season of the Ford</p>
        <p className="label">built for the duel, not the feed</p>
        <p className="label num">MMXXVI · Eurostile · ink bloom</p>
      </footer>
    </section>
  );
}
