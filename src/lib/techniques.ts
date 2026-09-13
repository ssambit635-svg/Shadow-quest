/**
 * techniques.ts — the ways of deep work.
 *
 * The session is no longer a duel: you pick the *rhythm* you want to work in,
 * the way a student picks a study technique. Each technique is only a cycle
 * shape — focus length, rest length, how many rounds — plus a name and a
 * kanji seal, so the timer room can wear it.
 *
 * `focusMin: null` means the focus block counts *up* (Flowmodoro): you start
 * the clock, enter the current, and stop when the current stops. The rest
 * that follows is earned from the depth you held (`restMin: null`).
 */

export interface Technique {
  id: string;
  name: string;
  /** Single kanji worn as the seal on the card and the watermark in the room. */
  kanji: string;
  /** Romaji reading + gloss, shown under the name. */
  romaji: string;
  /** Focus block length in minutes; null = count-up (flow). */
  focusMin: number | null;
  /** Rest length in minutes; null = earned (focus / 5, clamped 5–20); 0 = none. */
  restMin: number | null;
  /** How many focus rounds the full session holds. */
  cycles: number;
  /** One-line vow shown on the card. No marketing tone. */
  line: string;
  /** Hard ceiling for count-up focus blocks, in minutes. */
  capMin?: number;
}

export const TECHNIQUES: Technique[] = [
  {
    id: "pomodoro",
    name: "Pomodoro",
    kanji: "間",
    romaji: "ma — the interval",
    focusMin: 25,
    restMin: 5,
    cycles: 4,
    line: "The classic interval: short strikes, rest before the blade dulls.",
  },
  {
    id: "ultradian",
    name: "Ultradian 90",
    kanji: "波",
    romaji: "nami — the wave",
    focusMin: 90,
    restMin: 20,
    cycles: 2,
    line: "Ride the body's natural tide: one long swell of work, one long shore.",
  },
  {
    id: "rhythm",
    name: "52 / 17",
    kanji: "律",
    romaji: "ritsu — the cadence",
    focusMin: 52,
    restMin: 17,
    cycles: 3,
    line: "The measured cadence observed at the most productive desks.",
  },
  {
    id: "flow",
    name: "Flowmodoro",
    kanji: "流",
    romaji: "ryū — the current",
    focusMin: null,
    restMin: null,
    cycles: 3,
    capMin: 90,
    line: "Start the clock, enter the current; the rest is earned by depth.",
  },
  {
    id: "zazen",
    name: "Zazen 20",
    kanji: "座",
    romaji: "za — the seat",
    focusMin: 20,
    restMin: 0,
    cycles: 1,
    line: "One seat, one breath, one task. The stillness is the technique.",
  },
  {
    id: "kaizen",
    name: "Kaizen 15",
    kanji: "改",
    romaji: "kai — the small turn",
    focusMin: 15,
    restMin: 3,
    cycles: 6,
    line: "Small steps, taken daily, outwalk the sprint.",
  },
];

export function techniqueOf(id: string | null | undefined): Technique {
  return TECHNIQUES.find((t) => t.id === id) ?? TECHNIQUES[0];
}

/** Shape a technique's cycle into one honest readout line: 25′ focus · 5′ rest · ×4 */
export function cycleLine(t: Technique): string {
  const focus = t.focusMin === null ? "open" : `${t.focusMin}′`;
  const rest = t.restMin === null ? "earned" : t.restMin === 0 ? "no rest" : `${t.restMin}′`;
  return `${focus} focus · ${rest} rest · ×${t.cycles}`;
}

export const FLOW_CAP_MIN = 90;
