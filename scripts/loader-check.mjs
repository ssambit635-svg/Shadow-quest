/* loader-check.mjs — runtime proof that THE site loader works end to end.
 *
 * Boots dist/index.html in happy-dom, runs the real /sq-loader.js against it,
 * and asserts the full contract:
 *   1. loader element exists, state becomes "pending"
 *   2. counter ticks 000 -> up (progress bar moves, stage text set)
 *   3. __SQ_EXIT_INITIAL_LOADER() exits with blade+panels, removes the node
 *   4. `sq:initial-loader-done` fires and __SQ_LOADER_STATE becomes "done"
 *   5. explicit skip (session seen) removes the loader immediately
 *
 * Run:  npm run smoke:loader   (builds first via presmoke:loader)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "dist/index.html"), "utf8");
const driver = readFileSync(resolve(root, "public/sq-loader.js"), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
};

async function main() {
  // ---- Test 1: fresh visit — full run ------------------------------------
  const win = new Window({ url: "http://localhost/?loader" });
  win.document.write(html);
  win.document.close();
  let doneEvents = 0;
  win.addEventListener("sq:initial-loader-done", () => (doneEvents += 1));

  // Run the real driver inside the page context.
  win.eval(driver);

  check("loader element present", !!win.document.getElementById("sq-initial-loader"));
  check("state is pending", win.__SQ_LOADER_STATE === "pending");

  await sleep(700);
  const num = win.document.querySelector("[data-boot-num]")?.textContent;
  const stage = win.document.querySelector("[data-boot-stage]")?.textContent;
  check(`counter ticked (num=${num})`, !!num && num !== "000");
  check(`stage text set (stage="${stage}")`, !!stage && stage.length > 2);

  // Force the exit (same call React's safety timer would make).
  win.__SQ_EXIT_INITIAL_LOADER();
  await sleep(1400);
  check("loader removed after exit", !win.document.getElementById("sq-initial-loader"));
  check("done event fired exactly once", doneEvents === 1);
  check("state is done", win.__SQ_LOADER_STATE === "done");
  check("scroll lock released", win.document.documentElement.style.overflow === "");
  await win.happyDOM.close();

  // A stored session flag must no longer hide the loader on reload.
  const returning = new Window({ url: "http://localhost/" });
  returning.document.write(html);
  returning.document.close();
  returning.sessionStorage.setItem("sq.boot.seen.v4", "1");
  returning.eval(driver);
  check("returning visit still displays the loader", !!returning.document.getElementById("sq-initial-loader"));
  let exitingEvents = 0;
  returning.addEventListener("sq:initial-loader-exiting", () => exitingEvents++);
  returning.__SQ_EXIT_INITIAL_LOADER();
  check("app reveal starts before curtain removal", exitingEvents === 1 && !!returning.document.getElementById("sq-initial-loader"));
  await returning.happyDOM.close();

  // ---- Test 2: explicit skip — instant skip ---------------------------------
  const win2 = new Window({ url: "http://localhost/?noloader" });
  win2.document.write(html);
  win2.document.close();
  win2.sessionStorage.setItem("sq.boot.seen.v4", "1");
  let done2 = 0;
  win2.addEventListener("sq:initial-loader-done", () => (done2 += 1));
  win2.eval(driver);
  check("explicit skip removes loader instantly", !win2.document.getElementById("sq-initial-loader"));
  check("explicit skip still fires done event", done2 === 1);
  await win2.happyDOM.close();

  if (failures) {
    console.error(`\nloader-check: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nloader-check: all checks passed — the site loader works.");
}

main().catch((err) => {
  console.error("loader-check CRASHED:", err);
  process.exit(1);
});
