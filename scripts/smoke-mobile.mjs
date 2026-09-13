/* smoke-mobile.mjs — boots the built bundle at PHONE width and walks the
 * mobile-native shell end to end: the demo Google gate, the ledger, task
 * completion and its reward beat, the character sheet, rewards, profile and
 * the squad. Temporary dev script, not part of the app.
 *
 * This exercises the real modules (mobile/MobileApp, mobile/useLedger,
 * mobile/stats, mobile/squad, mobile/screens/*) against the real bundle —
 * nothing here re-implements the logic under test.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

// 420x860 is what makes usePhoneViewport() true — the whole point.
const win = new Window({ url: "http://localhost/#/login", width: 420, height: 860 });

class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
win.IntersectionObserver = IO;
win.ResizeObserver = win.ResizeObserver ?? IO;

const g = globalThis;
g.window = win;
g.document = win.document;
for (const k of [
  "navigator",
  "localStorage",
  "sessionStorage",
  "location",
  "history",
  "matchMedia",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "IntersectionObserver",
  "ResizeObserver",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "HashChangeEvent",
  "KeyboardEvent",
  "MouseEvent",
  "CustomEvent",
  "DOMParser",
  "MutationObserver",
  "getSelection",
  "innerWidth",
  "innerHeight",
  "devicePixelRatio",
  "scrollTo",
  "addEventListener",
  "removeEventListener",
]) {
  try {
    if (win[k] !== undefined) g[k] = win[k];
  } catch {
    /* read-only global, skip */
  }
}
g.IntersectionObserver = IO;

const root = win.document.createElement("div");
root.id = "root";
win.document.body.appendChild(root);

const html = readFileSync("dist/index.html", "utf8");
const entry =
  /src="\/assets\/(index-[^"]+\.js)"/.exec(html)?.[1] ??
  readdirSync("dist/assets").find((f) => f.startsWith("index-") && f.endsWith(".js"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => win.document.querySelector(sel);
const qa = (sel) => [...win.document.querySelectorAll(sel)];
const fail = (msg) => {
  console.error("MOBILE SMOKE FAIL:", msg);
  console.error("body:", win.document.body.innerHTML.slice(0, 600));
  process.exit(1);
};
const ok = (m) => console.log("ok", m);

const gotoEarly = async (href, sel, name = href) => {
  win.location.hash = href;
  win.dispatchEvent(new win.HashChangeEvent("hashchange"));
  await sleep(500);
  if (!q(sel)) fail(`${name}: ${sel} missing at ${href}`);
  return q(sel);
};

await import(pathToFileURL(resolve("dist/assets", entry)).href);
await sleep(1600); // boot curtain + first paint

/* --- 1. the gate is the mobile one, and the desktop one is absent --- */
if (!q(".m-login")) fail("mobile login did not mount at 420px");
if (q(".login__grid")) fail("desktop login rendered on a phone viewport");
if (!q(".m-gbtn")) fail("Google button missing");
ok("mobile gate mounted, desktop gate absent");

/* --- 2. demo Google sign-in --- */
q(".m-gbtn").click();
await sleep(150);
const accounts = qa(".m-gpick__a:not(.m-gpick__a--alt)");
if (accounts.length !== 3) fail(`expected 3 demo accounts, got ${accounts.length}`);
ok(
  "account chooser: " +
    accounts.map((a) => a.querySelector(".m-gpick__n").textContent).join(" | "),
);

accounts[0].click();
await sleep(1400); // verify beat + the gate's navigation to #/app

const rawUser = win.localStorage.getItem("sq.user.v1");
if (!rawUser) fail("sign-in did not write an identity");
const user = JSON.parse(rawUser);
if (user.email !== "aarav.sharma1998@gmail.com")
  fail(`wrong identity signed in: ${user.email}`);

const rawProv = win.localStorage.getItem("sq.auth.provider.v1");
if (!rawProv) fail("provider marker not written");
const prov = JSON.parse(rawProv);
if (prov.kind !== "google" || prov.accountId !== "g_aarav")
  fail(`provider marker wrong: ${rawProv}`);
ok(`google sign-in as ${user.email} (provider=${prov.kind})`);

/* --- 3. the shell: bar, five-tab dock, home hero --- */
if (!q(".m-app")) fail("mobile shell did not mount after sign-in");
if (q(".dash")) fail("desktop dashboard rendered inside the phone face");
const dockTabs = qa(".m-dock__t");
if (dockTabs.length !== 5) fail(`dock should have 5 tabs, got ${dockTabs.length}`);
const dockLabels = dockTabs.map((t) => t.querySelector(".m-dock__l").textContent);
if (dockLabels.join(",") !== "Home,Tasks,Progress,Rewards,Profile")
  fail(`dock labels wrong: ${dockLabels.join(",")}`);
ok("dock: " + dockLabels.join(" | "));

if (!q(".m-hero")) fail("home hero missing");
const factors = qa(".m-factor");
if (factors.length !== 7) fail(`expected 7 life factors, got ${factors.length}`);
ok(
  "home: Lv." +
    q(".m-hero__lv-v").textContent +
    " rank " +
    q(".m-hero__rank-v").textContent +
    " · " +
    factors.length +
    " factors",
);

/* --- 4. the ledger starts EMPTY — no seeded tasks. Add one, complete it,
        and watch the reward beat + the ledger move. --- */
const scope = user.email.replace(/[^a-z0-9]/g, "");
const seededTasks = JSON.parse(win.localStorage.getItem(`sq.tasks.${scope}`) ?? "[]");
if (seededTasks.length !== 0) fail("tasks must not be seeded — a fresh ledger starts empty");

await gotoEarly("#/app/tasks", ".m-tasks");
if (qa(".m-chip").length !== 5) fail("task filters missing");
if (!q(".m-fab")) fail("add-goal FAB missing");
if (qa(".m-task").length !== 0) fail("fresh ledger should render zero task rows");

q(".m-fab").click();
await sleep(300);
if (!q(".m-sheet__panel")) fail("new-goal sheet did not open");
const input = q(".m-sheet__panel input");
const setVal = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
setVal.call(input, "Mobile smoke goal");
input.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(120);
const factorBtns = qa(".m-pick__b");
if (factorBtns.length !== 7) fail(`factor picker should offer 7, got ${factorBtns.length}`);
factorBtns[0].click(); // knowledge +2
await sleep(120);
if (!q(".m-payout").textContent.includes("+70"))
  fail(`derived payout wrong: ${q(".m-payout").textContent}`);
qa(".m-sheet__panel .m-btn--go")[0].click();
await sleep(400);
const storedAfterAdd = JSON.parse(win.localStorage.getItem(`sq.tasks.${scope}`) ?? "[]");
if (!storedAfterAdd.some((t) => t.title === "Mobile smoke goal"))
  fail("new goal not persisted");
ok("fresh ledger: added a goal through the sheet (progress +70 / rp +18 derived)");

// back Home — the goal we just added is today's work
win.location.hash = "#/app";
win.dispatchEvent(new win.HashChangeEvent("hashchange"));
await sleep(500);

const before = JSON.parse(win.localStorage.getItem(`sq.profile.${scope}`) ?? "{}");

const cards = qa(".m-task");
if (!cards.length) fail("added goal not on Home");
cards[0].querySelector(".m-task__check").click();
await sleep(400);

const fxLines = qa(".fx__line");
if (!fxLines.length) fail("no reward lines rendered after completing a task");
const fxText = fxLines.map((l) => l.querySelector(".fx__text").textContent);
if (!fxText.some((t) => t.includes("PROGRESS")))
  fail(`reward beat missing +PROGRESS, saw: ${fxText.join(" / ")}`);
ok("reward beat: " + fxText.join(" → "));

const after = JSON.parse(win.localStorage.getItem(`sq.profile.${scope}`));
if (!(after.totalProgress > (before.totalProgress ?? 0)))
  fail(`progress did not persist (${before.totalProgress} -> ${after.totalProgress})`);
if (!(after.rewardPoints > (before.rewardPoints ?? 0)))
  fail("reward points did not persist");
if (after.tasksCompleted !== (before.tasksCompleted ?? 0) + 1)
  fail("tasksCompleted did not increment");
// A seeded task pays knowledge/discipline or strength/energy — at least one
// factor must have moved, which is the "LIFE FACTOR INCREASE" half of the beat.
const movedFactors = Object.keys(after.factors).filter(
  (k) => after.factors[k] !== (before.factors?.[k] ?? after.factors[k]),
);
if (!movedFactors.length) fail("no life factor changed on completion");
ok(
  `ledger: progress ${before.totalProgress ?? 0}->${after.totalProgress}, ` +
    `rp ${before.rewardPoints ?? 0}->${after.rewardPoints}, ` +
    `factors moved: ${movedFactors.join(",")}`,
);

const heroLevel = Number(q(".m-hero__lv-v").textContent);
if (heroLevel !== after.lifeLevel) fail("hero level not in sync with the ledger");
ok(`hero reflects the ledger (Lv.${heroLevel})`);

/* --- 5. tabs --- */
const goto = gotoEarly;

await goto("#/app/tasks", ".m-tasks", "tasks");
ok(`tasks: ${qa(".m-task").length} rows (the sealed one), 5 filters, FAB present`);

await goto("#/app/progress", ".m-prog", "character sheet");
if (!q(".m-radar")) fail("radar chart missing");
if (qa(".m-radar__lab").length !== 7) fail("radar should label 7 axes");
if (qa(".m-attr").length !== 7) fail("attribute rows should be 7");
if (qa(".m-ranks__r").length !== 10) fail("rank ladder should show 10 ranks");
if (!q(".m-ranks__r.is-now")) fail("no current rank highlighted");
const power = Number(q(".m-power__v").textContent);
if (!(power >= 0 && power <= 100)) fail(`power index out of range: ${power}`);
ok(
  `character sheet: power ${power}, archetype ${q(".m-arch__n").textContent}, ` +
    `rank ${q(".m-ranks__r.is-now").textContent}`,
);

await goto("#/app/rewards", ".m-rewards", "rewards");
const rpShown = Number(q(".m-rp__v").textContent.replace(/,/g, ""));
if (rpShown !== after.rewardPoints) fail(`rewards total ${rpShown} != ledger ${after.rewardPoints}`);
if (qa(".m-mark").length !== 9) fail(`expected 9 marks, got ${qa(".m-mark").length}`);
ok(`rewards: ${rpShown} RP, ${qa(".m-mark.is-on").length} marks earned`);

await goto("#/app/stats", ".m-stats", "stats");
if (!q(".ms-counts")) fail("stats counters missing");
if (!q(".ms-heat")) fail("activity field missing");
if (!q(".ms-week")) fail("weekly momentum missing");
if (!q(".ms-gains")) fail("factor growth missing");
ok(`stats screen: ${qa(".ms-heat__c:not(.ms-heat__c--off)").length} active days rendered`);

await goto("#/app/squad", ".m-squad", "squad");
if (qa(".m-slot").length !== 4) fail("formation should have 4 slots");
if (!q(".m-mem.is-self")) fail("operator missing from their own squad");
const roster = qa(".m-mem");
// No seeded people: a fresh squad is exactly the operator. Real operators
// join through the live roster fetched from the backend.
if (roster.length !== 1) fail(`fresh squad should hold only the operator, got ${roster.length}`);
ok(
  `squad "${q(".m-head__t").textContent.trim()}": ${roster.length} member (unseeded), ` +
    `${qa(".m-slot.is-filled").length}/4 slots filled`,
);

// fill an empty slot: the sheet must offer the roster, not disabled buttons
const emptySlot = qa(".m-slot__empty")[0];
if (!emptySlot) fail("squad should seed with an open formation slot");
emptySlot.click();
await sleep(350);
const cands = qa(".m-cand__b");
if (!cands.length) fail("empty slot offered no candidates");
const emptyRole = qa(".m-slot:not(.is-filled) .m-slot__role")[0].textContent.trim();
const picked = cands[0].querySelector(".m-cand__n").textContent;
const wasBenched = cands[0].querySelector(".m-cand__s").textContent.includes("bench");
cands[0].click();
await sleep(350);

const sq = JSON.parse(win.localStorage.getItem(`sq.squad.${scope}`));
const placed = sq.members.find((m) => m.name === picked);
if (!placed?.role) fail(`picked member ${picked} was not given a slot`);
// one member per slot — a move must vacate the old one, never double-book
const roles = sq.members.map((m) => m.role).filter(Boolean);
if (new Set(roles).size !== roles.length) fail(`slots double-booked: ${roles.join(",")}`);
const domSlots = qa(".m-slot");
if (domSlots.length !== 4) fail("formation should still render 4 slots");
ok(
  `formation: ${picked} -> ${placed.role} (${wasBenched ? "filled from bench" : "moved"}), ` +
    `roles [${roles.join(",")}], persisted`,
);
if (!emptyRole) fail("could not read the empty slot's role label");

await goto("#/app/profile", ".m-profile", "profile");
if (q(".m-id__e").textContent !== user.email) fail("profile shows the wrong identity");
if (!q(".m-g")) fail("google connection panel missing");
if (!q(".m-g__e").textContent.includes("aarav.sharma1998@gmail.com"))
  fail("profile does not show the attached google account");
ok(`profile: ${q(".m-id__n").textContent} / ${q(".m-g__e").textContent}`);

/* --- 6. the docked tabs navigate --- */
win.location.hash = "#/app";
win.dispatchEvent(new win.HashChangeEvent("hashchange"));
await sleep(400);
dockTabs[2].click(); // Progress
await sleep(500);
if (win.location.hash !== "#/app/progress") fail(`dock did not navigate: ${win.location.hash}`);
if (!q(".m-prog")) fail("dock navigation did not render the character sheet");
ok("bottom dock navigates (Progress -> #/app/progress)");

console.log("MOBILE SMOKE PASS");
process.exit(0);
