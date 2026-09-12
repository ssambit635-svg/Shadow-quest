/**
 * Way.tsx — the manifesto, as a spine.
 *
 * The left column sticks while the principles scroll past it, and the vertical
 * rule between them fills with ink against scroll position: the only progress
 * indicator on the page that isn't decorative.
 */
import { useEffect, useRef } from "react";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";
import { SamuraiMark } from "../components/SamuraiMark";

const PRINCIPLES = [
  {
    n: "01",
    kanji: "一",
    title: "One exchange",
    body: "Commit before the clock empties, or the field commits for you. A missed turn is spent guarding — it is not free, and it is not rare enough to matter twice.",
  },
  {
    n: "02",
    kanji: "読",
    title: "Read, then cut",
    body: "Every shadow telegraphs two beats early: weight shifts to the back foot before a riposte, the hand drifts to the obi before a technique. The information is always on screen. Nobody is rolling dice at you.",
  },
  {
    n: "03",
    kanji: "息",
    title: "Ki is a budget",
    body: "Techniques cost forty-two. Guarding returns twenty-six. That is the entire economy of a duel — you are choosing, every turn, between the cut you want and the one you can pay for.",
  },
  {
    n: "04",
    kanji: "残",
    title: "Zanshin",
    body: "The posture held after the cut. The duel ends when the blade is sheathed, not when the numbers hit zero — so the last turn of a won round is still a turn you must take seriously.",
  },
];

export function Way() {
  const root = useRef<HTMLElement>(null);
  const spine = useRef<HTMLSpanElement>(null);
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
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <section className="way section" id="way" ref={root}>
      <div className="shell way__grid">
        <div className="way__aside">
          <p className="label way__tag">第一 — the way</p>
          <h2 className="way__title" data-rv="brush">
            Four rules, because four is enough.
          </h2>
          <SamuraiMark className="way__mark" size={128} blade inked />
          <p className="way__note">
            The system is small on purpose. Depth in Shadow Quest comes from the
            opponent, not from a menu you have to memorise.
          </p>
        </div>

        <div className="way__spine" aria-hidden="true">
          <span className="way__rule" />
          <span className="way__rule-fill" ref={spine} />
        </div>

        <ol className="way__list">
          {PRINCIPLES.map((p) => (
            <li className="way__item" key={p.n} data-rv="rise" data-rv-group="way">
              <span className="way__num num">{p.n}</span>
              <div className="way__body">
                <h3 className="way__h">
                  <span className="way__kanji kanji">{p.kanji}</span>
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
