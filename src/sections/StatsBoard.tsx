/**
 * StatsBoard.tsx — "Your Signal": the operator's own stats dashboard.
 *
 * A dedicated, heavily animated read-out of REAL data: life level ring,
 * life-factor radar, an 84-day activity field, weekly momentum, factor
 * growth and where the reward points came from. Numbers prefer the backend
 * (`GET /v1/stats`) and fall back to the operator's device ledger — either
 * way, every figure is their own recorded work, never a demo value.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, REDUCED, ScrollTrigger } from "../lib/motion";
import { useReveals } from "../lib/reveal";
import type { User } from "../lib/auth";
import {
  backendReachable,
  ensureSignedIn,
  fetchStats,
  type BackendStats,
} from "../api/ledger";
import { computeStats } from "../lib/statsCalc";
import { loadHabits } from "../lib/habits";
import {
  LIFE_FACTOR_META,
  loadProfile,
  loadTasks,
  type LifeFactor,
  type Profile,
} from "../lib/todo";
import { achievementsOf, powerIndex } from "../mobile/stats";

type Source = "loading" | "live" | "device";

function useSignal(scope: string, user: User, nonce: number) {
  const [stats, setStats] = useState<BackendStats>(() =>
    computeStats(loadProfile(scope), loadTasks(scope), loadHabits(scope)),
  );
  const [source, setSource] = useState<Source>("loading");

  useEffect(() => {
    let alive = true;
    setSource("loading");
    // Device copy renders instantly; the backend replaces it when it answers.
    setStats(computeStats(loadProfile(scope), loadTasks(scope), loadHabits(scope)));
    void backendReachable().then(async (ok) => {
      if (!alive) return;
      if (!ok) {
        setSource("device");
        return;
      }
      const token = await ensureSignedIn(scope, user);
      if (!alive) return;
      if (!token) {
        setSource("device");
        return;
      }
      const remote = await fetchStats(scope);
      if (!alive) return;
      if (remote) {
        setStats(remote);
        setSource("live");
      } else {
        setSource("device");
      }
    });
    return () => {
      alive = false;
    };
  }, [scope, user, nonce]);

  return { stats, source };
}

/* ------------------------------------------------------------------ *
 * small animated pieces
 * ------------------------------------------------------------------ */

/** A number that counts to its value instead of appearing. */
function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (REDUCED) {
      el.textContent = value.toLocaleString() + suffix;
      from.current = value;
      return;
    }
    const obj = { v: from.current };
    const tw = gsap.to(obj, {
      v: value,
      duration: 1.15,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = Math.round(obj.v).toLocaleString() + suffix;
      },
    });
    from.current = value;
    return () => {
      tw.kill();
    };
  }, [value, suffix]);
  return (
    <span ref={ref} className="num">
      0
    </span>
  );
}

/** The life-level ring: one drawn arc for progress through the level. */
function LevelRing({ profile }: { profile: Profile | null }) {
  const arcRef = useRef<SVGCircleElement>(null);
  const R = 82;
  const C = 2 * Math.PI * R;
  const pct = profile
    ? Math.max(0, Math.min(1, profile.levelProgress / profile.progressToNext))
    : 0;

  useEffect(() => {
    const el = arcRef.current;
    if (!el) return;
    const target = C * (1 - pct);
    if (REDUCED) {
      el.style.strokeDashoffset = String(target);
      return;
    }
    const tw = gsap.fromTo(
      el,
      { strokeDashoffset: C },
      { strokeDashoffset: target, duration: 1.5, ease: "brush" },
    );
    return () => {
      tw.kill();
    };
  }, [pct, C]);

  return (
    <div className="sbring" data-sb>
      <svg viewBox="0 0 200 200" role="img" aria-label="Life level progress">
        <circle className="sbring__track" cx="100" cy="100" r={R} />
        <circle
          className="sbring__arc"
          ref={arcRef}
          cx="100"
          cy="100"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="sbring__core">
        <span className="sbring__lv-l label">Life Level</span>
        <span className="sbring__lv num">{profile?.lifeLevel ?? 1}</span>
        <span className="sbring__rank">{profile?.growthRank ?? "E"} RANK</span>
      </div>
      <div className="sbring__foot label">
        {profile
          ? `${profile.levelProgress.toLocaleString()} / ${profile.progressToNext.toLocaleString()} progress`
          : "no progress recorded"}
      </div>
    </div>
  );
}

const N = 7;
const CX = 110;
const CY = 110;
const RAD = 72;
const angleOf = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
const pt = (i: number, v: number): [number, number] => {
  const r = (RAD * Math.max(0, Math.min(100, v))) / 100;
  return [CX + r * Math.cos(angleOf(i)), CY + r * Math.sin(angleOf(i))];
};
const ringPoints = (v: number) =>
  Array.from({ length: N }, (_, i) => pt(i, v).map((n) => n.toFixed(1)).join(",")).join(" ");

/** The seven life factors on one axis — drawn in, and hoverable. */
function Radar({ profile }: { profile: Profile | null }) {
  const shapeRef = useRef<SVGPolygonElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const factors = (Object.keys(LIFE_FACTOR_META) as LifeFactor[]).map((f) => ({
    key: f,
    label: LIFE_FACTOR_META[f].label,
    code: LIFE_FACTOR_META[f].code,
    value: Math.round(profile?.factors[f] ?? 0),
  }));

  // Animate the shape growing out of the centre once per profile change.
  useEffect(() => {
    if (REDUCED) return;
    const g = dotsRef.current;
    const shape = shapeRef.current;
    if (!g || !shape) return;
    const tl = gsap.timeline();
    tl.fromTo(
      shape,
      { scale: 0.4, autoAlpha: 0, transformOrigin: `${CX}px ${CY}px` },
      { scale: 1, autoAlpha: 1, duration: 0.9, ease: "power3.out" },
    ).fromTo(
      g.children,
      { scale: 0, transformOrigin: "center" },
      { scale: 1, duration: 0.4, ease: "back.out(2.4)", stagger: 0.05 },
      "-=0.5",
    );
    return () => {
      tl.kill();
    };
  }, [profile]);

  const poly = factors.map((f, i) => pt(i, f.value).map((n) => n.toFixed(1)).join(",")).join(" ");

  return (
    <div className="sbradar" data-sb>
      <svg viewBox="0 0 220 220" role="img" aria-label="Life factor balance">
        {[25, 50, 75, 100].map((v) => (
          <polygon key={v} className="sbradar__ring" points={ringPoints(v)} data-outer={v === 100 || undefined} />
        ))}
        {factors.map((f, i) => {
          const [x, y] = pt(i, 100);
          return (
            <line
              key={f.key}
              className="sbradar__spoke"
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              data-hot={hover === i || undefined}
            />
          );
        })}
        <polygon className="sbradar__shape" ref={shapeRef} points={poly} />
        <g ref={dotsRef}>
          {factors.map((f, i) => {
            const [x, y] = pt(i, f.value);
            return (
              <circle
                key={f.key}
                className="sbradar__dot"
                cx={x}
                cy={y}
                r={hover === i ? 4 : 2.4}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </g>
        {factors.map((f, i) => {
          const [x, y] = pt(i, 126);
          return (
            <text
              key={f.key}
              className="sbradar__lab num"
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              data-hot={hover === i || undefined}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {f.code}
            </text>
          );
        })}
      </svg>
      <div className="sbradar__read" aria-live="polite">
        {hover !== null ? (
          <>
            <b>{factors[hover].label}</b>
            <span className="num">{factors[hover].value}</span>
            <i>/100</i>
          </>
        ) : (
          <span className="label">hover a vertex to read it</span>
        )}
      </div>
    </div>
  );
}

/** 84 days of activity — tasks sealed plus habit seals, one cell a day. */
function Heatmap({ stats }: { stats: BackendStats }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [day, setDay] = useState<string | null>(null);

  const { cols, max } = useMemo(() => {
    const daily = stats.daily;
    if (!daily.length) return { cols: [] as (typeof daily)[], max: 1 };
    const first = new Date(daily[0].date + "T00:00:00");
    const offset = (first.getDay() + 6) % 7; // Monday-first grid
    const weeks = Math.ceil((offset + daily.length) / 7);
    let m = 1;
    const out: (typeof daily)[] = [];
    for (let w = 0; w < weeks; w++) {
      const col: (typeof daily) = [];
      for (let r = 0; r < 7; r++) {
        const idx = w * 7 + r - offset;
        if (idx < 0 || idx >= daily.length) {
          col.push(null as never);
        } else {
          m = Math.max(m, daily[idx].sealed + daily[idx].seals);
          col.push(daily[idx]);
        }
      }
      out.push(col);
    }
    return { cols: out, max: m };
  }, [stats]);

  // Cells ink themselves in column by column.
  useEffect(() => {
    if (REDUCED || !rootRef.current) return;
    const cells = rootRef.current.querySelectorAll<HTMLElement>(".sbheat__c");
    const tw = gsap.fromTo(
      cells,
      { scale: 0, autoAlpha: 0 },
      {
        scale: 1,
        autoAlpha: 1,
        duration: 0.3,
        ease: "back.out(2)",
        stagger: { each: 0.006, from: "start" },
        scrollTrigger: { trigger: rootRef.current, start: "top 80%", once: true },
      },
    );
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
      ScrollTrigger.refresh();
    };
  }, [stats]);

  const levelOf = (act: number) =>
    act === 0 ? 0 : act <= max * 0.25 ? 1 : act <= max * 0.5 ? 2 : act <= max * 0.75 ? 3 : 4;

  const hovered = day ? stats.daily.find((d) => d.date === day) : null;

  return (
    <div className="sbheat" ref={rootRef} data-sb>
      <div className="sbheat__grid">
        {cols.map((col, w) => (
          <div className="sbheat__col" key={w}>
            {col.map((d, r) =>
              d ? (
                <i
                  key={r}
                  className="sbheat__c"
                  data-lv={levelOf(d.sealed + d.seals)}
                  onMouseEnter={() => setDay(d.date)}
                  onMouseLeave={() => setDay(null)}
                />
              ) : (
                <i key={r} className="sbheat__c sbheat__c--off" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="sbheat__read" aria-live="polite">
        {hovered ? (
          <>
            <b className="num">{hovered.date}</b>
            <span>
              {hovered.sealed} sealed · {hovered.seals} habit seals ·{" "}
              <i className="num">+{hovered.progress}</i> progress
            </span>
          </>
        ) : (
          <span className="label">the last twelve weeks, one cell a day</span>
        )}
      </div>
    </div>
  );
}

/** Weekly momentum: progress sealed per week, last eight weeks. */
function Weekly({ stats }: { stats: BackendStats }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...stats.weekly.map((w) => w.progress));

  useEffect(() => {
    if (REDUCED || !rootRef.current) return;
    const bars = rootRef.current.querySelectorAll<HTMLElement>(".sbweek__bar");
    const tw = gsap.fromTo(
      bars,
      { scaleY: 0 },
      {
        scaleY: 1,
        transformOrigin: "bottom center",
        duration: 0.8,
        ease: "brush",
        stagger: 0.07,
        scrollTrigger: { trigger: rootRef.current, start: "top 80%", once: true },
      },
    );
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
      ScrollTrigger.refresh();
    };
  }, [stats]);

  return (
    <div className="sbweek" ref={rootRef} data-sb>
      <div className="sbweek__cols">
        {stats.weekly.map((w, i) => {
          const h = Math.round((w.progress / max) * 100);
          const label = new Date(w.start).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          });
          return (
            <div className="sbweek__col" key={w.start} data-now={i === stats.weekly.length - 1 || undefined}>
              <span className="sbweek__v num">{w.progress > 0 ? `+${w.progress}` : ""}</span>
              <div className="sbweek__track">
                <span className="sbweek__bar" style={{ height: `${Math.max(3, h)}%` }} />
              </div>
              <span className="sbweek__l label">{label}</span>
            </div>
          );
        })}
      </div>
      <p className="label sbweek__note">progress sealed per week</p>
    </div>
  );
}

/** Factor points earned, by factor, from completed goals. */
function FactorGains({ stats }: { stats: BackendStats }) {
  const entries = useMemo(() => {
    const keys = Object.keys(LIFE_FACTOR_META) as LifeFactor[];
    return keys
      .map((k) => ({ key: k, meta: LIFE_FACTOR_META[k], value: stats.factors[k] ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }, [stats]);
  const max = Math.max(1, ...entries.map((e) => e.value));

  return (
    <div className="sbgains" data-sb>
      {entries.map((e) => (
        <div className="sbgains__row" key={e.key}>
          <span className="sbgains__code num" aria-hidden="true">
            {e.meta.code}
          </span>
          <span className="sbgains__label">{e.meta.label}</span>
          <span className="sbgains__track">
            <span
              className="sbgains__fill"
              style={{ width: `${Math.max(e.value > 0 ? 2 : 0, (e.value / max) * 100)}%` }}
            />
          </span>
          <span className="sbgains__v num">+{e.value}</span>
        </div>
      ))}
    </div>
  );
}

const DONUT_TONES = [
  "var(--vermilion)",
  "var(--brass)",
  "var(--steel)",
  "var(--ki)",
  "var(--bone-400)",
  "var(--vermilion-deep)",
];

/** Where the reward points came from — a drawn donut by category. */
function Donut({ stats }: { stats: BackendStats }) {
  const arcRef = useRef<SVGGElement>(null);
  const cats = useMemo(() => {
    const top = stats.categories.slice(0, 5);
    const rest = stats.categories.slice(5);
    const rows = [...top];
    if (rest.length) {
      rows.push({
        label: "Other",
        points: rest.reduce((a, c) => a + c.points, 0),
        count: rest.reduce((a, c) => a + c.count, 0),
      });
    }
    return rows;
  }, [stats]);
  const total = Math.max(1, cats.reduce((a, c) => a + c.points, 0));

  const R = 70;
  const C = 2 * Math.PI * R;

  // Each segment draws itself in sequence.
  useEffect(() => {
    if (REDUCED || !arcRef.current) return;
    const segs = arcRef.current.querySelectorAll<SVGCircleElement>("circle");
    const tl = gsap.timeline();
    segs.forEach((seg, i) => {
      const len = Number(seg.dataset.len ?? 0);
      tl.fromTo(
        seg,
        { strokeDasharray: `0 ${C}` },
        { strokeDasharray: `${Math.max(0.01, len - 1.5)} ${C - Math.max(0.01, len - 1.5)}`, duration: 0.55, ease: "power2.out" },
        i * 0.12,
      );
    });
    return () => {
      tl.kill();
    };
  }, [stats, C]);

  let acc = 0;

  return (
    <div className="sbdonut" data-sb>
      <svg viewBox="0 0 180 180" role="img" aria-label="Reward points by category">
        <circle className="sbdonut__track" cx="90" cy="90" r={R} />
        <g ref={arcRef} transform="rotate(-90 90 90)">
          {cats.map((c, i) => {
            const len = (c.points / total) * C;
            const offset = -acc;
            acc += len;
            return (
              <circle
                key={c.label}
                cx="90"
                cy="90"
                r={R}
                stroke={DONUT_TONES[i % DONUT_TONES.length]}
                strokeDasharray={`0 ${C}`}
                strokeDashoffset={offset}
                data-len={len}
              >
                <title>{`${c.label} — ${c.points} RP`}</title>
              </circle>
            );
          })}
        </g>
      </svg>
      <div className="sbdonut__core">
        <span className="sbdonut__v num">
          <CountUp value={stats.categories.reduce((a, c) => a + c.points, 0)} />
        </span>
        <span className="label">reward pts</span>
      </div>
      <ul className="sbdonut__legend">
        {cats.map((c, i) => (
          <li key={c.label}>
            <i style={{ background: DONUT_TONES[i % DONUT_TONES.length] }} />
            <span>{c.label}</span>
            <b className="num">{c.points}</b>
          </li>
        ))}
        {cats.length === 0 && <li className="label">complete goals to bank points</li>}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * the board
 * ------------------------------------------------------------------ */

export function StatsBoard({ scope, user }: { scope: string; user: User }) {
  const rootRef = useRef<HTMLElement>(null);
  const [nonce, setNonce] = useState(0);
  const { stats, source } = useSignal(scope, user, nonce);
  const tasks = useMemo(() => loadTasks(scope), [scope, stats]);
  const profile = useMemo(
    () => (stats.profile ?? loadProfile(scope)),
    [stats],
  );
  useReveals(rootRef);

  const achievements = useMemo(
    () => achievementsOf(profile, tasks),
    [profile, tasks],
  );
  const power = powerIndex(profile);
  const earned = achievements.filter((a) => a.earned).length;

  // Entry choreography: panels rise in order as they enter the viewport,
  // and every card carries a whisper of tilt under the pointer.
  useEffect(() => {
    if (REDUCED || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-sb]").forEach((el) => {
        gsap.fromTo(
          el,
          { y: 26, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.85,
            ease: "brush",
            scrollTrigger: { trigger: el, start: "top 86%", once: true },
          },
        );
      });
    }, rootRef);
    return () => ctx.revert();
  }, [stats]);

  const onTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (REDUCED) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-tilt]");
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(card, {
      rotateY: px * 4,
      rotateX: py * -4,
      duration: 0.4,
      ease: "power2.out",
      transformPerspective: 900,
    });
  };
  const offTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-tilt]");
    if (!card) return;
    gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.5, ease: "brush" });
  };

  return (
    <section ref={rootRef} className="stats section" id="stats">
      <div className="shell">
        <header className="stats__head">
          <div>
            <p className="label stats__tag">03 — telemetry of {user.handle}</p>
            <h2 className="stats__title" data-rv="brush">
              Your Signal
            </h2>
            <p className="stats__sub">
              Every number here is yours — recorded work, held streaks, grown
              factors. Nothing is demonstrated, everything is earned.
            </p>
          </div>
          <div className="stats__sync">
            <span
              className={`stats__badge label ${source === "live" ? "is-live" : source === "device" ? "is-device" : "is-wait"}`}
              title={
                source === "live"
                  ? "reading live from the ShadowQuest backend"
                  : source === "device"
                    ? "backend offline — showing this device's ledger"
                    : "contacting the backend…"
              }
            >
              <i aria-hidden="true" />
              {source === "live" ? "live · backend" : source === "device" ? "device copy" : "syncing…"}
            </span>
            <button
              type="button"
              className="stats__refresh label"
              onClick={() => setNonce((n) => n + 1)}
            >
              ⟳ refresh
            </button>
          </div>
        </header>

        {/* hero row: ring · counters · donut */}
        <div className="stats__hero" onMouseMove={onTilt} onMouseOut={offTilt}>
          <div className="stats__panel stats__panel--ring" data-tilt>
            <LevelRing profile={profile} />
          </div>

          <div className="stats__counters">
            <div className="sbcount" data-sb data-tilt>
              <span className="sbcount__v">
                <CountUp value={profile.totalProgress} />
              </span>
              <span className="sbcount__l label">total progress</span>
            </div>
            <div className="sbcount" data-sb data-tilt>
              <span className="sbcount__v is-brass">
                <CountUp value={stats.completedTasks} />
              </span>
              <span className="sbcount__l label">goals sealed</span>
            </div>
            <div className="sbcount" data-sb data-tilt>
              <span className="sbcount__v">
                <CountUp value={profile.streak} suffix="d" />
              </span>
              <span className="sbcount__l label">streak · best {profile.longestStreak}d</span>
            </div>
            <div className="sbcount" data-sb data-tilt>
              <span className="sbcount__v is-brass">
                <CountUp value={power} />
              </span>
              <span className="sbcount__l label">power index</span>
            </div>
            <div className="sbcount" data-sb data-tilt>
              <span className="sbcount__v">
                <CountUp value={stats.openTasks} />
              </span>
              <span className="sbcount__l label">open goals</span>
            </div>
            <div className="sbcount" data-sb data-tilt>
              <span className="sbcount__v is-brass">
                <CountUp value={earned} suffix={`/${achievements.length}`} />
              </span>
              <span className="sbcount__l label">marks earned</span>
            </div>
          </div>

          <div className="stats__panel stats__panel--donut" data-tilt>
            <p className="label stats__panel-tag">where points came from</p>
            <Donut stats={stats} />
          </div>
        </div>

        {/* radar + activity field */}
        <div className="stats__duo" onMouseMove={onTilt} onMouseOut={offTilt}>
          <div className="stats__panel" data-tilt>
            <p className="label stats__panel-tag">life factors · balance</p>
            <Radar profile={profile} />
          </div>
          <div className="stats__panel" data-tilt>
            <p className="label stats__panel-tag">activity field · 84 days</p>
            <Heatmap stats={stats} />
            <p className="label stats__panel-tag stats__panel-tag--low">weekly momentum</p>
            <Weekly stats={stats} />
          </div>
        </div>

        {/* factor growth + marks */}
        <div className="stats__duo" onMouseMove={onTilt} onMouseOut={offTilt}>
          <div className="stats__panel" data-tilt>
            <p className="label stats__panel-tag">factor growth, earned</p>
            <FactorGains stats={stats} />
          </div>
          <div className="stats__panel" data-tilt>
            <p className="label stats__panel-tag">marks</p>
            <ul className="sbmarks">
              {achievements.map((a) => (
                <li className="sbmark" key={a.id} data-on={a.earned || undefined}>
                  <span className="sbmark__ja" aria-hidden="true">
                    {a.ja}
                  </span>
                  <span className="sbmark__b">
                    <b>{a.name}</b>
                    <i>{a.detail}</i>
                    {!a.earned && (
                      <span className="sbmark__track">
                        <span className="sbmark__fill" style={{ width: `${a.progress}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="sbmark__s num">{a.earned ? "✓" : `${a.progress}%`}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
