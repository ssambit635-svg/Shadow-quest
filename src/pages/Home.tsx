/**
 * Home.tsx — the ShadowQuest Personal OS.
 *
 * Ordered flow:
 * Hero → Dashboard (core to-do) → Way (principles) → Roster (focus areas) →
 * ticker → Form (growth system) → Ladder (milestones) → Outro (CTA).
 *
 * Sections are siblings with no shared state; localStorage-backed dashboard
 * is the primary interface and anchors the productivity promise.
 */
import { useEffect, useRef } from "react";
import { Hero } from "../sections/Hero";
import { Ticker } from "../sections/Ticker";
import { Way } from "../sections/Way";
import { Roster } from "../sections/Roster";
import { Form } from "../sections/Form";
import { Ladder } from "../sections/Ladder";
import { Outro } from "../sections/Outro";
import { Dashboard } from "../sections/Dashboard";
import { ScrollTrigger } from "../lib/motion";
import { prefs } from "../lib/prefs";

export function Home({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    document.fonts?.ready
      .then(() => alive && ScrollTrigger.refresh())
      .catch(() => undefined);
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div ref={root} className="home">
      <Hero onEnter={onEnter} />
      <Dashboard />
      <Ticker />
      <Way />
      <Roster
        onPick={(id) => {
          prefs.setShadow(id);
          onEnter();
        }}
      />
      <Ticker tone="bone" />
      <Form />
      <Ladder />
      <Outro onEnter={onEnter} />
    </div>
  );
}
