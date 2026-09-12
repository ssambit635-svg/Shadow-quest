/**
 * mock.ts — a real (if small) duel engine living in the browser.
 *
 * This is not decorative: it resolves turns, spends ki, runs an opponent, and
 * emits the same `fx` payload the server contract promises, so every animation
 * in the HUD is driven by genuine state change. When Api.md lands, this file
 * stops being imported and everything above it stays identical.
 */
import type { ShadowTransport, Unsubscribe } from "./transport";
import type {
  Combatant,
  LeaderRow,
  LogEntry,
  MoveIntent,
  QuestState,
  Seat,
  Session,
  Shadow,
} from "./types";

const HP = 100;
const TURN_LIMIT = 20000;

export const ROSTER: Shadow[] = [
  {
    id: "kage",
    name: "Kage Maru",
    kanji: "影",
    school: "Shadows of the Ford",
    vow: "Strikes once. The river does the rest.",
    stats: { cut: 8, guard: 3, speed: 9, ki: 5 },
  },
  {
    id: "hannya",
    name: "Hannya",
    kanji: "鬼",
    school: "Oni Gate",
    vow: "Wears her grief as armour, and never removes it.",
    stats: { cut: 9, guard: 8, speed: 3, ki: 4 },
  },
  {
    id: "suzume",
    name: "Suzume",
    kanji: "雀",
    school: "Nine Sparks",
    vow: "Faster than the sound of his own footwork.",
    stats: { cut: 5, guard: 4, speed: 10, ki: 7 },
  },
  {
    id: "bokushi",
    name: "Bokushi",
    kanji: "墨",
    school: "Ink Widow",
    vow: "Writes the ending, then performs it.",
    stats: { cut: 6, guard: 5, speed: 6, ki: 10 },
  },
  {
    id: "tetsu",
    name: "Tetsu Onna",
    kanji: "鉄",
    school: "Iron Veil",
    vow: "Has never drawn. Has never needed to.",
    stats: { cut: 4, guard: 10, speed: 4, ki: 6 },
  },
  {
    id: "yami",
    name: "Yami Kendo",
    kanji: "暗",
    school: "Blind Path",
    vow: "Reads the breath two beats before the cut.",
    stats: { cut: 7, guard: 6, speed: 7, ki: 8 },
  },
];

export const LEADER: LeaderRow[] = [
  { rank: 1, handle: "Nokoribi", wins: 214, losses: 12, streak: 41, school: "Nine Sparks" },
  { rank: 2, handle: "Ashen Ford", wins: 188, losses: 30, streak: 9, school: "Shadows of the Ford" },
  { rank: 3, handle: "Hannya Prime", wins: 171, losses: 44, streak: 17, school: "Oni Gate" },
  { rank: 4, handle: "Ink Widow", wins: 149, losses: 51, streak: 4, school: "Ink Widow" },
  { rank: 5, handle: "Tetsu", wins: 140, losses: 60, streak: 6, school: "Iron Veil" },
  { rank: 6, handle: "Blind Path", wins: 121, losses: 66, streak: 2, school: "Blind Path" },
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPRSTVWXZ23456789";

function makeCode() {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `KAGE-${out}`;
}

/** 3–10 ms of "network" so loading states are real, not theoretical. */
const latency = <T,>(value: T): Promise<T> =>
  new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(value)), 40 + Math.random() * 90),
  );

const foeOf = (s: Seat): Seat => (s === "challenger" ? "defender" : "challenger");

interface MockQuest extends QuestState {
  /** Seat the local player occupies; the mock plays the other side. */
  localSeat: Seat;
  shadowPick: string;
}

const stat = (id: string, key: keyof Shadow["stats"]) =>
  (ROSTER.find((s) => s.id === id) ?? ROSTER[0]).stats[key];

function entry(turn: number, text: string, kind: LogEntry["kind"] = "system", fx?: LogEntry["fx"]): LogEntry {
  return { id: `${turn}-${Math.random().toString(36).slice(2, 7)}`, turn, kind, text, fx };
}

/**
 * Resolve one exchange. Deterministic per seed-ish roll, but written so the
 * numbers are legible: cut drives damage, guard absorbs, ki pays for style.
 */
function resolve(
  q: MockQuest,
  localMove: MoveIntent,
): { log: LogEntry[]; damage: Record<Seat, number>; kiGain: Record<Seat, number> } {
  const turn = q.round;
  const foe = foeOf(q.localSeat);
  const foeMove: MoveIntent = pickOpponentMove(q);

  const damage: Record<Seat, number> = { challenger: 0, defender: 0 };
  const kiGain: Record<Seat, number> = { challenger: 0, defender: 0 };
  const log: LogEntry[] = [];

  const atkOf = (seat: Seat, m: MoveIntent) => {
    const id = seat === q.localSeat ? q.shadowPick : q.combatants.find((c) => c.seat === seat)!.shadowId;
    const base = stat(id, "cut") + stat(id, "speed") / 2;
    switch (m.kind) {
      case "strike":
        return base * 1.0;
      case "riposte":
        return base * 1.55;
      case "technique":
        return base * 2.35;
      default:
        return 0;
    }
  };

  const guardOf = (seat: Seat, m: MoveIntent) => {
    const id = seat === q.localSeat ? q.shadowPick : q.combatants.find((c) => c.seat === seat)!.shadowId;
    const g = stat(id, "guard");
    return m.kind === "guard" ? g * 2.4 : g;
  };

  const lands = (attacker: Seat, move: MoveIntent) => {
    if (move.kind === "guard") return;
    const victim = foeOf(attacker);
    const raw = atkOf(attacker, move);
    const soak = guardOf(victim, victim === q.localSeat ? localMove : foeMove);
    const mitigated = move.kind === "riposte" && localMove.kind === "strike" && victim === q.localSeat
      ? raw * 0.4
      : Math.max(1, raw - soak * 0.42);
    const dmg = Math.round(mitigated + (Math.random() * 2 - 1));
    damage[victim] += Math.max(0, dmg);
    log.push(
      entry(turn, `${nameOf(q, attacker)} lands ${label(move)} — ${Math.max(0, dmg)} cuts.`, "damage", {
        target: victim,
        amount: dmg,
        type: "cut",
      }),
    );
  };

  // Both sides commit; the exchange is simultaneous, the log is ordered.
  kiGain[q.localSeat] += localMove.kind === "guard" ? 26 : localMove.kind === "technique" ? -42 : 12;
  kiGain[foe] += foeMove.kind === "guard" ? 26 : foeMove.kind === "technique" ? -42 : 12;

  log.push(entry(turn, `You commit ${label(localMove)}.`, "move"));
  log.push(entry(turn, `${nameOf(q, foe)} commits ${label(foeMove)}.`, "move"));

  lands(q.localSeat, localMove);
  lands(foe, foeMove);

  if (localMove.kind === "guard" && foeMove.kind === "technique") {
    log.push(entry(turn, "Posture holds. The technique breaks on the guard.", "system"));
  }
  if (foeMove.kind === "guard" && localMove.kind === "technique") {
    log.push(entry(turn, "Read. Your technique is swallowed by iron patience.", "system"));
  }
  if (Math.random() < 0.12) {
    log.push(entry(turn, `${nameOf(q, foe)} shifts weight — a half beat early.`, "system"));
  }

  return { log, damage, kiGain };
}

const label = (m: MoveIntent) =>
  ({ strike: "a strike", guard: "a guard", riposte: "a riposte", technique: "a technique" })[m.kind];

const nameOf = (q: QuestState, seat: Seat) =>
  q.combatants.find((c) => c.seat === seat)?.displayName ?? seat;

function pickOpponentMove(q: MockQuest): MoveIntent {
  const foe = q.combatants.find((c) => c.seat === foeOf(q.localSeat))!;
  const me = q.combatants.find((c) => c.seat === q.localSeat)!;
  if (me.hp < 26 && foe.ki >= 42) return { kind: "technique" };
  if (foe.hp < 30) return { kind: "strike" };
  if (foe.guard > 0 && Math.random() < 0.35) return { kind: "guard" };
  const roll = Math.random();
  if (roll < 0.18 && foe.ki >= 42) return { kind: "technique" };
  if (roll < 0.45) return { kind: "riposte" };
  if (roll < 0.62) return { kind: "guard" };
  return { kind: "strike" };
}

/** Apply the resolution to state; returns a fresh quest object (referentially
 *  new so React re-renders without deep comparison). */
function settle(q: MockQuest, localMove: MoveIntent): MockQuest {
  const { log, damage, kiGain } = resolve(q, localMove);
  const combatants: Combatant[] = q.combatants.map((c) => {
    const hp = Math.max(0, c.hp - damage[c.seat]);
    const ki = Math.min(100, Math.max(0, c.ki + kiGain[c.seat]));
    return {
      ...c,
      hp,
      ki,
      guard: c.seat === q.localSeat ? (localMove.kind === "guard" ? c.guard + 1 : 0) : c.guard,
      active: c.seat === q.localSeat,
    };
  });

  const challenger = combatants.find((c) => c.seat === "challenger")!;
  const defender = combatants.find((c) => c.seat === "defender")!;

  let phase: QuestState["phase"] = "stance";
  let winner: Seat | undefined;
  if (challenger.hp <= 0 || defender.hp <= 0) {
    winner = challenger.hp <= 0 ? "defender" : "challenger";
    phase = winner === q.localSeat ? "victory" : "defeat";
    log.push(
      entry(
        q.round,
        phase === "victory"
          ? `${nameOf(q, winner)} takes the field. Breathe.`
          : `${nameOf(q, winner)} stands alone. The ford is theirs.`,
        "system",
      ),
    );
  }

  return {
    ...q,
    phase,
    round: q.round + (phase === "stance" ? 1 : 0),
    turnClockMs: TURN_LIMIT,
    combatants,
    winner,
    log: [...q.log, ...log],
    note:
      phase === "victory"
        ? "Rank pending server confirmation."
        : phase === "defeat"
          ? "The duel is lost. Nothing else is."
          : undefined,
  };
}

/**
 * The store. One Map, keyed by quest id, plus subscribers — deliberately
 * shaped like a server so swapping transports changes nothing upstream.
 */
const store = new Map<string, MockQuest>();
const subs = new Map<string, Set<(s: QuestState) => void>>();

function publish(id: string) {
  const q = store.get(id);
  if (!q) return;
  subs.get(id)?.forEach((cb) => cb(structuredClone(q)));
}

function newQuest(shadowId: string, localSeat: Seat = "challenger"): MockQuest {
  const me = ROSTER.find((s) => s.id === shadowId) ?? ROSTER[0];
  const foePick = ROSTER[(ROSTER.indexOf(me) + 3) % ROSTER.length];
  const id = `q_${Math.random().toString(36).slice(2, 9)}`;
  const code = makeCode();
  const q: MockQuest = {
    id,
    you: localSeat,
    code,
    phase: "awaiting",
    round: 1,
    turnClockMs: TURN_LIMIT,
    turnLimitMs: TURN_LIMIT,
    localSeat,
    shadowPick: me.id,
    combatants: [
      {
        seat: "challenger",
        shadowId: me.id,
        displayName: me.name,
        hp: HP,
        hpMax: HP,
        ki: 40,
        guard: 0,
        active: localSeat === "challenger",
      },
      {
        seat: "defender",
        shadowId: foePick.id,
        displayName: foePick.name,
        hp: HP,
        hpMax: HP,
        ki: 40,
        guard: 0,
        active: localSeat === "defender",
      },
    ],
    // The code in this line is the code the join screen will echo back.
    log: [entry(0, `Field drawn. Code ${code} — bow, then begin.`, "system")],
  };
  store.set(id, q);
  return q;
}

export function mockTransport(): ShadowTransport {
  // Single heartbeat drives the turn clock for every open quest, exactly like
  // a server tick — the HUD never owns its own countdown.
  let timer: number | undefined;
  const ensureTick = () => {
    if (timer !== undefined) return;
    timer = window.setInterval(() => {
      let dirty = false;
      store.forEach((q, id) => {
        if (q.phase !== "stance" && q.phase !== "awaiting") return;
        if (q.phase === "awaiting") return;
        const next = q.turnClockMs - 250;
        if (next <= 0) {
          store.set(id, settle(q, { kind: "guard" }));
          publish(id);
        } else {
          store.set(id, { ...q, turnClockMs: next });
          dirty = true;
        }
      });
      if (dirty) store.forEach((_, id) => publish(id));
    }, 250);
  };

  return {
    kind: "mock",

    async createSession() {
      return latency<Session>({
        handle: `ronin_${Math.random().toString(36).slice(2, 6)}`,
        token: "mock",
        ranked: false,
      });
    },

    listShadows: () => latency(ROSTER),

    leaderboard: () => latency(LEADER),

    async createQuest(shadowId) {
      const q = newQuest(shadowId);
      // "Opponent found" beat, so the awaiting→stance transition is observable.
      setTimeout(() => {
        const cur = store.get(q.id);
        if (!cur) return;
        store.set(q.id, {
          ...cur,
          phase: "stance",
          log: [...cur.log, entry(1, "An opponent bows. The round begins.", "system")],
        });
        publish(q.id);
      }, 900);
      return latency<QuestState>({ ...q });
    },

    async joinQuest(code, shadowId) {
      const q = newQuest(shadowId, code.trim().length % 2 === 0 ? "challenger" : "defender");
      store.set(q.id, { ...q, code: code.trim().toUpperCase() || q.code });
      setTimeout(() => {
        const cur = store.get(q.id);
        if (!cur) return;
        store.set(q.id, { ...cur, phase: "stance" });
        publish(q.id);
      }, 600);
      return latency<QuestState>({ ...q });
    },

    async submitMove(questId, move) {
      const q = store.get(questId);
      if (!q) throw new Error("unknown quest");
      if (q.phase !== "stance") return latency<QuestState>({ ...q });
      // Resolve on a beat, so the client's own lunge animation plays first and
      // the impact lands with the state change instead of before it.
      setTimeout(() => {
        store.set(questId, settle(q, move));
        publish(questId);
      }, 420);
      return latency<QuestState>(q);
    },

    async forfeit(questId) {
      const q = store.get(questId);
      if (!q) throw new Error("unknown quest");
      const ended: MockQuest = {
        ...q,
        phase: q.localSeat === "challenger" ? "defeat" : "victory",
        winner: foeOf(q.localSeat),
        turnClockMs: 0,
        log: [...q.log, entry(q.round, "You sheathe. The duel is conceded.", "system")],
      };
      store.set(questId, ended);
      publish(questId);
      return latency<QuestState>({ ...ended });
    },

    subscribeQuest(questId, onState) {
      ensureTick();
      const set = subs.get(questId) ?? new Set();
      set.add(onState);
      subs.set(questId, set);
      const current = store.get(questId);
      if (current) onState(structuredClone(current));
      return (() => {
        set.delete(onState);
      }) satisfies Unsubscribe;
    },
  };
}
