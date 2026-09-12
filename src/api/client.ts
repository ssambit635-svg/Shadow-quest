/**
 * client.ts — HTTP transport + the response mappers.
 *
 * Paths are the ASSUMED ones (see contract.md). They're grouped in ENDPOINTS
 * so swapping in the real doc is a single-object edit rather than a hunt
 * through call sites. Query shapes are validated narrowly at the mapper edge —
 * an unexpected payload should fail loudly in dev, not render an empty HUD.
 */
import { ApiError, type ShadowTransport } from "./transport";
import type {
  LeaderRow,
  MoveIntent,
  QuestState,
  Session,
  Shadow,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/** The entire assumed surface. Rewrite this block against Api.md. */
export const ENDPOINTS = {
  session: "/v1/sessions",
  shadows: "/v1/shadows",
  leaderboard: "/v1/leaderboard",
  quests: "/v1/quests",
  quest: (id: string) => `/v1/quests/${encodeURIComponent(id)}`,
  questByCode: (code: string) => `/v1/quests/by-code/${encodeURIComponent(code)}`,
  move: (id: string) => `/v1/quests/${encodeURIComponent(id)}/moves`,
  forfeit: (id: string) => `/v1/quests/${encodeURIComponent(id)}/forfeit`,
  stream: (id: string) => `/v1/quests/${encodeURIComponent(id)}/events`,
} as const;

const JSON_HEADERS = { "content-type": "application/json" };

async function req<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.body ? JSON_HEADERS : {}), ...(init.headers ?? {}) },
    });
  } catch (cause) {
    throw new ApiError("Network unreachable", undefined, cause);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(
      `Shadow Quest API responded ${res.status}`,
      res.status,
      detail,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ *
 * mappers — raw API JSON → the shapes the UI is written against.
 * ------------------------------------------------------------------ */

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Tolerant of a couple of obvious naming variants so a small mismatch in the
 *  real doc doesn't immediately white-screen the app. */
export function mapShadow(raw: Record<string, unknown>): Shadow {
  const stats = (raw.stats ?? {}) as Record<string, unknown>;
  return {
    id: str(raw.id ?? raw.shadow_id ?? raw.slug),
    name: str(raw.name ?? raw.display_name),
    kanji: str(raw.kanji ?? raw.sigil ?? raw.emblem).slice(0, 1) || "影",
    school: str(raw.school ?? raw.style),
    vow: str(raw.vow ?? raw.flavour ?? raw.description),
    stats: {
      cut: num(stats.cut ?? stats.attack),
      guard: num(stats.guard ?? stats.defense),
      speed: num(stats.speed ?? stats.agility),
      ki: num(stats.ki ?? stats.magic),
    },
    portraitUrl:
      typeof raw.portrait_url === "string" ? raw.portrait_url : undefined,
  };
}

export function mapQuest(raw: Record<string, unknown>): QuestState {
  const rows = Array.isArray(raw.combatants) ? raw.combatants : [];
  const logs: unknown[] = Array.isArray(raw.log ?? raw.events)
    ? ((raw.log ?? raw.events) as unknown[])
    : [];
  return {
    id: str(raw.id ?? raw.quest_id),
    code: str(raw.code ?? raw.join_code).toUpperCase(),
    phase: (str(raw.phase, "awaiting") as QuestState["phase"]) || "awaiting",
    round: num(raw.round ?? raw.turn_number, 1),
    turnClockMs: num(raw.turn_clock_ms ?? raw.time_remaining_ms),
    turnLimitMs: num(raw.turn_limit_ms ?? raw.time_limit_ms, 20000),
    you: str(raw.you ?? raw.local_seat ?? raw.you_seat) === "defender" ? "defender" : "challenger",
    combatants: rows.map((r) => {
      const c = r as Record<string, unknown>;
      return {
        seat: (str(c.seat, "challenger") as QuestState["combatants"][number]["seat"]) ||
          "challenger",
        shadowId: str(c.shadow_id ?? c.shadowId),
        displayName: str(c.display_name ?? c.name ?? "Unnamed"),
        hp: num(c.hp),
        hpMax: num(c.hp_max ?? c.hpMax, 100),
        ki: num(c.ki),
        guard: num(c.guard),
        active: Boolean(c.active ?? c.is_active),
      };
    }),
    log: logs.map((l, i) => {
      const e = l as Record<string, unknown>;
      const fx = (e.fx ?? {}) as Record<string, unknown>;
      return {
        id: str(e.id, `log-${i}`),
        turn: num(e.turn, 0),
        kind: (str(e.kind, "system") as QuestState["log"][number]["kind"]) || "system",
        text: str(e.text ?? e.message),
        fx: e.fx
          ? {
              target: str(fx.target) === "defender" ? "defender" : "challenger",
              amount: num(fx.amount),
              type: (str(fx.type, "cut") as "cut" | "block" | "miss") || "cut",
            }
          : undefined,
      };
    }),
    winner: raw.winner ? (str(raw.winner) as "challenger" | "defender") : undefined,
    note: typeof raw.note === "string" ? raw.note : undefined,
  };
}

export function httpTransport(): ShadowTransport {
  return {
    kind: "http",

    async createSession() {
      const raw = await req<Record<string, unknown>>(ENDPOINTS.session, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return {
        handle: str(
          raw.handle ?? (raw.player as Record<string, unknown> | undefined)?.handle,
          "nameless",
        ),
        token: str(raw.token),
        ranked: Boolean(raw.ranked),
      } satisfies Session;
    },

    async listShadows() {
      const raw = await req<{ items?: unknown[] } | unknown[]>(ENDPOINTS.shadows);
      const items = Array.isArray(raw) ? raw : (raw.items ?? []);
      return items.map((r) => mapShadow(r as Record<string, unknown>));
    },

    async leaderboard() {
      const raw = await req<{ items?: unknown[] } | unknown[]>(ENDPOINTS.leaderboard);
      const items = Array.isArray(raw) ? raw : (raw.items ?? []);
      return items.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          rank: num(row.rank),
          handle: str(row.handle ?? row.name),
          wins: num(row.wins),
          losses: num(row.losses),
          streak: num(row.streak),
          school: str(row.school),
        } satisfies LeaderRow;
      });
    },

    async createQuest(shadowId) {
      const raw = await req<Record<string, unknown>>(ENDPOINTS.quests, {
        method: "POST",
        body: JSON.stringify({ shadow_id: shadowId }),
      });
      return mapQuest(raw);
    },

    async joinQuest(code, shadowId) {
      const raw = await req<Record<string, unknown>>(
        `${ENDPOINTS.questByCode(code)}/join`,
        { method: "POST", body: JSON.stringify({ shadow_id: shadowId }) },
      );
      return mapQuest(raw);
    },

    async submitMove(questId, move: MoveIntent) {
      const raw = await req<Record<string, unknown>>(ENDPOINTS.move(questId), {
        method: "POST",
        body: JSON.stringify({
          kind: move.kind,
          variant: move.variant ?? 0,
        }),
      });
      return mapQuest(raw);
    },

    async forfeit(questId) {
      const raw = await req<Record<string, unknown>>(ENDPOINTS.forfeit(questId), {
        method: "POST",
      });
      return mapQuest(raw);
    },

    subscribeQuest(questId, onState) {
      // Prefer a server-push stream; degrade to polling automatically.
      if (typeof EventSource !== "undefined") {
        const es = new EventSource(`${BASE}${ENDPOINTS.stream(questId)}`);
        es.onmessage = (ev) => {
          try {
            onState(mapQuest(JSON.parse(ev.data)));
          } catch {
            /* malformed frame: wait for the next one */
          }
        };
        es.onerror = () => {
          // EventSource reconnects itself; nothing to do but not crash.
        };
        return () => es.close();
      }

      const timer = window.setInterval(async () => {
        try {
          onState(mapQuest(await req<Record<string, unknown>>(ENDPOINTS.quest(questId))));
        } catch {
          /* transient: keep the last known state on screen */
        }
      }, 1000);
      return () => window.clearInterval(timer);
    },
  };
}

export const hasHttpApi = BASE.length > 0;
