/**
 * mock.ts — a real (if small) Deep Work Challenge engine living in the browser.
 *
 * Re-themed from samurai duel to productivity challenge while keeping the exact
 * same state machine so animations, HUD and game flow remain fully functional.
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

/**
 * Every shadow carries its name in both scripts: the English name the product
 * speaks in, and the Japanese name the art direction is built on — kanji for
 * the name, hiragana/romaji for the reading. `nameJa` is what the card stamps
 * next to `name`; `readingJa` is the furigana line under it.
 */
export const ROSTER: Shadow[] = [
  {
    id: "kage",
    name: "Focused Mind",
    nameJa: "影・集中の心",
    readingJa: "kage — shūchū no kokoro",
    kanji: "◆",
    school: "Deep Work Protocol",
    schoolJa: "深作業の型",
    vow: "Acts once. Momentum does the rest.",
    stats: { cut: 8, guard: 3, speed: 9, ki: 5 },
    portraitUrl: "/img/shadows/kage.jpg",
  },
  {
    id: "hannya",
    name: "Iron Will",
    nameJa: "般若・鉄の意志",
    readingJa: "hannya — tetsu no ishi",
    kanji: "⬢",
    school: "Resilience Gate",
    schoolJa: "耐えの門",
    vow: "Carries resolve as armour, and never removes it.",
    stats: { cut: 9, guard: 8, speed: 3, ki: 4 },
    portraitUrl: "/img/shadows/hannya.jpg",
  },
  {
    id: "suzume",
    name: "Rapid Flow",
    nameJa: "雀・疾き流れ",
    readingJa: "suzume — hayaki nagare",
    kanji: "◈",
    school: "Velocity Sparks",
    schoolJa: "速さの火",
    vow: "Faster than the distraction that tried to interrupt.",
    stats: { cut: 5, guard: 4, speed: 10, ki: 7 },
    portraitUrl: "/img/shadows/suzume.jpg",
  },
  {
    id: "bokushi",
    name: "Strategist",
    nameJa: "墨志・策士",
    readingJa: "bokushi — sakushi",
    kanji: "✧",
    school: "Planning Division",
    schoolJa: "図るの部",
    vow: "Maps the path, then walks it.",
    stats: { cut: 6, guard: 5, speed: 6, ki: 10 },
    portraitUrl: "/img/shadows/bokushi.jpg",
  },
  {
    id: "tetsu",
    name: "Steady",
    nameJa: "鉄・不動",
    readingJa: "tetsu — fudō",
    kanji: "■",
    school: "Consistency System",
    schoolJa: "続くの道",
    vow: "Never rushed. Never broken.",
    stats: { cut: 4, guard: 10, speed: 4, ki: 6 },
    portraitUrl: "/img/shadows/tetsu.jpg",
  },
  {
    id: "yami",
    name: "Deep Flow",
    nameJa: "闇・深き流れ",
    readingJa: "yami — fukaki nagare",
    kanji: "⬣",
    school: "Flow State Path",
    schoolJa: "流の道",
    vow: "Reads the rhythm two beats before the next task.",
    stats: { cut: 7, guard: 6, speed: 7, ki: 8 },
    portraitUrl: "/img/shadows/yami.jpg",
  },
];

export const LEADER: LeaderRow[] = [
  { rank: 1, handle: "noko_achiever", wins: 214, losses: 12, streak: 41, school: "Velocity Sparks" },
  { rank: 2, handle: "ashen_works", wins: 188, losses: 30, streak: 9, school: "Deep Work Protocol" },
  { rank: 3, handle: "iron_will", wins: 171, losses: 44, streak: 17, school: "Resilience Gate" },
  { rank: 4, handle: "strategist01", wins: 149, losses: 51, streak: 4, school: "Planning Division" },
  { rank: 5, handle: "steady_pace", wins: 140, losses: 60, streak: 6, school: "Consistency System" },
  { rank: 6, handle: "flow_state", wins: 121, losses: 66, streak: 2, school: "Flow State Path" },
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPRSTVWXZ23456789";

function makeCode() {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `SHDW-${out}`;
}

const latency = <T,>(value: T): Promise<T> =>
  new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(value)), 40 + Math.random() * 90),
  );

const foeOf = (s: Seat): Seat => (s === "challenger" ? "defender" : "challenger");

interface MockQuest extends QuestState {
  localSeat: Seat;
  shadowPick: string;
}

const stat = (id: string, key: keyof Shadow["stats"]) =>
  (ROSTER.find((s) => s.id === id) ?? ROSTER[0]).stats[key];

function entry(turn: number, text: string, kind: LogEntry["kind"] = "system", fx?: LogEntry["fx"]): LogEntry {
  return { id: `${turn}-${Math.random().toString(36).slice(2, 7)}`, turn, kind, text, fx };
}

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
    const atkName = nameOf(q, attacker);
    const moveName = prodLabel(move);
    log.push(
      entry(turn, `${atkName} executes ${moveName} — ${Math.max(0, dmg)} energy drained.`, "damage", {
        target: victim,
        amount: dmg,
        type: "cut",
      }),
    );
  };

  kiGain[q.localSeat] += localMove.kind === "guard" ? 26 : localMove.kind === "technique" ? -42 : 12;
  kiGain[foe] += foeMove.kind === "guard" ? 26 : foeMove.kind === "technique" ? -42 : 12;

  log.push(entry(turn, `You choose ${prodLabel(localMove)}.`, "move"));
  log.push(entry(turn, `Challenge responds with ${prodLabel(foeMove)}.`, "move"));

  lands(q.localSeat, localMove);
  lands(foe, foeMove);

  if (localMove.kind === "guard" && foeMove.kind === "technique") {
    log.push(entry(turn, "Focus holds. The burst of effort is absorbed.", "system"));
  }
  if (foeMove.kind === "guard" && localMove.kind === "technique") {
    log.push(entry(turn, "Blocked. Your deep flow is met with steady resistance.", "system"));
  }
  if (Math.random() < 0.12) {
    log.push(entry(turn, `Distraction flickers — refocus.`, "system"));
  }

  return { log, damage, kiGain };
}

const prodLabel = (m: MoveIntent) =>
  ({ strike: "execution", guard: "refocus", riposte: "a push-back", technique: "deep flow" })[m.kind];

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
          ? `Major Challenge Completed. Progress earned. Breathe.`
          : `Session ended. Energy depleted. Rest is also progress.`,
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
        ? "Growth Milestone pending sync."
        : phase === "defeat"
          ? "The session ended. Nothing else is lost."
          : undefined,
  };
}

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
    log: [entry(0, `Session opened. Code ${code} — prepare to begin.`, "system")],
  };
  store.set(id, q);
  return q;
}

export function mockTransport(): ShadowTransport {
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
        handle: `achiever_${Math.random().toString(36).slice(2, 6)}`,
        token: "mock",
        ranked: false,
      });
    },

    listShadows: () => latency(ROSTER),

    leaderboard: () => latency(LEADER),

    async createQuest(shadowId) {
      const q = newQuest(shadowId);
      setTimeout(() => {
        const cur = store.get(q.id);
        if (!cur) return;
        store.set(q.id, {
          ...cur,
          phase: "stance",
          log: [...cur.log, entry(1, "Challenge initialized. The timer starts now.", "system")],
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
        log: [...q.log, entry(q.round, "Session ended early. Progress is saved.", "system")],
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
