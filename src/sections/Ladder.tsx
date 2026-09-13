/**
 * Ladder.tsx — "Milestones": the ladder of real operators, ranked by the
 * progress they actually recorded. Nothing here is authored or seeded.
 *
 * It prefers the backend (`GET /v1/leaderboard`). When the backend is away
 * the section **degrades instead of failing** — the same contract the stats
 * board keeps: the operator's own milestones are read from this device's
 * ledger and the header badge says *device copy*, so the numbers are still
 * real and still honest about where they came from.
 *
 * That matters because "the API is not running" is a deployment state, not a
 * data failure: this screen used to throw on it and paint a red
 * "milestones unreachable" block over a page that had nothing wrong with the
 * operator's own record. The error block is kept, but only for a genuine
 * failure — and even then the ladder renders underneath it.
 */
import { useCallback, useEffect, useRef } from "react";
import { fetchLeaderboard, reprobeBackend } from "../api/ledger";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";
import { useResource } from "../hooks/useApi";
import { loadProfile } from "../lib/todo";
import type { LeaderRow } from "../api/types";

/** Where the rows on screen came from — the badge never guesses. */
export type LadderSource = "loading" | "live" | "device";

export interface LadderData {
  rows: LeaderRow[];
  source: LadderSource;
}

const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

/** Flag the signed-in operator's own row, live or local. */
function markYou(rows: LeaderRow[], handle: string): LeaderRow[] {
  const me = keyOf(handle);
  if (!me) return rows;
  return rows.map((r) => (keyOf(r.handle) === me ? { ...r, you: true } : r));
}

/**
 * This operator's milestones as recorded on this device. Used only when the
 * backend did not answer, and it invents nothing: an empty ledger yields no
 * rows at all, so the empty state stays the empty state.
 */
function deviceRows(scope: string, handle: string): LeaderRow[] {
  const p = loadProfile(scope);
  const recorded = p.totalProgress > 0 || p.tasksCompleted > 0 || p.streak > 0;
  if (!recorded) return [];
  return [
    {
      rank: 1,
      handle: p.handle || handle || "you",
      wins: p.tasksCompleted,
      losses: 0,
      streak: p.streak,
      school: p.focusArea,
      level: p.lifeLevel,
      you: true,
    },
  ];
}

/**
 * Load the ladder. Resolves in both directions — a dead backend is a source
 * change, not an exception. Only a genuinely broken loader rejects, and the
 * error block below is what catches that.
 */
async function loadLadder(
  scope: string,
  handle: string,
): Promise<LadderData> {
  const { rows, live } = await fetchLeaderboard();
  if (live) return { rows: markYou(rows, handle), source: "live" };
  // Health is cached for the session; drop the stale "offline" verdict so the
  // rest of the app re-probes the moment the backend comes back.
  reprobeBackend();
  return { rows: deviceRows(scope, handle), source: "device" };
}

const BADGE: Record<LadderSource, { text: string; title: string }> = {
  loading: { text: "reading the ladder…", title: "contacting the backend…" },
  live: {
    text: "live ladder",
    title: "real operators, read from the ShadowQuest backend",
  },
  device: {
    text: "device copy",
    title:
      "backend offline — showing the milestones recorded on this device. Nothing here is invented.",
  },
};

export function Ladder({
  scope = "guest",
  handle = "",
}: {
  /** Ledger scope of the signed-in operator (see `scopeOf`). */
  scope?: string;
  /** Their display name, so their own row can be marked as theirs. */
  handle?: string;
} = {}) {
  const root = useRef<HTMLElement>(null);
  // Primitives in the dependency list: the loader stays referentially stable
  // across renders, so `useResource` never re-fires on identity churn.
  const load = useCallback(() => loadLadder(scope, handle), [scope, handle]);
  const { data, loading, error, reload } = useResource(load);
  const rows = data?.rows ?? [];
  const source: LadderSource = loading ? "loading" : (data?.source ?? "device");
  const badge = BADGE[source];
  useReveals(root, [rows.length, source]);

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
            <div className="ladder__sync">
              <span
                className={`ladder__badge label is-${source}`}
                title={badge.title}
                aria-live="polite"
              >
                <i aria-hidden="true" />
                {badge.text}
              </span>
              <button
                type="button"
                className="ladder__refresh label"
                onClick={reload}
                disabled={loading}
              >
                ⟳ refresh
              </button>
            </div>
          </div>
          <p className="ladder__lede">
            Goals completed, Consistency streaks held, and the focus each Achiever
            brings to their work. Nothing else is ranked, so nothing else is gamed.
            {source === "live" && (
              <em className="ladder__mock ladder__mock--live">
                {" "}
                — live ladder · real operators, ranked by recorded progress.
              </em>
            )}
            {source === "device" && (
              <em className="ladder__mock">
                {" "}
                — the ladder service is away, so this reads your own milestones
                from this device. Start the API (
                <code>npm run dev</code>) for the full ranking.
              </em>
            )}
          </p>
        </header>

        {/* A real failure is reported, never swallowed — but it no longer
            replaces the ladder, because an offline backend is not one. */}
        {error && (
          <div className="ladder__error" role="status">
            <p className="label">milestones could not be read</p>
            <p className="ladder__err-msg">{error}</p>
            <button className="btn" type="button" onClick={reload}>
              <span className="btn__slash" />
              Retry
            </button>
          </div>
        )}

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
                rows.map((r, i) => (
                  <tr
                    className={`ladder__row${r.you ? " ladder__row--you" : ""}`}
                    key={`${r.rank}-${r.handle}-${i}`}
                  >
                    <td className="is-num ladder__rank num">
                      {String(r.rank).padStart(2, "0")}
                    </td>
                    <td className="ladder__handle">
                      {r.handle}
                      {r.you && <span className="ladder__you label">you</span>}
                    </td>
                    <td className="ladder__school">{r.school}</td>
                    <td className="is-num num">{r.wins}</td>
                    <td className="is-num num">{r.level ?? Math.floor(r.wins / 20) + 1}</td>
                    <td className="is-num num ladder__streak">
                      {r.streak}
                      <span
                        className="ladder__flame"
                        aria-hidden="true"
                        style={{ opacity: Math.min(1, r.streak / 25) }}
                      />
                    </td>
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr className="ladder__row ladder__row--empty">
                  <td colSpan={6}>
                    {source === "device"
                      ? "No milestones recorded on this device yet. Complete your first Goal to appear."
                      : "No milestones yet. Complete your first Goal to appear."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <span className="ladder__rule" aria-hidden="true" />
      </div>
    </section>
  );
}
