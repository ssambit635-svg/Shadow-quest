/**
 * squad.ts — formation and friends.
 *
 * The squad holds REAL people only: the operator's own row plus whoever is
 * actually registered on the backend (see fetchPeople in api/ledger and the
 * SquadScreen that feeds it in). Nothing here is seeded — a fresh operator
 * starts alone in their formation and adds real operators as they appear.
 *
 * Formation shape and storage stay local (it is the operator's own
 * arrangement of people), but every person in it comes from the live
 * roster, never from a hardcoded pool.
 */
import { scopeOf, normalizeHandle, type User } from "../lib/auth";
import type { Person } from "../api/ledger";
import { GROWTH_RANKS, LIFE_FACTOR_META, type LifeFactor } from "../lib/todo";

export type SquadRole = "captain" | "vanguard" | "support" | "scout";

export const ROLE_META: Record<SquadRole, { label: string; ja: string; slot: number }> = {
  captain: { label: "Captain", ja: "隊長", slot: 0 },
  vanguard: { label: "Vanguard", ja: "先鋒", slot: 1 },
  support: { label: "Support", ja: "支援", slot: 2 },
  scout: { label: "Scout", ja: "斥候", slot: 3 },
};

export const FORMATION_ORDER: SquadRole[] = ["captain", "vanguard", "support", "scout"];

export interface SquadMember {
  id: string;
  name: string;
  /** The same name in Japanese, shown beside it — one quiet detail, not a theme. */
  nameJa: string;
  handle: string;
  email: string;
  hue: number;
  level: number;
  rank: string;
  streak: number;
  focusArea: string;
  /** The factor they are known for. */
  strength: LifeFactor;
  /** Reward Points banked in the last seven days. */
  weeklyPoints: number;
  online: boolean;
  /** True when this member is the signed-in operator. */
  self?: boolean;
  /** Formation slot, or null when they are a friend but not in the formation. */
  role: SquadRole | null;
  joinedAt: number;
}

export interface Squad {
  name: string;
  nameJa: string;
  motto: string;
  createdAt: number;
  members: SquadMember[];
}

/* ------------------------------------------------------------------ *
 * People → members
 * ------------------------------------------------------------------ */

const FACTORS = Object.keys(LIFE_FACTOR_META) as LifeFactor[];

/** Stable hue from a name, so a person keeps their colour everywhere. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** Map one real registered operator into a squad member row. */
export function personToMember(p: Person): SquadMember {
  return {
    id: p.id,
    name: p.name,
    nameJa: "",
    handle: p.handle,
    email: "",
    hue: hueOf(p.name),
    level: p.level,
    rank: p.rank,
    streak: p.streak,
    focusArea: p.focusArea,
    strength: FACTORS.includes(p.strength as LifeFactor)
      ? (p.strength as LifeFactor)
      : "discipline",
    weeklyPoints: p.weeklyPoints,
    online: p.online,
    self: false,
    role: null,
    joinedAt: p.joinedAt,
  };
}

const key = (scope: string) => `sq.squad.${scope}`;

/**
 * A fresh squad is just the operator. No formation is pre-filled and no
 * friends are pre-added: the first real person in it is whoever signs in.
 */
function seedSquad(user: User): Squad {
  const self: SquadMember = {
    id: "self",
    name: user.handle,
    nameJa: "己",
    handle: user.handle.toLowerCase().replace(/\s+/g, ""),
    email: user.email,
    hue: 6,
    level: 1,
    rank: GROWTH_RANKS[0],
    streak: 0,
    focusArea: "General Development",
    strength: "discipline",
    weeklyPoints: 0,
    online: true,
    self: true,
    role: "vanguard",
    joinedAt: Date.now(),
  };
  return {
    name: "Kage Unit",
    nameJa: "影部隊",
    motto: "Quiet work, compounding daily.",
    createdAt: Date.now(),
    members: [self],
  };
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

/**
 * Repair one stored member row.
 *
 * Storage here is shared with every script on the origin and outlives every
 * release, so a row can arrive missing, half-typed or as a bare number.
 * Anything that cannot be repaired is dropped rather than rendered.
 */
function toMember(raw: unknown): SquadMember | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name).trim();
  const id = str(r.id).trim();
  if (!name || !id) return null;
  const role = FORMATION_ORDER.includes(r.role as SquadRole) ? (r.role as SquadRole) : null;
  const strength = FACTORS.includes(r.strength as LifeFactor)
    ? (r.strength as LifeFactor)
    : "discipline";
  return {
    id: id.slice(0, 64),
    name: name.slice(0, 64),
    nameJa: str(r.nameJa).slice(0, 32),
    handle: str(r.handle).slice(0, 64),
    email: str(r.email).slice(0, 254),
    hue: num(r.hue, 232) % 360,
    level: Math.max(0, Math.round(num(r.level, 1))),
    rank: str(r.rank, GROWTH_RANKS[0]).slice(0, 8),
    streak: Math.max(0, Math.round(num(r.streak))),
    focusArea: str(r.focusArea, "General Development").slice(0, 64),
    strength,
    weeklyPoints: Math.max(0, Math.round(num(r.weeklyPoints))),
    online: r.online !== false,
    self: r.self === true,
    role,
    joinedAt: num(r.joinedAt, Date.now()),
  };
}

/**
 * Validate a whole squad, keeping whatever is salvageable. Slot collisions
 * are resolved in favour of the first holder so the formation can never
 * render two members in one seat. Stored rows that were seeded people from
 * older builds are dropped: only the operator's own row and rows whose ids
 * match live backend operators survive (the screen prunes the rest).
 */
function toSquad(raw: unknown): Squad | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.members)) return null;

  const seen = new Set<string>();
  const taken = new Set<SquadRole>();
  const members: SquadMember[] = [];
  for (const row of r.members) {
    const m = toMember(row);
    if (!m || seen.has(m.id)) continue;
    if (m.role && taken.has(m.role)) m.role = null;
    if (m.role) taken.add(m.role);
    seen.add(m.id);
    members.push(m);
  }
  if (!members.length) return null;

  return {
    name: str(r.name, "Kage Unit").slice(0, 28),
    nameJa: str(r.nameJa, "影部隊").slice(0, 16),
    motto: str(r.motto).slice(0, 64),
    createdAt: num(r.createdAt, Date.now()),
    members,
  };
}

export function loadSquad(user: User): Squad {
  const scope = scopeOf(user);
  try {
    const raw = localStorage.getItem(key(scope));
    if (raw) {
      const s = toSquad(JSON.parse(raw));
      if (s) return syncSelf(s, user);
    }
  } catch {
    /* fall through to a seed */
  }
  const s = seedSquad(user);
  saveSquad(user, s);
  return s;
}

/**
 * The operator's own row is always rebuilt from their live profile rather
 * than trusted from storage — otherwise the squad would show a stale level
 * the moment they levelled up. A record that has lost the operator's row
 * entirely gets one back: a squad the owner is not standing in is not their
 * squad.
 */
export function syncSelf(s: Squad, user: User): Squad {
  const handle = normalizeHandle(user.handle, user.email);
  let found = false;
  const members = s.members.map((m) => {
    if (m.id === "self" || m.self) {
      found = true;
      return {
        ...m,
        id: "self",
        self: true,
        name: handle,
        handle: handle.toLowerCase().replace(/\s+/g, ""),
        email: user.email,
      };
    }
    return { ...m, self: false };
  });
  if (!found) {
    members.unshift({
      id: "self",
      name: handle,
      nameJa: "己",
      handle: handle.toLowerCase().replace(/\s+/g, ""),
      email: user.email,
      hue: 6,
      level: 1,
      rank: GROWTH_RANKS[0],
      streak: 0,
      focusArea: "General Development",
      strength: "discipline",
      weeklyPoints: 0,
      online: true,
      self: true,
      role: null,
      joinedAt: Date.now(),
    });
  }
  return { ...s, members };
}

/**
 * Drop stored rows that no longer exist on the backend (old demo people from
 * previous builds, or operators that were removed). The operator's own row
 * always survives.
 */
export function pruneSquad(s: Squad, liveIds: Set<string>): Squad {
  const members = s.members.filter((m) => m.self || liveIds.has(m.id));
  if (members.length === s.members.length) return s;
  return { ...s, members };
}

export function saveSquad(user: User, s: Squad): void {
  try {
    localStorage.setItem(key(scopeOf(user)), JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

/** The formation, slot order, with empty slots left visible. */
export function formationOf(
  s: Squad,
): { role: SquadRole; label: string; ja: string; member: SquadMember | null }[] {
  return FORMATION_ORDER.map((role) => ({
    role,
    label: ROLE_META[role].label,
    ja: ROLE_META[role].ja,
    member: s.members.find((m) => m.role === role) ?? null,
  }));
}

export function assignRole(s: Squad, memberId: string, role: SquadRole | null): Squad {
  return {
    ...s,
    members: s.members.map((m) => {
      if (m.id === memberId) return { ...m, role };
      // One member per slot: taking a slot vacates whoever held it.
      if (role && m.role === role) return { ...m, role: null };
      return m;
    }),
  };
}

export function addFriend(s: Squad, m: SquadMember): Squad {
  if (s.members.some((x) => x.id === m.id)) return s;
  return { ...s, members: [...s.members, { ...m, role: null, joinedAt: Date.now() }] };
}

export function removeMember(s: Squad, id: string): Squad {
  // The operator cannot remove themselves from their own squad.
  if (id === "self") return s;
  return { ...s, members: s.members.filter((m) => m.id !== id) };
}

/** Combined weekly output — the number the squad header leads with. */
export function squadWeekly(s: Squad): number {
  return s.members.reduce((a, m) => a + m.weeklyPoints, 0);
}

/** Highest level in the squad, for the header sub-line. */
export function squadTopLevel(s: Squad): number {
  return s.members.reduce((a, m) => Math.max(a, m.level), 0);
}

export function onlineCount(s: Squad): number {
  return s.members.filter((m) => m.online).length;
}
