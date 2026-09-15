/**
 * rewards.mjs — the daily bonus and the streak shield, decided server-side.
 *
 * Both features are currency: the daily bonus pays Reward Points and the
 * shield spends them. Anything a browser can decide about currency can be
 * replayed, so every rule here lives on this side of the wire and the client
 * only ever *asks*. There is one exception, and it is deliberate: the
 * operator's calendar day comes from the browser (it is the only party that
 * knows their timezone), but the day key the browser sends is not trusted —
 * it must equal the day this module computes from the timezone the browser
 * also declares, and the two are checked together.
 *
 * The rules are expressed as (filter, update) pairs — the exact documents
 * MongoDB applies — so the file-store fallback can interpret the same pair
 * against a plain object. One rule, two stores, no drift.
 *
 * What counts as evidence is real recorded work, never a flag the client can
 * set: a task stored as completed inside the operator's local day, a habit
 * marked on it, or the engine's own last-active record. All of it already
 * lives in the operator's MongoDB document.
 */

export const DAILY_REWARD_POINTS = 25;
export const SHIELD_COST = 150;
export const MAX_SHIELDS = 3;
/** One bonus per local day; a second claim this close is a replay, not a day. */
export const DAILY_CLAIM_MIN_GAP_MS = 20 * 3600_000;

const DAY_MS = 86400000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** getTimezoneOffset() is UTC−local, so UTC+14 is −840 and UTC−12 is +720. */
const MAX_TZ_OFFSET = -840;
const MIN_TZ_OFFSET = 720;
/** How many shielded days to keep — a rolling record, not an archive. */
const MAX_PROTECTED = 60;

const num = (v, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const clampInt = (v, lo, hi, fallback = 0) =>
  Math.max(lo, Math.min(hi, Math.round(num(v, fallback))));

/* ------------------------------------------------------------------ *
 * days — the operator's calendar, computed from their declared offset
 * ------------------------------------------------------------------ */

/**
 * The local-day key for a UTC instant: `dayKeyOf(Date.now(), -330)` is the
 * date in IST. Local time is UTC − offset, which is why the sign flips here.
 */
export function dayKeyOf(ms, tzOffsetMinutes) {
  return new Date(ms - tzOffsetMinutes * 60000).toISOString().slice(0, 10);
}

/** The UTC instant an operator's local day began. Inverse of `dayKeyOf`. */
export function dayStartMs(dayKey, tzOffsetMinutes) {
  return Date.parse(`${dayKey}T00:00:00Z`) + tzOffsetMinutes * 60000;
}

export function dayBefore(dayKey) {
  return dayKeyOf(Date.parse(`${dayKey}T00:00:00Z`) - DAY_MS, 0);
}

/**
 * Read the browser's timezone offset, or null when it is absent, malformed,
 * or outside the range a real timezone can occupy.
 */
export function tzOffsetOf(raw) {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < MAX_TZ_OFFSET || n > MIN_TZ_OFFSET) return null;
  return n;
}

/**
 * The day a request belongs to, or null when the request cannot honestly
 * claim one. The claimed day must match the day computed from the same
 * declared offset — so a client cannot name a day its own timezone says it
 * is not, and "claim again with tomorrow's date" is refused before any
 * database work happens.
 */
export function dayKeyOfRequest(body, now = Date.now()) {
  const tz = tzOffsetOf(body?.tz);
  if (tz === null) return null;
  const day = dayKeyOf(now, tz);
  const claimed = typeof body?.day === "string" ? body.day : "";
  if (claimed && claimed !== day) return null;
  return { day, tz };
}

/* ------------------------------------------------------------------ *
 * stored reward state
 * ------------------------------------------------------------------ */

export function defaultRewards() {
  return {
    /** Last local day the bonus was paid on ("" = never). */
    dailyClaimDate: "",
    /** When it was paid, epoch ms — the replay guard. */
    dailyClaimAt: 0,
    /** How many daily bonuses this operator has ever collected. */
    dailyClaims: 0,
    /** Shields currently held. */
    shields: 0,
    shieldsBought: 0,
    shieldsUsed: 0,
    /** Day a shield was last spent on, so one day can only be rescued once. */
    lastShieldUseDate: "",
    /** Days a shield covered — the chain reads these as held, not missed. */
    protectedDates: [],
    updatedAt: 0,
  };
}

/** Repair whatever is stored into the shape the rules expect. */
export function normalizeRewards(raw) {
  const d = defaultRewards();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const r = raw;
  return {
    dailyClaimDate: DAY_KEY.test(String(r.dailyClaimDate ?? "")) ? r.dailyClaimDate : "",
    dailyClaimAt: clampInt(r.dailyClaimAt, 0, Number.MAX_SAFE_INTEGER),
    dailyClaims: clampInt(r.dailyClaims, 0, 1e6),
    shields: clampInt(r.shields, 0, MAX_SHIELDS),
    shieldsBought: clampInt(r.shieldsBought, 0, 1e6),
    shieldsUsed: clampInt(r.shieldsUsed, 0, 1e6),
    lastShieldUseDate: DAY_KEY.test(String(r.lastShieldUseDate ?? ""))
      ? r.lastShieldUseDate
      : "",
    protectedDates: Array.isArray(r.protectedDates)
      ? r.protectedDates
          .filter((x) => typeof x === "string" && DAY_KEY.test(x))
          .slice(-MAX_PROTECTED)
      : [],
    updatedAt: clampInt(r.updatedAt, 0, Number.MAX_SAFE_INTEGER),
  };
}

/* ------------------------------------------------------------------ *
 * evidence — what the operator actually did, from their stored ledger
 * ------------------------------------------------------------------ */

/** Every local day the stored ledger carries a mark for. */
export function activeDatesOf(user, tzOffset) {
  const dates = new Set();
  for (const t of Array.isArray(user?.tasks) ? user.tasks : []) {
    if (t?.status !== "completed") continue;
    if (typeof t.completedAt !== "number" || !Number.isFinite(t.completedAt)) continue;
    dates.add(dayKeyOf(t.completedAt, tzOffset));
  }
  for (const h of Array.isArray(user?.habits) ? user.habits : []) {
    for (const d of Array.isArray(h?.history) ? h.history : []) {
      if (typeof d === "string" && DAY_KEY.test(d)) dates.add(d);
    }
  }
  const last = user?.profile?.lastActiveDate;
  if (typeof last === "string" && DAY_KEY.test(last)) dates.add(last);
  return dates;
}

/** Goals sealed inside one local day, and habits marked on it. */
export function evidenceFor(user, dayKey, tzOffset) {
  const start = dayStartMs(dayKey, tzOffset);
  const end = start + DAY_MS;
  let goals = 0;
  for (const t of Array.isArray(user?.tasks) ? user.tasks : []) {
    if (t?.status !== "completed") continue;
    if (typeof t.completedAt !== "number") continue;
    if (t.completedAt >= start && t.completedAt < end) goals += 1;
  }
  let habits = 0;
  for (const h of Array.isArray(user?.habits) ? user.habits : []) {
    if (Array.isArray(h?.history) && h.history.includes(dayKey)) habits += 1;
  }
  return { goals, habits };
}

/* ------------------------------------------------------------------ *
 * the daily bonus
 * ------------------------------------------------------------------ */

/**
 * Today's bonus, as the client should see it. `eligible` is the operator's
 * daily requirement — one goal sealed or one habit marked on their own local
 * day — read from the ledger's recorded work, not from a counter the client
 * asserts.
 */
export function dailyState(user, rewards, { dayKey, tzOffset, now = Date.now() }) {
  const r = normalizeRewards(rewards);
  const evidence = evidenceFor(user, dayKey, tzOffset);
  const eligible = evidence.goals > 0 || evidence.habits > 0;
  const claimed = r.dailyClaimDate === dayKey;
  const gapOk = r.dailyClaimAt <= 0 || now - r.dailyClaimAt >= DAILY_CLAIM_MIN_GAP_MS;
  const reason = claimed
    ? "claimed"
    : !eligible
      ? "no-activity"
      : !gapOk
        ? "too-soon"
        : "ready";
  return {
    amount: DAILY_REWARD_POINTS,
    day: dayKey,
    claimed,
    claimedDate: r.dailyClaimDate || null,
    claims: r.dailyClaims,
    eligible,
    ready: reason === "ready",
    reason,
    evidence,
    requirement: "Seal one goal or mark one habit today",
  };
}

/**
 * The atomic claim. `dayKey`, `amount` and `at` are all server-decided; the
 * filter refuses a day already paid and any claim inside the replay window,
 * so two devices racing produce exactly one payout.
 */
export function claimOp(dayKey, amount, at) {
  return {
    filter: {
      "rewards.dailyClaimDate": { $ne: dayKey },
      $or: [
        { "rewards.dailyClaimAt": { $exists: false } },
        { "rewards.dailyClaimAt": { $lte: at - DAILY_CLAIM_MIN_GAP_MS } },
      ],
      // A payout needs a real ledger to pay into: the profile the client
      // pushed, with the reward balance the engine keeps.
      "profile.rewardPoints": { $gte: 0 },
    },
    update: {
      $inc: { "profile.rewardPoints": amount, "rewards.dailyClaims": 1 },
      $set: {
        "rewards.dailyClaimDate": dayKey,
        "rewards.dailyClaimAt": at,
        "rewards.updatedAt": at,
      },
    },
  };
}

/* ------------------------------------------------------------------ *
 * the streak shield
 * ------------------------------------------------------------------ */

/**
 * The day a shield could rescue, or why none can be.
 *
 * A chain breaks on the first missed day it cannot cover, so only *yesterday*
 * is ever in play: yesterday with the day before it active means one missed
 * day — exactly what one shield is defined to hold. Anything older is a
 * chain that already broke and no single shield can honestly repair.
 */
export function shieldTarget(user, rewards, { dayKey, tzOffset }) {
  const r = normalizeRewards(rewards);
  const yesterday = dayBefore(dayKey);
  const twoBefore = dayBefore(yesterday);
  const dates = activeDatesOf(user, tzOffset);
  const protectedSet = new Set(r.protectedDates);
  const held = (d) => dates.has(d) || protectedSet.has(d);

  // Yesterday is real work: nothing was missed.
  if (dates.has(yesterday)) return { date: null, reason: "no-miss" };
  // Yesterday is already held by a shield. If the day before it holds too the
  // chain is whole and there is nothing to fix; if it does not, the break is
  // two days wide and a second shield cannot bridge it.
  if (protectedSet.has(yesterday)) {
    return { date: null, reason: held(twoBefore) ? "no-miss" : "chain-broken" };
  }
  // A chain that never ran has nothing to break — a first day cannot be
  // missed, and no shield should be spent pretending otherwise.
  if (![...dates, ...protectedSet].some((d) => d < yesterday)) {
    return { date: null, reason: "no-chain" };
  }
  // Only yesterday is ever in play. If the day before it is not held, the
  // chain is already two days broken and one shield cannot repair that.
  if (!held(twoBefore)) return { date: yesterday, reason: "chain-broken" };
  if (r.shields <= 0) return { date: yesterday, reason: "no-shield" };
  if (r.lastShieldUseDate === dayKey) return { date: yesterday, reason: "used-today" };
  return { date: yesterday, reason: "open" };
}

/** Buy one shield: spends the balance and refuses to stack past the cap. */
export function buyOp(at) {
  return {
    filter: {
      "profile.rewardPoints": { $gte: SHIELD_COST },
      "rewards.shields": { $lt: MAX_SHIELDS },
    },
    update: {
      $inc: { "profile.rewardPoints": -SHIELD_COST, "rewards.shields": 1, "rewards.shieldsBought": 1 },
      $set: { "rewards.updatedAt": at },
    },
  };
}

/**
 * Spend one shield on one day. The filter is the whole rule: at least one
 * held, that day not already covered, and no second rescue on the same day —
 * so a frontend that fires this repeatedly still holds exactly one day.
 */
export function useOp(date, dayKey, at) {
  return {
    filter: {
      "rewards.shields": { $gte: 1 },
      "rewards.protectedDates": { $ne: date },
      "rewards.lastShieldUseDate": { $ne: dayKey },
    },
    update: {
      $inc: { "rewards.shields": -1, "rewards.shieldsUsed": 1 },
      $set: { "rewards.lastShieldUseDate": dayKey, "rewards.updatedAt": at },
      $push: { "rewards.protectedDates": { $each: [date], $slice: -MAX_PROTECTED } },
    },
  };
}

/* ------------------------------------------------------------------ *
 * the client-facing state
 * ------------------------------------------------------------------ */

/**
 * Everything the UI needs to be honest about both features, in one object:
 * the balance, today's bonus, the shield, and the days a shield already
 * covers (the streak reads those as held).
 */
export function rewardsState(user, { dayKey, tzOffset, now = Date.now() }) {
  // Total by construction: a caller that hands over no usable day still gets
  // a state back (today, UTC) rather than an exception in a request handler.
  const day = DAY_KEY.test(String(dayKey ?? "")) ? dayKey : dayKeyOf(now, 0);
  const tz = Number.isInteger(tzOffset) ? tzOffset : 0;
  const r = normalizeRewards(user?.rewards);
  const daily = dailyState(user, r, { dayKey: day, tzOffset: tz, now });
  const target = shieldTarget(user, r, { dayKey: day, tzOffset: tz });
  const points = clampInt(user?.profile?.rewardPoints, 0, Number.MAX_SAFE_INTEGER);
  const canUse = target.reason === "open";
  const canBuy = r.shields < MAX_SHIELDS && points >= SHIELD_COST;
  return {
    points,
    day,
    daily,
    shield: {
      count: r.shields,
      cost: SHIELD_COST,
      max: MAX_SHIELDS,
      bought: r.shieldsBought,
      used: r.shieldsUsed,
      protectedDates: r.protectedDates,
      missedDate: target.date,
      canUse,
      useReason: target.reason,
      canBuy,
      buyReason:
        r.shields >= MAX_SHIELDS
          ? "at-max"
          : points < SHIELD_COST
            ? "not-enough-points"
            : "ready",
    },
    protectedDates: r.protectedDates,
  };
}

/* ------------------------------------------------------------------ *
 * interpreting a (filter, update) pair without MongoDB
 *
 * The file store is a dev fallback, not a second rules engine: it applies
 * exactly the documents `claimOp` / `buyOp` / `useOp` produced. Only the
 * operators those three use are implemented, and an unknown one throws
 * rather than quietly doing nothing.
 * ------------------------------------------------------------------ */

const path = (spec) => String(spec).split(".");

function readPath(doc, spec) {
  let cur = doc;
  for (const p of path(spec)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function writePath(doc, spec, value) {
  const parts = path(spec);
  let cur = doc;
  for (const p of parts.slice(0, -1)) {
    if (cur[p] === null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts.at(-1)] = value;
}

function matchesOp(value, op, expected) {
  switch (op) {
    case "$ne":
      return Array.isArray(value) ? !value.includes(expected) : value !== expected;
    case "$gte":
      return typeof value === "number" && value >= expected;
    case "$lte":
      return typeof value === "number" && value <= expected;
    case "$lt":
      return typeof value === "number" && value < expected;
    case "$exists":
      return expected ? value !== undefined : value === undefined;
    default:
      throw new Error(`rewards: unsupported filter operator ${op}`);
  }
}

/** Does a stored document satisfy a reward filter? (Mongo's rule, verbatim.) */
export function matchRewardFilter(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") {
      return cond.some((sub) => matchRewardFilter(doc, sub));
    }
    const value = readPath(doc, key);
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, expected]) =>
        matchesOp(value, op, expected),
      );
    }
    return value === cond;
  });
}

/** Apply a reward update. Same operators, same result as the MongoDB path. */
export function applyRewardUpdate(doc, update) {
  for (const [op, spec] of Object.entries(update)) {
    if (op === "$set") {
      for (const [key, value] of Object.entries(spec)) writePath(doc, key, value);
    } else if (op === "$inc") {
      for (const [key, by] of Object.entries(spec)) {
        writePath(doc, key, clampInt(readPath(doc, key), -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) + by);
      }
    } else if (op === "$push") {
      for (const [key, value] of Object.entries(spec)) {
        const list = readPath(doc, key);
        const arr = Array.isArray(list) ? list : [];
        const added = Array.isArray(value?.$each) ? value.$each : [value];
        arr.push(...added);
        const slice = typeof value?.$slice === "number" ? value.$slice : null;
        writePath(doc, key, slice !== null && slice < 0 ? arr.slice(slice) : arr);
      }
    } else {
      throw new Error(`rewards: unsupported update operator ${op}`);
    }
  }
  return doc;
}
