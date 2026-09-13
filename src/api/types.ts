/**
 * types.ts — the domain shape the UI is written against.
 *
 * ⚠️ ASSUMED. Api.md never reached the sandbox, so these were inferred from a
 * turn-based duel game. Every field the app actually reads is listed here and
 * nowhere else — reconciling with the real doc is a matter of renaming keys in
 * this file and in client.ts's mappers. See src/api/contract.md for the list of
 * endpoints to confirm.
 */

export type Seat = "challenger" | "defender";

export type Phase =
  | "lobby"
  | "awaiting"
  | "stance"
  | "resolving"
  | "victory"
  | "defeat";

export type MoveKind = "strike" | "guard" | "riposte" | "technique";

/** A fighter as the roster screen needs it. */
export interface Shadow {
  id: string;
  name: string;
  /**
   * The same name written in Japanese — kanji where the name has one, kana
   * where it does not. Shown beside `name` everywhere the roster appears, so
   * a card reads in both scripts at a glance.
   */
  nameJa: string;
  /** Romaji reading of `nameJa`, in hiragana order — the furigana line. */
  readingJa: string;
  /** Single kanji used as the sigil throughout the UI. */
  kanji: string;
  school: string;
  /** The school written in Japanese. */
  schoolJa: string;
  /** Short flavour line — one sentence, no marketing tone. */
  vow: string;
  stats: {
    /** All authored on the same 0–10 scale so bars can share one axis. */
    cut: number;
    guard: number;
    speed: number;
    ki: number;
  };
  portraitUrl?: string;
}

/** One player's live state inside a quest. */
export interface Combatant {
  seat: Seat;
  shadowId: string;
  displayName: string;
  hp: number;
  hpMax: number;
  /** 0–100; spent by techniques, refilled by guarding. */
  ki: number;
  guard: number;
  /** True when this seat is acting right now. */
  active: boolean;
}

export interface LogEntry {
  id: string;
  /** Server-supplied turn number, so the log can be re-ordered safely. */
  turn: number;
  kind: "move" | "damage" | "ki" | "system";
  /** Pre-rendered human line. UI does not reassemble sentences. */
  text: string;
  /** Payload for the animation layer: what to shake, and how hard. */
  fx?: { target?: Seat; amount?: number; type?: "cut" | "block" | "miss" };
}

/** The single object that drives every pixel of the HUD. */
export interface QuestState {
  id: string;
  /** Short human code for joining, e.g. "KAGE-4F2". */
  code: string;
  phase: Phase;
  round: number;
  /** Milliseconds left to act; UI renders the ring from this. */
  turnClockMs: number;
  turnLimitMs: number;
  combatants: Combatant[];
  /** Which seat belongs to *us*. The HUD cannot derive this from `active`,
   *  because active flips every turn. */
  you: Seat;
  log: LogEntry[];
  winner?: Seat;
  /** Free server-side hint string, surfaced verbatim. */
  note?: string;
}

export interface Session {
  handle: string;
  token: string;
  /** Whether the backend considers us ranked (drives the badge in the nav). */
  ranked: boolean;
}

export interface LeaderRow {
  rank: number;
  handle: string;
  /** Goals sealed — the live ladder's ranking currency. */
  wins: number;
  losses: number;
  /** Longest single-life streak, in duels. */
  streak: number;
  school: string;
  /** Life Level, when the backend supplies it (the live ladder does). */
  level?: number;
  /** True on the signed-in operator's own row, so the ladder can mark it. */
  you?: boolean;
}

export interface MoveIntent {
  kind: MoveKind;
  /** Optional shadow-specific variant index (0..n) for `technique`. */
  variant?: number;
}
