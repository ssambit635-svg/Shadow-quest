/**
 * StatsScreen.tsx — the operator's own telemetry, on the phone face.
 *
 * Same data story as the site's dashboard: real recorded work only. The
 * numbers prefer the backend (`GET /v1/stats`) and fall back to the device
 * ledger; either way they are this operator's, never demonstration values.
 *
 * Counter rolls, the activity field inks itself in, bars grow — the screen
 * is a read-out that moves like the rest of the app.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, REDUCED } from "../../lib/motion";
import type { User } from "../../lib/auth";
import { scopeOf } from "../../lib/auth";
import {
  backendReachable,
  ensureSignedIn,
  fetchStats,
  type BackendStats,
} from "../../api/ledger";
import { computeStats } from "../../lib/statsCalc";
import { loadHabits } from "../../lib/habits";
import {
  LIFE_FACTOR_META,
  loadProfile,
  loadTasks,
  type LifeFactor,
} from "../../lib/todo";
import type { Ledger } from "../useLedger";
import { Caption, Meter, Panel } from "../parts";

type Source = "loading" | "live" | "device";

function useSignal(scope: string, user: User) {
  const [stats, setStats] = useState<BackendStats>(() =>
    computeStats(loadProfile(scope), loadTasks(scope), loadHabits(scope)),
  );
  const [source, setSource] = useState<Source>("loading");

  useEffect(() => {
    let alive = true;
    setSource("loading");
    void backendReachable().then(async (ok) => {
      if (!alive) return;
      if (!ok) return setSource("device");
      const token = await ensureSignedIn(scope, user);
      if (!alive) return;
      if (!token) return setSource("device");
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
  }, [scope, user]);

  return { stats, source };
}

/** A number that rolls to its value. */
function Roll({ value, suffix = "" }: { value: number; suffix?: string }) {
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
      duration: 0.9,
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

export function StatsScreen({ user, ledger }: { user: User; ledger: Ledger }) {
  const scope = scopeOf(user);
  const { stats, source } = useSignal(scope, user);
  const profile = stats.profile ?? ledger.profile;
  const heatRef = useRef<HTMLDivElement>(null);
  const [day, setDay] = useState<string | null>(null);

  // The counter card pops in, the rest follows.
  useEffect(() => {
    if (REDUCED) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-ms]",
        { y: 14, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out", stagger: 0.06 },
      );
    });
    return () => ctx.revert();
  }, [stats]);

  // Activity field: cells ink in column by column.
  const { cols, max } = useMemo(() => {
    const daily = stats.daily;
    if (!daily.length) return { cols: [] as (typeof daily)[], max: 1 };
    const first = new Date(daily[0].date + "T00:00:00");
    const offset = (first.getDay() + 6) % 7;
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

  useEffect(() => {
    if (REDUCED || !heatRef.current) return;
    const cells = heatRef.current.querySelectorAll<HTMLElement>(".ms-heat__c");
    const tw = gsap.fromTo(
      cells,
      { scale: 0, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 0.22, ease: "back.out(2.2)", stagger: 0.004 },
    );
    return () => {
      tw.kill();
    };
  }, [stats]);

  const levelOf = (act: number) =>
    act === 0 ? 0 : act <= max * 0.25 ? 1 : act <= max * 0.5 ? 2 : act <= max * 0.75 ? 3 : 4;
  const hovered = day ? stats.daily.find((d) => d.date === day) : null;

  const weekMax = Math.max(1, ...stats.weekly.map((w) => w.progress));

  const factorRows = useMemo(() => {
    const keys = Object.keys(LIFE_FACTOR_META) as LifeFactor[];
    return keys
      .map((k) => ({ meta: LIFE_FACTOR_META[k], value: stats.factors[k] ?? 0, cur: Math.round(profile.factors[k]) }))
      .sort((a, b) => b.value - a.value);
  }, [stats, profile]);
  const gainMax = Math.max(1, ...factorRows.map((f) => f.value));

  return (
    <div className="m-screen m-stats">
      <header className="m-head">
        <h1 className="m-head__t">Stats</h1>
        <p className="m-head__s">
          {source === "live"
            ? "live from the ShadowQuest backend"
            : source === "device"
              ? "device copy — backend offline"
              : "contacting the backend…"}
          <i className={`ms-live ms-live--${source}`} aria-hidden="true" />
        </p>
      </header>

      {/* — headline numbers — */}
      <Panel glow className="ms-counts" data-ms>
        <div className="ms-counts__big">
          <span className="ms-counts__v num">
            <Roll value={profile.totalProgress} />
          </span>
          <span className="ms-counts__l">total progress</span>
        </div>
        <div className="ms-counts__grid">
          <div>
            <span className="ms-counts__v num">
              <Roll value={stats.completedTasks} />
            </span>
            <span className="ms-counts__l">sealed</span>
          </div>
          <div>
            <span className="ms-counts__v num">
              <Roll value={profile.streak} suffix="d" />
            </span>
            <span className="ms-counts__l">streak</span>
          </div>
          <div>
            <span className="ms-counts__v num is-gold">
              <Roll value={profile.rewardPoints} />
            </span>
            <span className="ms-counts__l">reward pts</span>
          </div>
        </div>
      </Panel>

      {/* — activity field — */}
      <Caption>Activity · 12 weeks</Caption>
      <Panel className="ms-heatwrap" data-ms>
        <div className="ms-heat" ref={heatRef}>
          {cols.map((col, w) => (
            <div className="ms-heat__col" key={w}>
              {col.map((d, r) =>
                d ? (
                  <i
                    key={r}
                    className="ms-heat__c"
                    data-lv={levelOf(d.sealed + d.seals)}
                    onClick={() => setDay(day === d.date ? null : d.date)}
                  />
                ) : (
                  <i key={r} className="ms-heat__c ms-heat__c--off" />
                ),
              )}
            </div>
          ))}
        </div>
        <p className="m-note" aria-live="polite">
          {hovered
            ? `${hovered.date} — ${hovered.sealed} sealed, ${hovered.seals} habit seals, +${hovered.progress} progress`
            : "tap a day to read it · deeper colour = more sealed"}
        </p>
      </Panel>

      {/* — weekly momentum — */}
      <Caption>Weekly momentum</Caption>
      <Panel data-ms>
        <div className="ms-week">
          {stats.weekly.map((w, i) => {
            const h = Math.max(4, Math.round((w.progress / weekMax) * 100));
            return (
              <div className="ms-week__col" key={w.start} data-now={i === stats.weekly.length - 1 || undefined}>
                <span className="ms-week__bar" style={{ height: `${h}%` }} />
                <span className="ms-week__l num">
                  {new Date(w.start).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
              </div>
            );
          })}
        </div>
        <p className="m-note">progress sealed per week</p>
      </Panel>

      {/* — factor growth — */}
      <Caption>Factor growth, earned</Caption>
      <Panel className="ms-gains" data-ms>
        {factorRows.map((f) => (
          <div className="ms-gain" key={f.meta.code}>
            <span className="ms-gain__code num">{f.meta.code}</span>
            <span className="ms-gain__n">{f.meta.label}</span>
            <span className="ms-gain__bar">
              <Meter value={(f.value / gainMax) * 100} tone={f.value === gainMax && f.value > 0 ? "violet" : "accent"} height={3} />
            </span>
            <span className="ms-gain__v num">+{f.value}</span>
            <span className="ms-gain__cur num">{f.cur}</span>
          </div>
        ))}
      </Panel>

      {/* — where points came from — */}
      <Caption>Where points came from</Caption>
      <Panel data-ms>
        {stats.categories.length ? (
          stats.categories.slice(0, 6).map((c) => (
            <div className="ms-gain" key={c.label}>
              <span className="ms-gain__n">{c.label}</span>
              <span className="ms-gain__bar">
                <Meter
                  value={(c.points / Math.max(1, stats.categories[0].points)) * 100}
                  tone="gold"
                  height={3}
                />
              </span>
              <span className="ms-gain__v num is-gold">{c.points}</span>
            </div>
          ))
        ) : (
          <p className="m-note">Complete goals to start banking reward points.</p>
        )}
      </Panel>
    </div>
  );
}
