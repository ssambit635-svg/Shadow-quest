/**
 * squad.ts — formation and friends.
 *
 * Frontend only, by design: ShadowQuest's ledger is local-first and there is
 * no social API behind it, so the squad is seeded, kept in localStorage next
 * to the rest of the operator's data, and shaped so a real endpoint can be
 * dropped in later without moving the UI. Every field the screens read is
 * declared on `SquadMember`; nothing reaches for a network.
 *
 * The pool below is deliberately the same cast as the Google demo accounts,
 * so whoever you sign in as, the friends already in your squad are people
 * you have seen on the account chooser.
 */
import { scopeOf, type User } from "../lib/auth";
import { GROWTH_RANKS, type LifeFactor } from "../lib/todo";

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
  /** Invited but not yet accepted. */
  invites: string[];
}

/* ------------------------------------------------------------------ *
 * The pool
 * ------------------------------------------------------------------ */

const POOL: Omit<SquadMember, "role" | "self" | "joinedAt">[] = [
  {
    id: "g_aarav",
    name: "Aarav Sharma",
    nameJa: "アーラヴ",
    handle: "aarav",
    email: "aarav.sharma1998@gmail.com",
    hue: 222,
    level: 18,
    rank: "B+",
    streak: 26,
    focusArea: "Systems Engineering",
    strength: "knowledge",
    weeklyPoints: 640,
    online: true,
  },
  {
    id: "g_mei",
    name: "Mei Tanaka",
    nameJa: "メイ",
    handle: "mei",
    email: "mei.tanaka.dev@gmail.com",
    hue: 268,
    level: 24,
    rank: "A",
    streak: 41,
    focusArea: "Design & Craft",
    strength: "focus",
    weeklyPoints: 815,
    online: true,
  },
  {
    id: "g_rohan",
    name: "Rohan Mehta",
    nameJa: "ローハン",
    handle: "rohan",
    email: "rohan.mehta.rm@gmail.com",
    hue: 196,
    level: 12,
    rank: "B",
    streak: 9,
    focusArea: "Strength Training",
    strength: "strength",
    weeklyPoints: 402,
    online: false,
  },
  {
    id: "m_kaede",
    name: "Kaede Ishida",
    nameJa: "楓",
    handle: "kaede",
    email: "kaede.ishida@gmail.com",
    hue: 330,
    level: 31,
    rank: "A+",
    streak: 63,
    focusArea: "Marathon Running",
    strength: "discipline",
    weeklyPoints: 1120,
    online: true,
  },
  {
    id: "m_dev",
    name: "Devika Nair",
    nameJa: "デヴィカ",
    handle: "devika",
    email: "devika.nair@gmail.com",
    hue: 158,
    level: 15,
    rank: "B+",
    streak: 18,
    focusArea: "Research & Writing",
    strength: "wellness",
    weeklyPoints: 528,
    online: false,
  },
  {
    id: "m_sora",
    name: "Sora Kimura",
    nameJa: "空",
    handle: "sora",
    email: "sora.kimura@gmail.com",
    hue: 46,
    level: 9,
    rank: "C+",
    streak: 4,
    focusArea: "Music Practice",
    strength: "skills",
    weeklyPoints: 236,
    online: true,
  },
  {
    id: "m_tara",
    name: "Tara Bose",
    nameJa: "ターラ",
    handle: "tara",
    email: "tara.bose@gmail.com",
    hue: 288,
    level: 21,
    rank: "A",
    streak: 34,
    focusArea: "Recovery & Mobility",
    strength: "energy",
    weeklyPoints: 690,
    online: false,
  },
];

const key = (scope: string) => `sq.squad.${scope}`;
const friendsKey = (scope: string) => `sq.friends.${scope}`;

function memberOf(
  p: Omit<SquadMember, "role" | "self" | "joinedAt">,
  role: SquadRole | null,
  i: number,
): SquadMember {
  return { ...p, role, self: false, joinedAt: Date.now() - i * 86_400_000 };
}

/**
 * A squad that already has shape: four slots filled, the rest of the pool
 * sitting in the friends list. Seeded on first open so the screen is never
 * an empty state asking you to build something from nothing.
 */
function seedSquad(user: User): Squad {
  const self: SquadMember = {
    id: "self",
    name: user.handle,
    nameJa: "己",
    handle: user.handle.toLowerCase().replace(/\s+/g, ""),
    email: user.email,
    hue: 232,
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
    createdAt: Date.now() - 21 * 86_400_000,
    members: [self, memberOf(POOL[3], "captain", 3), memberOf(POOL[1], "support", 1)],
    invites: [POOL[2].id],
  };
}

export function loadSquad(user: User): Squad {
  const scope = scopeOf(user);
  try {
    const raw = localStorage.getItem(key(scope));
    if (raw) {
      const s = JSON.parse(raw) as Squad;
      if (s && Array.isArray(s.members) && s.members.length) return syncSelf(s, user);
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
 * the moment they levelled up.
 */
export function syncSelf(s: Squad, user: User): Squad {
  return {
    ...s,
    members: s.members.map((m) =>
      m.self ? { ...m, name: user.handle, handle: user.handle.toLowerCase().replace(/\s+/g, ""), email: user.email } : m,
    ),
  };
}

export function saveSquad(user: User, s: Squad): void {
  try {
    localStorage.setItem(key(scopeOf(user)), JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

/** Everyone in the pool who is not already in the squad. */
export function availableFriends(s: Squad): SquadMember[] {
  const taken = new Set(s.members.map((m) => m.id));
  return POOL.filter((p) => !taken.has(p.id)).map((p) => memberOf(p, null, 0));
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
  return {
    ...s,
    members: [...s.members, { ...m, role: null, joinedAt: Date.now() }],
    invites: s.invites.filter((i) => i !== m.id),
  };
}

export function removeMember(s: Squad, id: string): Squad {
  // The operator cannot remove themselves from their own squad.
  if (id === "self") return s;
  return { ...s, members: s.members.filter((m) => m.id !== id) };
}

export function invite(s: Squad, id: string): Squad {
  if (s.invites.includes(id) || s.members.some((m) => m.id === id)) return s;
  return { ...s, invites: [...s.invites, id] };
}

/** Accepting an invitation is what puts a friend into the squad. */
export function acceptInvite(s: Squad, id: string): Squad {
  const pending = availableFriends(s).find((f) => f.id === id);
  if (!pending) return { ...s, invites: s.invites.filter((i) => i !== id) };
  return addFriend(s, pending);
}

export function poolById(id: string): SquadMember | null {
  const p = POOL.find((x) => x.id === id);
  return p ? memberOf(p, null, 0) : null;
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

/* ------------------------------------------------------------------ *
 * Friends (independent of any squad)
 * ------------------------------------------------------------------ */

export function loadFriends(user: User): string[] {
  try {
    const raw = localStorage.getItem(friendsKey(scopeOf(user)));
    if (raw) {
      const list = JSON.parse(raw) as string[];
      if (Array.isArray(list)) return list;
    }
  } catch {
    /* ignore */
  }
  const seed = POOL.slice(0, 4).map((p) => p.id);
  saveFriends(user, seed);
  return seed;
}

export function saveFriends(user: User, ids: string[]): void {
  try {
    localStorage.setItem(friendsKey(scopeOf(user)), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
