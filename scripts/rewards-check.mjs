/* rewards-check.mjs — proof that the Daily Coin Reward and the Streak Freeze
 * Shield are decided by the backend, from the operator's own stored data, and
 * survive a refresh, a sign-out/sign-in and a restart.
 *
 * Nothing here re-implements a rule: every assertion drives the REAL API over
 * HTTP against the REAL store (the file store when no MONGODB_URI is set —
 * same documents, same filters as the MongoDB branch), and the reward state is
 * read back out of the persisted document afterwards.
 *
 * Run:  node scripts/rewards-check.mjs
 *
 * Covers, in order:
 *   1  the daily bonus pays once, and a replay pays nothing
 *   2  another "device" (a second sign-in) sees the same state
 *   3  Life Factor trends are computed from stored completed work
 *   4  the shield costs points, respects the cap, and refuses a short balance
 *   5  one shield covers exactly one missed day — a second use is refused
 *   6  a chain broken by more than one day cannot be rescued
 *   7  a client cannot name a day, a timezone, or a reward state
 *   8  everything survives a backend restart (the state is persisted)
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "server");
const DAY_MS = 86400000;

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

/* ------------------------------------------------------------------ *
 * harness
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fileThere = async (p) => {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
};

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

class Api {
  constructor(base) {
    this.base = base;
  }
  async call(pathname, { method = "GET", token, body } = {}) {
    const res = await fetch(`${this.base}${pathname}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await res.json().catch(() => null);
    return { status: res.status, body: raw };
  }
}

/** True when something already answers on this port — a stale backend. */
async function portAnswers(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Wait until nothing answers on the port (the previous process is really gone). */
async function portQuiet(port, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!(await portAnswers(port))) return true;
    await sleep(100);
  }
  return false;
}

/** A backend process on a fixed data dir, so a restart reads the same store. */
function startApi(port, dataDir) {
  const child = spawn(process.execPath, ["src/index.mjs"], {
    cwd: SERVER,
    env: {
      ...process.env,
      PORT: String(port),
      SQ_DATA_DIR: dataDir,
      MONGODB_URI: "",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  const keep = (buf) => log.push(String(buf).trim());
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  child.log = log;
  return child;
}

async function waitForHealth(api, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await api.call("/v1/health");
      if (r.status === 200 && r.body?.ok) return r.body;
    } catch {
      /* not up yet */
    }
    await sleep(120);
  }
  return null;
}

const stop = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000).unref();
  });

/* ------------------------------------------------------------------ *
 * fixtures — a real ledger, shaped exactly like lib/todo pushes it
 * ------------------------------------------------------------------ */

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

function task(id, { at = 0, factors = [], title = id, status = "completed" } = {}) {
  return {
    id,
    title,
    priority: "medium",
    difficulty: "normal",
    daily: false,
    factors,
    progress: 40,
    rewardPoints: 18,
    status,
    createdAt: at - 1000,
    ...(status === "completed" ? { completedAt: at } : {}),
  };
}

function profile(patch = {}) {
  return {
    handle: "Reward Tester",
    lifeLevel: 3,
    totalProgress: 900,
    levelProgress: 120,
    progressToNext: 178,
    growthRank: "E",
    rewardPoints: 0,
    energy: 70,
    energyMax: 100,
    streak: 5,
    longestStreak: 5,
    factors: {
      knowledge: 12,
      focus: 10,
      discipline: 8,
      strength: 8,
      energy: 70,
      wellness: 10,
      skills: 10,
    },
    skills: [],
    focusArea: "General Development",
    tasksCompleted: 2,
    todayCompleted: 1,
    ...patch,
  };
}

const ledger = ({ tasks = [], habits = [], profile: p = profile() } = {}) => ({
  profile: p,
  tasks,
  habits,
});

/* ------------------------------------------------------------------ *
 * the run
 * ------------------------------------------------------------------ */

async function main() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "sq-rewards-"));
  const port = await freePort();
  const api = new Api(`http://127.0.0.1:${port}`);
  const email = "rewards.tester@example.test";
  const password = "Str0ng-Passphrase!";

  check("the test port is free before the backend starts", !(await portAnswers(port)));

  let child = startApi(port, dataDir);
  try {
  const health = await waitForHealth(api);
  check(
    "backend is up — and it is the process this harness started",
    health?.ok === true && health?.pid === child.pid,
    `db=${health?.db} pid=${health?.pid} spawned=${child.pid}`,
  );
  if (!health) console.log(child.log.join("\n"));
  check("store reports file (no MongoDB configured here)", health?.db === "file");

  /* — 1. identity — the ledger is scoped to a real signed-in operator — */
  const signin = await api.call("/v1/auth/signin", {
    method: "POST",
    body: { handle: "Reward Tester", email, password },
  });
  const token = signin.body?.token;
  check("sign-up returns a bearer token", !!token, `mode=${signin.body?.mode}`);

  const today = dayKey(Date.now());

  // A day's work: one daily goal sealed today, and the profile the engine
  // would have written (rewardPoints 0).
  await api.call("/v1/ledger", {
    method: "PUT",
    token,
    body: ledger({
      tasks: [task("t_today", { at: Date.now(), factors: [{ factor: "knowledge", amount: 4 }] })],
      profile: profile({ rewardPoints: 0, todayCompleted: 1 }),
    }),
  });

  const before = await api.call("/v1/rewards?tz=0", { token });
  check("rewards state reads back", before.status === 200 && !!before.body?.state);
  check(
    "daily bonus is ready once a goal is sealed today",
    before.body?.state?.daily?.ready === true,
    `reason=${before.body?.state?.daily?.reason} goals=${before.body?.state?.daily?.evidence?.goals}`,
  );
  check(
    "no shield owned, and none affordable at 0 points",
    before.body?.state?.shield?.count === 0 && before.body?.state?.shield?.canBuy === false,
    `buyReason=${before.body?.state?.shield?.buyReason}`,
  );

  /* — 1. daily coin reward: paid once, and never twice — */
  const claim1 = await api.call("/v1/rewards/daily/claim", {
    method: "POST",
    token,
    body: { tz: 0, day: today },
  });
  check("first claim pays the bonus", claim1.body?.awarded === true, `reason=${claim1.body?.reason}`);
  check("the payout lands in the balance", claim1.body?.state?.points === 25, `points=${claim1.body?.state?.points}`);
  check("the amount is the server's, not the client's", claim1.body?.state?.daily?.amount === 25);

  const claim2 = await api.call("/v1/rewards/daily/claim", {
    method: "POST",
    token,
    body: { tz: 0, day: today },
  });
  check("a replay is refused", claim2.body?.awarded === false && claim2.body?.reason === "claimed");
  check("the replay pays nothing", claim2.body?.state?.points === 25, `points=${claim2.body?.state?.points}`);

  const claim3 = await api.call("/v1/rewards/daily/claim", {
    method: "POST",
    token,
    body: { tz: 0 }, // no day at all — the server computes it
  });
  check("a claim without a day still cannot pay twice", claim3.body?.awarded === false);

  /* — 7. a client cannot name a day or a timezone it is not in — */
  const tomorrow = dayKey(Date.now() + DAY_MS);
  const liar = await api.call("/v1/rewards/daily/claim", {
    method: "POST",
    token,
    body: { tz: 0, day: tomorrow },
  });
  check("claiming another day is refused outright", liar.status === 400, `status=${liar.status}`);
  const badTz = await api.call("/v1/rewards/daily/claim", {
    method: "POST",
    token,
    body: { tz: 9999 },
  });
  check("an impossible timezone offset is refused", badTz.status === 400, `status=${badTz.status}`);
  const badGet = await api.call("/v1/rewards?tz=9999", { token });
  check("the same guard holds on the read", badGet.status === 400, `status=${badGet.status}`);

  /* — 2. another device: sign in again, same account, same state — */
  const second = await api.call("/v1/auth/signin", {
    method: "POST",
    body: { handle: "Reward Tester", email, password },
  });
  const token2 = second.body?.token;
  check("second sign-in succeeds (another device)", !!token2 && second.body?.mode === "verified");
  const seenFromB = await api.call("/v1/rewards?tz=0", { token: token2 });
  check(
    "device B sees the day already claimed",
    seenFromB.body?.state?.daily?.claimed === true,
    `claimedDate=${seenFromB.body?.state?.daily?.claimedDate}`,
  );
  const bClaim = await api.call("/v1/rewards/daily/claim", {
    method: "POST",
    token: token2,
    body: { tz: 0 },
  });
  check("device B cannot claim the same day again", bClaim.body?.awarded === false);
  check("device B sees the same balance", bClaim.body?.state?.points === 25);

  /* — 3. Life Factor trends, from real completed work — */
  await api.call("/v1/ledger", {
    method: "PUT",
    token: token2,
    body: ledger({
      tasks: [
        // this window (2 days ago)
        task("t_recent", {
          at: Date.now() - 2 * DAY_MS,
          factors: [
            { factor: "knowledge", amount: 3 },
            { factor: "focus", amount: 2 },
          ],
        }),
        // the window before it (10 days ago)
        task("t_previous", {
          at: Date.now() - 10 * DAY_MS,
          factors: [
            { factor: "knowledge", amount: 1 },
            { factor: "discipline", amount: 5 },
          ],
        }),
      ],
      profile: profile({ rewardPoints: 25, factors: { ...profile().factors, knowledge: 72, focus: 61, discipline: 84 } }),
    }),
  });
  const trend = await api.call("/v1/progress/factors?days=7", { token: token2 });
  const items = trend.body?.items ?? [];
  const of = (f) => items.find((i) => i.factor === f);
  check("trends answer for every Life Factor", items.length === 7, `items=${items.length}`);
  check(
    "Knowledge reads 72 with a +2 swing against the last window",
    of("knowledge")?.value === 72 && of("knowledge")?.delta === 2 && of("knowledge")?.direction === "up",
    `value=${of("knowledge")?.value} cur=${of("knowledge")?.current} prev=${of("knowledge")?.previous} delta=${of("knowledge")?.delta}`,
  );
  check(
    "Discipline trends down: nothing this week against 5 last",
    of("discipline")?.delta === -5 && of("discipline")?.direction === "down",
    `delta=${of("discipline")?.delta}`,
  );
  check(
    "Focus trends up by the work done in this window",
    of("focus")?.delta === 2 && of("focus")?.direction === "up",
    `delta=${of("focus")?.delta}`,
  );
  check(
    "a factor nobody trained reads flat, not missing",
    of("strength")?.delta === 0 && of("strength")?.direction === "flat",
  );
  const clamped = await api.call("/v1/progress/factors?days=9999", { token: token2 });
  check("the trend window is clamped, never unbounded", clamped.body?.days === 84, `days=${clamped.body?.days}`);

  /* — 4. the shield: costs points, respects the cap — */
  const poor = await api.call("/v1/rewards/shield/buy", { method: "POST", token: token2, body: { tz: 0 } });
  check(
    "a short balance cannot buy a shield",
    poor.body?.bought === false && poor.body?.reason === "not-enough-points",
    `reason=${poor.body?.reason}`,
  );

  await api.call("/v1/ledger", {
    method: "PUT",
    token: token2,
    body: ledger({
      tasks: [task("t_today", { at: Date.now(), factors: [{ factor: "knowledge", amount: 4 }] })],
      profile: profile({ rewardPoints: 1000 }),
    }),
  });
  const buy1 = await api.call("/v1/rewards/shield/buy", { method: "POST", token: token2, body: { tz: 0 } });
  check("buying a shield spends exactly the cost", buy1.body?.bought === true && buy1.body?.state?.points === 850, `points=${buy1.body?.state?.points}`);
  check("the shield is owned, once", buy1.body?.state?.shield?.count === 1);
  await api.call("/v1/rewards/shield/buy", { method: "POST", token: token2, body: { tz: 0 } });
  const buy3 = await api.call("/v1/rewards/shield/buy", { method: "POST", token: token2, body: { tz: 0 } });
  check("shields stack to the cap", buy3.body?.state?.shield?.count === 3, `count=${buy3.body?.state?.shield?.count}`);
  const buy4 = await api.call("/v1/rewards/shield/buy", { method: "POST", token: token2, body: { tz: 0 } });
  check("the cap holds", buy4.body?.bought === false && buy4.body?.reason === "at-max");
  check("nothing was spent on the refused purchase", buy4.body?.state?.points === 550, `points=${buy4.body?.state?.points}`);

  /* — 5. one shield covers one missed day — */
  // Yesterday missed, the day before that sealed: exactly one gap.
  await api.call("/v1/ledger", {
    method: "PUT",
    token: token2,
    body: ledger({
      tasks: [task("t_gap", { at: Date.now() - 2 * DAY_MS, factors: [{ factor: "discipline", amount: 2 }] })],
      profile: profile({ rewardPoints: 550, streak: 6, longestStreak: 6, lastActiveDate: dayKey(Date.now() - 2 * DAY_MS) }),
    }),
  });
  const gap = await api.call("/v1/rewards?tz=0", { token: token2 });
  const yesterday = dayKey(Date.now() - DAY_MS);
  check(
    "the missed day is detected from stored work",
    gap.body?.state?.shield?.missedDate === yesterday && gap.body?.state?.shield?.canUse === true,
    `missed=${gap.body?.state?.shield?.missedDate} reason=${gap.body?.state?.shield?.useReason}`,
  );

  const use1 = await api.call("/v1/rewards/shield/use", { method: "POST", token: token2, body: { tz: 0 } });
  check("using the shield covers that day", use1.body?.used === true && use1.body?.date === yesterday);
  check("the shield is spent", use1.body?.state?.shield?.count === 2, `count=${use1.body?.state?.shield?.count}`);
  check(
    "the covered day is recorded",
    use1.body?.state?.shield?.protectedDates?.includes(yesterday) === true,
  );

  const use2 = await api.call("/v1/rewards/shield/use", { method: "POST", token: token2, body: { tz: 0 } });
  check(
    "a second use cannot cover the same day again",
    use2.body?.used === false && use2.body?.state?.shield?.count === 2,
    `reason=${use2.body?.reason}`,
  );
  check(
    "a second use does not stack protected days",
    use2.body?.state?.shield?.protectedDates?.length === 1,
    `protected=${use2.body?.state?.shield?.protectedDates?.length}`,
  );

  // The covered day is now part of the chain: the streak is not broken.
  check(
    "the covered day reads as held, not missed",
    use2.body?.state?.shield?.useReason === "no-miss",
    `reason=${use2.body?.state?.shield?.useReason}`,
  );

  /* — 6. a chain already broken cannot be rescued by one shield — */
  await api.call("/v1/ledger", {
    method: "PUT",
    token: token2,
    body: ledger({
      tasks: [task("t_old", { at: Date.now() - 4 * DAY_MS })],
      profile: profile({ rewardPoints: 550, lastActiveDate: dayKey(Date.now() - 4 * DAY_MS) }),
    }),
  });
  const broken = await api.call("/v1/rewards?tz=0", { token: token2 });
  check(
    "two missed days are beyond one shield",
    broken.body?.state?.shield?.canUse === false && broken.body?.state?.shield?.useReason === "chain-broken",
    `reason=${broken.body?.state?.shield?.useReason}`,
  );
  const brokenUse = await api.call("/v1/rewards/shield/use", { method: "POST", token: token2, body: { tz: 0 } });
  check("the refusal costs nothing", brokenUse.body?.used === false && brokenUse.body?.state?.shield?.count === 2);

  /* — a brand new operator has no chain to protect — */
  const other = await api.call("/v1/auth/signin", {
    method: "POST",
    body: { handle: "Fresh", email: "fresh.tester@example.test", password },
  });
  const token3 = other.body?.token;
  await api.call("/v1/ledger", { method: "PUT", token: token3, body: ledger({ tasks: [], profile: profile({ rewardPoints: 900 }) }) });
  const noChain = await api.call("/v1/rewards/shield/use", { method: "POST", token: token3, body: { tz: 0 } });
  check(
    "no recorded work means no chain to protect",
    noChain.body?.used === false && noChain.body?.reason === "no-chain",
    `reason=${noChain.body?.reason}`,
  );

  /* — 7. the frontend cannot write reward state — */
  await api.call("/v1/ledger", {
    method: "PUT",
    token: token3,
    body: {
      ...ledger({ tasks: [], profile: profile({ rewardPoints: 900 }) }),
      rewards: { shields: 99, dailyClaimDate: "", dailyClaims: 0, protectedDates: [yesterday] },
    },
  });
  const afterTamper = await api.call("/v1/rewards?tz=0", { token: token3 });
  check(
    "a pushed `rewards` blob is ignored by the ledger write",
    afterTamper.body?.state?.shield?.count === 0 && afterTamper.body?.state?.daily?.claims === 0,
    `shields=${afterTamper.body?.state?.shield?.count} claims=${afterTamper.body?.state?.daily?.claims}`,
  );
  check(
    "and it does not fabricate protected days",
    (afterTamper.body?.state?.shield?.protectedDates ?? []).length === 0,
  );

  /* — the reward state a tampered push cannot touch, on the real account — */
  const stillHeld = await api.call("/v1/rewards?tz=0", { token: token2 });
  check(
    "the real account keeps its shield and its covered day",
    stillHeld.body?.state?.shield?.count === 2 &&
      stillHeld.body?.state?.shield?.protectedDates?.includes(yesterday) === true,
  );

  /* — 8. restart: the state is persisted, not held in memory — */
  // The file store persists on a short debounce (the MongoDB branch has no
  // such delay), so give the last write a beat before stopping the process —
  // otherwise this would be testing the debounce, not the state.
  await sleep(700);
  const firstPid = child.pid;
  await stop(child);
  const quiet = await portQuiet(port);
  child = startApi(port, dataDir);
  const health2 = await waitForHealth(api);
  check(
    "backend came back up on the same data dir",
    health2?.ok === true && health2?.pid === child.pid && child.pid !== firstPid,
    `pid ${firstPid} → ${health2?.pid} (spawned ${child.pid})`,
  );
  check("the previous process released the port", quiet);

  const third = await api.call("/v1/auth/signin", {
    method: "POST",
    body: { handle: "Reward Tester", email, password },
  });
  const afterRestart = await api.call("/v1/rewards?tz=0", { token: third.body?.token });
  check(
    "the daily bonus is still spent after a restart",
    afterRestart.body?.state?.daily?.claimed === true && afterRestart.body?.state?.daily?.claimedDate === today,
    `claimedDate=${afterRestart.body?.state?.daily?.claimedDate}`,
  );
  check("the balance survived", afterRestart.body?.state?.points === 550, `points=${afterRestart.body?.state?.points}`);
  check(
    "the shield and its covered day survived",
    afterRestart.body?.state?.shield?.count === 2 &&
      afterRestart.body?.state?.shield?.protectedDates?.includes(yesterday) === true,
  );
  check("the day counter survived", afterRestart.body?.state?.daily?.claims === 1);

  const replay = await api.call("/v1/rewards/daily/claim", {
    method: "POST",
    token: third.body?.token,
    body: { tz: 0 },
  });
  check("and a replay after the restart still pays nothing", replay.body?.awarded === false);

  /* — the persisted document itself — */
  // The file store flushes on a short debounce, so give the write a moment to
  // land rather than racing it.
  const storeFile = path.join(dataDir, "db.json");
  for (let i = 0; i < 40 && !(await fileThere(storeFile)); i++) await sleep(100);
  const raw = JSON.parse(await readFile(storeFile, "utf8"));
  const doc = (raw.users ?? []).find((u) => u.email === email);
  check(
    "the document carries the reward record",
    doc?.rewards?.dailyClaimDate === today && doc?.rewards?.shields === 2,
    `claimDate=${doc?.rewards?.dailyClaimDate} shields=${doc?.rewards?.shields}`,
  );
  check(
    "and it is stored beside the ledger, not inside the profile blob",
    doc?.rewards !== undefined && doc?.profile?.shield === undefined,
  );

  await stop(child);
  await rm(dataDir, { recursive: true, force: true });
  } finally {
    // Never leave a backend behind, even when a check blows up.
    if (failures) console.log(`\n--- backend log ---\n${child.log.join("\n")}`);
    await stop(child);
  }

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("rewards-check crashed:", err);
  process.exit(1);
});
