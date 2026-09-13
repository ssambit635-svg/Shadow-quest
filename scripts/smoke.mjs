/* smoke.mjs — boots the built bundle in happy-dom and clicks through the
 * new Deep Work room. Temporary dev script, not part of the app. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost/#/app/field" });

// happy-dom gaps the app touches
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

// signed-in operator so the gate lets us into the room
win.localStorage.setItem(
  "sq.user.v1",
  JSON.stringify({ handle: "Smoke", email: "smoke@test.io", joinedAt: Date.now() }),
);

const root = win.document.createElement("div");
root.id = "root";
win.document.body.appendChild(root);

const html = readFileSync("dist/index.html", "utf8");
const entry = /src="\/assets\/(index-[^"]+\.js)"/.exec(html)?.[1] ?? readdirSync("dist/assets").find((f) => f.startsWith("index-") && f.endsWith(".js"));
console.log("entry:", entry);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => win.document.querySelector(sel);
const qa = (sel) => [...win.document.querySelectorAll(sel)];
const fail = (msg) => {
  console.error("SMOKE FAIL:", msg);
  process.exit(1);
};

await import(pathToFileURL(resolve("dist/assets", entry)).href);
await sleep(1600); // boot + first paint

// 1 — the picker is on screen
if (!q(".pick__grid")) fail("picker grid missing; body=" + win.document.body.innerHTML.slice(0, 400));
const cards = qa(".tech");
if (cards.length !== 6) fail(`expected 6 technique cards, got ${cards.length}`);
console.log("ok picker:", cards.map((c) => c.querySelector(".tech__name").textContent).join(" | "));

// 2 — pick kaizen, begin
cards[5].click();
await sleep(60);
if (!qa(".tech[data-sel] .tech__name").some((n) => n.textContent.includes("Kaizen"))) fail("kaizen not selected");
qa(".pick__go .btn").find?.((b) => b.textContent.includes("Begin Session"))?.click();
await sleep(300);

// 3 — the room: ring, six cycle seals, log opened
if (!q(".sring")) fail("session ring missing");
if (qa(".field__cycles i").length !== 6) fail("cycle seals != 6");
if (!q(".slog__list").textContent.includes("Session opened")) fail("opening log line missing");
console.log("ok room open; time reads", q(".sring__time").textContent);

// 4 — hold starts the clock
qa(".sess__ctl .btn")[0].click();
await sleep(1300);
const t1 = q(".sring__time").textContent;
if (t1 === "15:00") fail("clock did not move after hold");
if (!q(".slog__list").textContent.includes("Focus begins")) fail("focus-begin log line missing");
console.log("ok clock running at", t1);

// 5 — pause freezes it
qa(".sess__ctl .btn")[0].click();
await sleep(200);
const t2 = q(".sring__time").textContent;
await sleep(1200);
if (q(".sring__time").textContent !== t2) fail("clock moved while paused");
console.log("ok paused at", t2);

// 6 — settle focus early → rest phase with brass ring
win.document.dispatchEvent; // noop
const skipBtn = qa(".sess__ctl .btn").find((b) => b.textContent.includes("Settle focus"));
skipBtn.click();
await sleep(300);
if (q(".sring")?.getAttribute("data-phase") !== "rest") fail("not in rest after settling focus");
if (!q(".slog__list").textContent.includes("Focus held")) fail("focus-held log line missing");
if (qa(".field__cycles i[data-done]").length !== 1) fail("cycle seal not stamped");
console.log("ok rest phase, ring drains from", q(".sring__time").textContent);

// 7 — target rail: add a goal, link it, seal it
const input = q("#quick");
// React tracks the value setter on the prototype — go through it
const setVal = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
setVal.call(input, "Smoke the session");
input.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(50);
q(".target__add-go").click();
await sleep(100);
const row = qa(".target__row").find((r) => r.textContent.includes("Smoke the session"));
if (!row) fail("quick-added task not in rail");
if (!q(".target__linked")?.textContent.includes("Smoke the session")) fail("quick-add did not auto-link");
row.click(); // unlink
await sleep(50);
if (q(".target__linked")) fail("unlink failed");
row.click(); // link again
await sleep(50);
if (!q(".target__linked")) fail("relink failed");
q(".target__seal-btn").click();
await sleep(150);
if (!q(".slog__list").textContent.includes("Sealed: Smoke the session")) fail("seal log line missing");
const stored = JSON.parse(win.localStorage.getItem("sq.tasks.smoketestio") ?? "[]");
if (!stored.some((t) => t.title === "Smoke the session" && t.status === "completed"))
  fail("sealed task not persisted completed");
console.log("ok ledger seal persisted");

// 8 — sheathe → summary with the 完 seal
qa(".sess__ctl .btn").find((b) => b.textContent.includes("sheathe")).click();
await sleep(300);
if (!q(".summ__seal")) fail("summary seal missing");
console.log("ok summary:", q(".summ__sub").textContent.trim());

// 9 — session survives a "refresh": fresh hook state reads the same record
const rec = JSON.parse(win.localStorage.getItem("sq.session.v2"));
if (!rec || rec.phase !== "done") fail("persisted session record wrong");
console.log("ok persisted record phase:", rec.phase, "focusMs:", rec.focusMs);

// 10 — habits: back to the dashboard, seal one, arm the reminder
qa(".summ__actions .btn").find((b) => b.textContent.includes("Back to Dashboard")).click();
await sleep(1600); // the ink wipe bridges the route swap
if (!q(".habits")) fail("habits panel missing on dashboard");
const habitRows = qa(".habit");
if (habitRows.length < 2) fail("seed habits missing");
const check = habitRows[0].querySelector(".habit__check");
check.click();
await sleep(120);
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const hs = JSON.parse(win.localStorage.getItem("sq.habits.smoketestio") ?? "[]");
if (!hs[0]?.history?.includes(iso)) fail("habit seal not persisted for today");
if (!habitRows[0].querySelector(".habit__streak").textContent.includes("×1")) fail("streak not ×1 after seal");
q(".habits__arm").click();
await sleep(80);
if (win.localStorage.getItem("sq.habits.remind.smoketestio") !== "1") fail("reminder arm not persisted");
console.log("ok habits: sealed today, streak ×1, reminder armed");

console.log("SMOKE PASS");
process.exit(0);
