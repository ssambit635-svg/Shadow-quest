/**
 * Home.tsx — the business page.
 *
 * The landing sells the system; it shows none of the data. Ordered flow:
 * Hero → Way (principles) → Roster (focus areas) → ticker → Form (loop)
 * → Outro (the gate). Everything that is actually *yours* — tasks, streaks,
 * points — lives behind the sign-in, in the real interface.
 */
import { useEffect, useRef } from "react";
import { Hero } from "../sections/Hero";
import { Ticker } from "../sections/Ticker";
import { Way } from "../sections/Way";
import { Roster } from "../sections/Roster";
import { Form } from "../sections/Form";
import { Outro } from "../sections/Outro";
import { ScrollTrigger } from "../lib/motion";
import { prefs } from "../lib/prefs";
import type { User } from "../lib/auth";

export function Home({
  user,
  onEnter,
  onDeepWork,
}: {
  user: User | null;
  /** CTA: the gate, or straight into the OS when already in. */
  onEnter: () => void;
  /** "Begin Deep Work" from the roster: the HUD, gated. */
  onDeepWork: () => void;
}) {
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
      <Hero user={user} onEnter={onEnter} />
      <Ticker />
      <Way />
      <Roster
        onPick={(id) => {
          prefs.setShadow(id);
          onDeepWork();
        }}
      />
      <Ticker tone="bone" />
      <Form />
      <Outro onEnter={onEnter} />
    </div>
  );
}
