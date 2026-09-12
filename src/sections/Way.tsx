/**
 * Way.tsx — the manifesto, as a spine.
 *
 * The left column sticks while the principles scroll past it, and the vertical
 * rule between them fills with ink against scroll position — with a bead that
 * travels the spine so the fill has a head, not just a tail.
 */
import { useEffect, useRef } from "react";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";

const PRINCIPLES = [
  {
    n: "01",
    title: "Show up daily",
    body: "Small, consistent actions compound into real growth. A goal you avoid is Progress you never earn — the system does not judge; it simply reflects what you did today.",
  },
  {
    n: "02",
    title: "Focus, then execute",
    body: "Every task is a choice about where your Energy goes. Priorities are visible, deadlines are honest, and difficulty is real — plan your Focus Areas before you spend the day.",
  },
  {
    n: "03",
    title: "Energy is a budget",
    body: "Hard tasks cost Energy; deep work restores Discipline; rest refills Wellness. You are choosing, every day, between the goal you want and the energy you have to give it.",
  },
  {
    n: "04",
    title: "Follow through",
    body: "Growth does not stop when the checkbox fills. The posture after completion — reflection, reward, rest — is what turns a finished task into a lasting upgrade to yourself.",
  },
];

export function Way() {
  const root = useRef<HTMLElement>(null);
  const spine = useRef<HTMLSpanElement>(null);
  const bead = useRef<HTMLSpanElement>(null);
  useReveals(root);

  useEffect(() => {
    if (REDUCED || !spine.current) return;
    const tween = gsap.fromTo(
      spine.current,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        transformOrigin: "top center",
        scrollTrigger: {
          trigger: root.current,
          start: "top 60%",
          end: "bottom 75%",
          scrub: 0.4,
        },
      },
    );
    // The bead rides the head of the fill — the spine is being *drawn*.
    const ride = gsap.fromTo(
      bead.current,
      { top: "0%" },
      {
        top: "100%",
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top 60%",
          end: "bottom 75%",
          scrub: 0.4,
        },
      },
    );
    // The aside plate parallaxes gently against the list.
    const drift = gsap.to("[data-way-plate] img", {
      yPercent: -10,
      ease: "none",
      scrollTrigger: {
        trigger: root.current,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.7,
      },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      ride.scrollTrigger?.kill();
      ride.kill();
      drift.scrollTrigger?.kill();
      drift.kill();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <section className="way section" id="way" ref={root}>
      <div className="shell way__grid">
        <div className="way__aside">
          <p className="label way__tag">02 — the system</p>
          <h2 className="way__title" data-rv="brush">
            Four principles of real growth.
          </h2>
          <figure className="way__plate" data-way-plate data-rv="bleed">
            <img
              src="/img/duel-wide.jpg"
              alt="Focused workspace with warm cinematic light"
              loading="lazy"
              style={{ filter: "contrast(1.05) saturate(0.6) hue-rotate(-10deg)" }}
            />
            <figcaption className="label">the workspace, before the first task</figcaption>
          </figure>
          <p className="way__note">
            The system is small on purpose. Depth in ShadowQuest comes from your
            real life, not from a menu tree you have to memorise.
          </p>
        </div>

        <div className="way__spine" aria-hidden="true">
          <span className="way__rule" />
          <span className="way__rule-fill" ref={spine} />
          <span className="way__bead" ref={bead} />
        </div>

        <ol className="way__list">
          {PRINCIPLES.map((p) => (
            <li className="way__item" key={p.n} data-rv="rise" data-rv-group="way">
              <span className="way__num num">{p.n}</span>
              <div className="way__body">
                <h3 className="way__h">
                  <span className="way__glyph num" aria-hidden="true">
                    {p.n}
                  </span>
                  {p.title}
                </h3>
                <p className="way__text">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
