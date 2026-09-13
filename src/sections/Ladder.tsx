/**
 * Ladder.tsx — the only section whose copy is not authored: it is whatever
 * the leaderboard endpoint returned, including its failures. Loading is an
 * ink rule drawing itself, and an error is shown instead of being swallowed.
 *
 * The rows are real operators read from the backend — no demonstration
 * profiles. When the backend cannot be reached the ladder says so instead
 * of inventing anyone.
 */
import { useEffect, useRef } from "react";
import { fetchLeaderboard } from "../api/ledger";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";
import { useResource } from "../hooks/useApi";
import type { LeaderRow } from "../api/types";

async function loadLadder(): Promise<{ rows: LeaderRow[]; live: boolean }> {
  const { rows, live } = await fetchLeaderboard();
  if (!live) throw new Error("the ladder is offline — the backend did not answer");
  return { rows, live };
}

export function Ladder() {
  const root = useRef<HTMLElement>(null);
  const { data, loading, error, reload } = useResource(loadLadder);
  const rows = data?.rows ?? [];
  const live = data?.live ?? false;
  useReveals(root, [rows.length]);

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
            <p className="label ladder__tag">05 — milestones</p>
            <h2 className="ladder__title" data-rv="brush">
              Real growth, recorded.
            </h2>
          </div>
          <p className="ladder__lede">
            Goals completed, Consistency streaks held, and the focus each Achiever
            brings to their work. Nothing else is ranked, so nothing else is gamed.
            {live && (
              <em className="ladder__mock ladder__mock--live">
                {" "}
                — live ladder · real operators, ranked by recorded progress.
              </em>
            )}
          </p>
        </header>

        {error ? (
          <div className="ladder__error">
            <p className="label">milestones unreachable</p>
            <p className="ladder__err-msg">{error}</p>
            <button className="btn" type="button" onClick={reload}>
              <span className="btn__slash" />
              Retry
            </button>
          </div>
        ) : (
          <div className="ladder__wrap" data-vel>
          <table className="ladder__table">
            <caption className="sr-only">Achiever Milestones</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Achiever</th>
                <th scope="col">Focus Area</th>
                <th scope="col" className="is-num">
                  Goals
                </th>
                <th scope="col" className="is-num">
                  Level
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
                    <td className="is-num num">{r.level ?? Math.floor(r.wins / 20) + 1}</td>
                    <td className="is-num num ladder__streak">
                      {r.streak}
                      <span className="ladder__flame" aria-hidden="true" style={{ opacity: Math.min(1, r.streak / 25) }} />
                    </td>
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr className="ladder__row ladder__row--empty">
                  <td colSpan={6}>No milestones yet. Complete your first Goal to appear.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}

        <span className="ladder__rule" aria-hidden="true" />
      </div>
    </section>
  );
}
