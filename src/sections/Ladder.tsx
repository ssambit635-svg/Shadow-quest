/**
 * Ladder.tsx — the only section whose copy is not authored: it is whatever
 * `GET /v1/leaderboard` returned, including its failures. Loading is an ink
 * rule drawing itself, and an error is shown instead of being swallowed.
 */
import { useEffect, useRef } from "react";
import { api, IS_MOCK } from "../api";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useResource } from "../hooks/useApi";

const loadLadder = () => api.leaderboard();

export function Ladder() {
  const root = useRef<HTMLElement>(null);
  const { data, loading, error, reload } = useResource(loadLadder);
  const rows = data ?? [];

  // Rows arrive as one sweep down the table, then the hairline settles.
  useEffect(() => {
    if (REDUCED || !rows.length) return;
    const ctx = gsap.context(() => {
      const trs = gsap.utils.toArray<HTMLElement>(".ladder__row");
      gsap.fromTo(
        trs,
        { yPercent: 60, autoAlpha: 0 },
        {
          yPercent: 0,
          autoAlpha: 1,
          duration: 0.8,
          ease: "brush",
          stagger: 0.06,
          clearProps: "all",
          scrollTrigger: { trigger: root.current, start: "top 70%", once: true },
        },
      );
    }, root);
    return () => ctx.revert();
  }, [rows.length]);

  useEffect(() => {
    // The bar under the table is drawn, not painted: one stroke, left to right.
    const bar = root.current?.querySelector<HTMLElement>(".ladder__rule");
    if (!bar || REDUCED) return;
    const t = gsap.fromTo(
      bar,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: "snap",
        transformOrigin: "left center",
        scrollTrigger: { trigger: bar, start: "top 90%", once: true },
      },
    );
    return () => {
      t.scrollTrigger?.kill();
      t.kill();
      ScrollTrigger.refresh();
    };
  }, [rows.length]);

  return (
    <section className="ladder section" id="ladder" ref={root} data-tone="paper">
      <div className="shell">
        <header className="ladder__head">
          <div>
            <p className="label ladder__tag">第四 — the ladder</p>
            <h2 className="ladder__title">Kept on one number.</h2>
          </div>
          <p className="ladder__lede">
            Wins, losses, and the longest run you held before someone read you.
            Nothing else is ranked, so nothing else is farmed.
            {IS_MOCK && (
              <em className="ladder__mock">
                {" "}
                — these six rows are the in-page engine’s, not the live ladder’s.
              </em>
            )}
          </p>
        </header>

        {error ? (
          <div className="ladder__error">
            <p className="label">ladder unreachable</p>
            <p className="ladder__err-msg">{error}</p>
            <button className="btn" type="button" onClick={reload}>
              <span className="btn__slash" />
              Ask again
            </button>
          </div>
        ) : (
          <table className="ladder__table">
            <caption className="sr-only">Current ladder standings</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Handle</th>
                <th scope="col">School</th>
                <th scope="col" className="is-num">
                  W
                </th>
                <th scope="col" className="is-num">
                  L
                </th>
                <th scope="col" className="is-num">
                  Streak
                </th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr className="ladder__row ladder__row--sk" key={`sk-${i}`}>
                    <td colSpan={6}>
                      <span className="sk sk--row" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                rows.map((r) => (
                  <tr className="ladder__row" key={r.rank}>
                    <td className="is-num ladder__rank num">{String(r.rank).padStart(2, "0")}</td>
                    <td className="ladder__handle">{r.handle}</td>
                    <td className="ladder__school">{r.school}</td>
                    <td className="is-num num">{r.wins}</td>
                    <td className="is-num num">{r.losses}</td>
                    <td className="is-num num ladder__streak">
                      {r.streak}
                      <span className="ladder__flame" aria-hidden="true" style={{ opacity: Math.min(1, r.streak / 25) }} />
                    </td>
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr className="ladder__row ladder__row--empty">
                  <td colSpan={6}>No ranked duels recorded. The first one is open.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <span className="ladder__rule" aria-hidden="true" />
      </div>
    </section>
  );
}
