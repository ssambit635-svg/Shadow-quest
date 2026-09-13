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
    // Webfonts land after first paint and move every measured height, so the
    // triggers are re-cut once they are in.
    document.fonts?.ready
      .then(() => alive && ScrollTrigger.refresh())
      .catch(() => undefined);

    // There is deliberately no `resize` → `ScrollTrigger.refresh()` listener
    // here. ScrollTrigger already refreshes on resize — debounced by 200ms and,
    // on a touch device, blind to the URL-bar resizes a phone fires *while you
    // are scrolling*. A forced synchronous refresh per resize event defeated
    // both of those guards: on a phone the bar collapses mid-drag, the pinned
    // loop re-measures under the thumb and the scroll position is recomputed
    // out from under the gesture, so the page reads as stuck even though every
    // tap still lands. A laptop resizes only when the user drags a window
    // edge, which is why the same listener was invisible there.
    return () => {
      alive = false;
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
