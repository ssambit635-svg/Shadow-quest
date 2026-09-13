/**
 * ProgressScreen.tsx — the personal character sheet.
 *
 * This is a read-out, not a game screen: every number on it is derived from
 * the same Profile the task engine writes, so it cannot say anything the
 * ledger does not already know. The heptagon is the seven Life Factors on
 * one axis; the archetype and tier names are labels on numbers that already
 * exist, never a score of their own.
 *
 * It sits on the existing `#/app` route family, so the desktop dashboard is
 * untouched — this screen only ever mounts inside the phone face.
 */
import { useEffect, useMemo, useRef } from "react";
import { GROWTH_RANKS } from "../../lib/todo";
import { gsap, REDUCED } from "../../lib/motion";
import type { Ledger } from "../useLedger";
import {
  archetypeOf,
  disciplineOf,
  factorStats,
  levelTrack,
  powerIndex,
  rankTrack,
  type FactorStat,
} from "../stats";
import { Caption, Meter, Panel } from "../parts";

/* ------------------------------------------------------------------ *
 * The heptagon
 * ------------------------------------------------------------------ */

const N = 7;
const CX = 100;
const CY = 100;
const R = 66;

const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;

const point = (i: number, v: number): [number, number] => {
  const r = (R * Math.max(0, Math.min(100, v))) / 100;
  return [CX + r * Math.cos(angle(i)), CY + r * Math.sin(angle(i))];
};

const ring = (v: number) =>
  Array.from({ length: N }, (_, i) => point(i, v).map((n) => n.toFixed(2)).join(",")).join(" ");

function Radar({ stats }: { stats: FactorStat[] }) {
  const dataRef = useRef<SVGGElement>(null);

  // The shape grows out of the centre once, on entry. It is not re-animated
  // on every value change — the polygon simply takes its new position, which
  // reads as the sheet updating rather than as a celebration.
  useEffect(() => {
    if (REDUCED || !dataRef.current) return;
    gsap.fromTo(
      dataRef.current,
      { scale: 0.72, autoAlpha: 0, transformOrigin: `${CX}px ${CY}px` },
      { scale: 1, autoAlpha: 1, duration: 0.75, ease: "power3.out" },
    );
  }, []);

  const poly = stats
    .map((s, i) => point(i, s.value).map((n) => n.toFixed(2)).join(","))
    .join(" ");

  return (
    <svg className="m-radar" viewBox="0 0 200 200" role="img" aria-label="Life factor balance">
      <defs>
        <linearGradient id="mrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--m-acc)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--m-vio)" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      {[25, 50, 75, 100].map((v) => (
        <polygon
          key={v}
          className="m-radar__ring"
          points={ring(v)}
          data-outer={v === 100 || undefined}
        />
      ))}

      {stats.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} className="m-radar__spoke" x1={CX} y1={CY} x2={x} y2={y} />;
      })}

      <g ref={dataRef}>
        <polygon className="m-radar__shape" points={poly} fill="url(#mrad)" />
        {stats.map((s, i) => {
          const [x, y] = point(i, s.value);
          return <circle key={s.key} className="m-radar__dot" cx={x} cy={y} r="2.1" />;
        })}
      </g>

      {stats.map((s, i) => {
        const [x, y] = point(i, 128);
        return (
          <text
            key={s.key}
            className="m-radar__lab num"
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {s.code}
          </text>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function ProgressScreen({ ledger }: { ledger: Ledger }) {
  const { profile, tasks } = ledger;
  const stats = useMemo(() => factorStats(profile), [profile]);
  const power = powerIndex(profile);
  const arch = useMemo(() => archetypeOf(profile), [profile]);
  const rank = rankTrack(profile);
  const lv = levelTrack(profile);
  const disc = useMemo(() => disciplineOf(profile, tasks), [profile, tasks]);

  const strongest = stats.reduce((a, b) => (b.value > a.value ? b : a));
  const weakest = stats.reduce((a, b) => (b.value < a.value ? b : a));

  return (
    <div className="m-screen m-prog">
      <header className="m-head">
        <h1 className="m-head__t">Character</h1>
        <p className="m-head__s">
          {profile.focusArea} · Lv.{profile.lifeLevel} · Rank {profile.growthRank}
        </p>
      </header>

      {/* — the sheet — */}
      <Panel glow className="m-sheetcard">
        <div className="m-sheetcard__top">
          <div className="m-power">
            <span className="m-power__v num">{power}</span>
            <span className="m-power__l">Power Index</span>
          </div>
          <div className="m-arch">
            <span className="m-arch__ja" aria-hidden="true">
              {arch.ja}
            </span>
            <span className="m-arch__n">{arch.name}</span>
            <span className="m-arch__r num">{arch.reading}</span>
          </div>
        </div>

        <Radar stats={stats} />

        <p className="m-arch__b">{arch.blurb}</p>

        <div className="m-sheetcard__kv">
          <span>
            Strongest <b>{strongest.label}</b>
          </span>
          <span>
            Needs work <b>{weakest.label}</b>
          </span>
        </div>
      </Panel>

      {/* — rank ladder — */}
      <Caption>
        Growth Rank <span className="num">{rank.current}</span>
        {rank.next ? ` → ${rank.next}` : " · max"}
      </Caption>
      <Panel className="m-ranks">
        <div className="m-ranks__row">
          {GROWTH_RANKS.map((r, i) => (
            <span
              key={r}
              className={`m-ranks__r ${i === rank.index ? "is-now" : ""} ${
                i < rank.index ? "is-past" : ""
              }`}
            >
              {r}
            </span>
          ))}
        </div>
        <Meter value={rank.progress} tone="violet" height={3} />
        <p className="m-note">
          {rank.next
            ? `A rank is earned every three levels. ${rank.progress}% toward ${rank.next}.`
            : "Highest rank reached."}
        </p>
      </Panel>

      {/* — attributes — */}
      <Caption>Attributes</Caption>
      <Panel className="m-attrs">
        {stats.map((s) => (
          <div className="m-attr" key={s.key}>
            <div className="m-attr__head">
              <span className="m-attr__ja" aria-hidden="true">
                {s.ja}
              </span>
              <span className="m-attr__n">{s.label}</span>
              <span className="m-attr__tier">{s.tier.name}</span>
              <span className="m-attr__v num">{s.value}</span>
            </div>
            <Meter value={s.value} tone={s.rank === 1 ? "violet" : "accent"} height={3} />
          </div>
        ))}
      </Panel>

      {/* — discipline — */}
      <Caption>Discipline</Caption>
      <Panel className="m-disc">
        <div className="m-disc__grid">
          <div className="m-disc__c">
            <span className="m-disc__v num">{disc.streak}</span>
            <span className="m-disc__l">day streak</span>
          </div>
          <div className="m-disc__c">
            <span className="m-disc__v num">{disc.longest}</span>
            <span className="m-disc__l">best</span>
          </div>
          <div className="m-disc__c">
            <span className="m-disc__v num">{disc.tasksCompleted}</span>
            <span className="m-disc__l">sealed</span>
          </div>
          <div className="m-disc__c">
            <span className="m-disc__v num">{disc.todayDone}</span>
            <span className="m-disc__l">today</span>
          </div>
        </div>
        <p className="m-disc__v-line">{disc.verdict}</p>
      </Panel>

      {/* — condition — */}
      <Caption>Condition</Caption>
      <Panel className="m-cond">
        <div className="m-cond__row">
          <span className="m-cond__l">Energy</span>
          <span className="m-cond__v num">
            {profile.energy}
            <i>/{profile.energyMax}</i>
          </span>
        </div>
        <Meter value={(profile.energy / profile.energyMax) * 100} tone="accent" height={3} />
        <div className="m-cond__row">
          <span className="m-cond__l">Total progress</span>
          <span className="m-cond__v num">{profile.totalProgress.toLocaleString()}</span>
        </div>
        <Meter value={lv.pct} tone="violet" height={3} />
        <p className="m-note">
          {lv.remaining.toLocaleString()} progress to Lv.{lv.nextLevel}
        </p>
      </Panel>

      {/* — unlocked skills — */}
      <Caption>Skills unlocked</Caption>
      {profile.skills.length ? (
        <div className="m-skills">
          {profile.skills.map((s) => (
            <span className="m-skill" key={s}>
              {s}
            </span>
          ))}
        </div>
      ) : (
        <Panel className="m-pad">
          <p className="m-note">
            Nothing recorded yet. Skills you add to your profile appear here.
          </p>
        </Panel>
      )}
    </div>
  );
}
