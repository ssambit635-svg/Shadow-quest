/**
 * transport.ts — the only place that knows what a "fetch" is.
 *
 * Two transports implement one interface:
 *   httpTransport  → real Shadow Quest API (base URL from VITE_API_BASE_URL)
 *   mockTransport  → deterministic in-page duel engine (used when no base URL)
 *
 * Components never fetch. They call the hooks in ./hooks.ts, which call the
 * active transport. Replacing the assumed contract with the real one therefore
 * touches: types.ts, mappers in client.ts, and nothing else.
 */
import type { LeaderRow, MoveIntent, QuestState, Session, Shadow } from "./types";

export interface Unsubscribe {
  (): void;
}

export interface ShadowTransport {
  /** Human-readable name, surfaced in the HUD when mock mode is active. */
  readonly kind: "http" | "mock";

  createSession(): Promise<Session>;
  listShadows(): Promise<Shadow[]>;
  leaderboard(): Promise<LeaderRow[]>;

  createQuest(shadowId: string): Promise<QuestState>;
  joinQuest(code: string, shadowId: string): Promise<QuestState>;
  submitMove(questId: string, move: MoveIntent): Promise<QuestState>;
  forfeit(questId: string): Promise<QuestState>;

  /**
   * Live state. HTTP mode uses SSE when offered, otherwise a poll; both are
   * hidden behind this one subscribe call so the HUD can't tell the difference.
   */
  subscribeQuest(questId: string, onState: (s: QuestState) => void): Unsubscribe;
}

/** Error shape the UI can render without guessing at fetch internals. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
