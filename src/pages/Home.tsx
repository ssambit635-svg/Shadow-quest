/**
 * Home.tsx — reordered with QuestLog as main objective.
 * hook (hero) → CORE (questlog to-do) → tone (ticker) → reason (way) → cast (roster) → system (form) → proof (ladder) → ask (outro).
 * Eurostile headings, no horizontal cursor trails, ink-bloom progress.
 */
import { useEffect, useRef } from "react";
import { Hero } from "../sections/Hero";
import { QuestLog } from "../sections/QuestLog";
import { Ticker } from "../sections/Ticker";
import { Way } from "../sections/Way";
import { Roster } from "../sections/Roster";
import { Form } from "../sections/Form";
import { Ladder } from "../sections/Ladder";
import { Outro } from "../sections/Outro";
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
      <QuestLog />
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
