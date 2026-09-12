/**
 * Home.tsx — the page, as an ordered argument:
 * hook (hero) → tone (ticker) → reason (way) → cast (roster) →
 * system (form) → proof (ladder) → ask (outro).
 *
 * Sections are siblings with no shared state on purpose; anything they do need
 * (the chosen shadow) goes through prefs, so no section can block another.
 */
import { useEffect, useRef } from "react";
import { Hero } from "../sections/Hero";
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

  // Webfont metrics land after first paint; triggers measured before that are
  // pinned to the wrong offsets. One refresh on `document.fonts` fixes all of
  // them at once instead of each section re-measuring itself.
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
