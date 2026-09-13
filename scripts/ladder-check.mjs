/* ladder-check.mjs — render #/app/ladder from the built bundle in happy-dom
 * and report what the Milestones screen actually shows. Dev-only probe. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const ORIGIN = process.argv[2] ?? "http://localhost:5173";
const LABEL = process.argv[3] ?? ORIGIN;

const win = new Window({ url: `${ORIGIN}/#/app/ladder` });

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
  "navigator", "localStorage", "sessionStorage", "location", "history",
  "matchMedia", "requestAnimationFrame", "cancelAnimationFrame",
  "getComputedStyle", "IntersectionObserver", "ResizeObserver", "HTMLElement",
  "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "CustomEvent",
  "DOMParser", "MutationObserver", "getSelection", "fetch", "Headers",
  "Request", "Response", "EventSource", "innerWidth", "innerHeight",
  "devicePixelRatio", "scrollTo", "addEventListener", "removeEventListener",
]) {
  try {
    if (win[k] !== undefined) g[k] = win[k];
  } catch {
    /* read-only */
  }
}
g.IntersectionObserver = IO;

// A signed-in operator with a real recorded ledger on this device.
win.localStorage.setItem(
  "sq.user.v1",
  JSON.stringify({ handle: "Aritra", email: "arit@test.io", joinedAt: Date.now() }),
);
const scope = "arit@test.io".toLowerCase().replace(/[^a-z0-9]/g, ""); // scopeOf()
win.localStorage.setItem(
  `sq.profile.${scope}`,
  JSON.stringify({
    handle: "Aritra",
    lifeLevel: 4,
    totalProgress: 1240,
    levelProgress: 240,
    progressToNext: 500,
    growthRank: "D",
    rewardPoints: 320,
    energy: 70,
    energyMax: 100,
    streak: 6,
    longestStreak: 9,
    factors: { knowledge: 30, focus: 22, discipline: 18, strength: 5, energy: 4, wellness: 6, skills: 12 },
    skills: [],
    focusArea: "Backend Craft",
    tasksCompleted: 17,
    todayCompleted: 2,
    lastActiveDate: new Date().toISOString().slice(0, 10),
  }),
);

const root = win.document.createElement("div");
root.id = "root";
win.document.body.appendChild(root);

const html = readFileSync("dist/index.html", "utf8");
const entry =
  /src="\/assets\/(index-[^"]+\.js)"/.exec(html)?.[1] ??
  readdirSync("dist/assets").find((f) => f.startsWith("index-") && f.endsWith(".js"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await import(pathToFileURL(resolve("dist/assets", entry)).href);
await sleep(2500);

const q = (s) => win.document.querySelector(s);
const badge = q(".ladder__badge");
const rows = [...win.document.querySelectorAll(".ladder__row:not(.ladder__row--sk)")].map(
  (tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()).join(" | "),
);
console.log(`--- ${LABEL} ---`);
console.log("badge      :", badge ? `${badge.className} → ${badge.textContent.trim()}` : "(none)");
console.log("error block:", q(".ladder__error") ? q(".ladder__error").textContent.trim().slice(0, 160) : "(none)");
console.log("lede note  :", q(".ladder__mock") ? q(".ladder__mock").textContent.trim().slice(0, 140) : "(none)");
console.log("rows       :", rows.length ? rows.join("\n             ") : "(empty state) " + (q(".ladder__row--empty")?.textContent.trim() ?? ""));
const failed = Boolean(q(".ladder__error")) || !badge;
console.log(failed ? "RESULT: FAIL — milestones still shows an error" : "RESULT: PASS — milestones renders");
process.exit(failed ? 1 : 0);
