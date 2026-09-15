/* loader-exit-check.mjs — regression guard for the loader's EXIT.
 * Incident (2026-09-15): an opaque container matching the panels hid their
 * exit motion, leaving a black hang followed by a jump-cut. The container
 * must stay transparent; the five opaque panels provide loading coverage.
 * Checks dist/index.html critical CSS and the real public/sq-loader.js driver.
 * Run: npm run smoke:loader:exit (builds first).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "dist/index.html"), "utf8");
const driver = readFileSync(resolve(root, "public/sq-loader.js"), "utf8");
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures += 1;
};
const styleMatch = html.match(/<style id="sq-critical-loader">([\s\S]*?)<\/style>/);
const css = styleMatch ? styleMatch[1] : "";
const blockOf = (selectorRe) => css.match(selectorRe)?.[1] || "";
const bgOf = (block) => block.match(/background\s*:\s*([^;]+);/)?.[1].trim() || "(none declared)";
const isTransparent = (v) =>
  /transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(v) || v === "(none declared)";

const containerBg = bgOf(blockOf(/#sq-initial-loader\s*\{([^}]*)\}/));
const panelBlock = blockOf(/#sq-initial-loader\s+\.boot__panel\s*\{([^}]*)\}/);
const panelBg = bgOf(panelBlock);
check("critical loader CSS exists", !!styleMatch);
check("bundled stylesheet matches critical loader CSS", css.trim() === readFileSync(resolve(root, "src/styles/loader.css"), "utf8").trim());
check("curtain container background is TRANSPARENT", isTransparent(containerBg), `bg=${containerBg}`);
check("panel background is OPAQUE (the cover)", !isTransparent(panelBg), `bg=${panelBg}`);
check("container bg differs from panel bg (exit is visible)", containerBg !== panelBg);
const panelCount = (html.match(/class="boot__panel"/g) || []).length;
const lefts = [6, 7, 8, 9, 10].map((n) => {
  const m = css.match(new RegExp(`\\.boot__panel:nth-child\\(${n}\\)\\s*\\{[^}]*?left:\\s*([\\d.]+)\\s*%?`));
  return m ? Number(m[1]) : NaN;
});
const widthM = panelBlock.match(/width:\s*([\d.]+)%/);
const panelW = widthM ? Number(widthM[1]) : NaN;
check("exactly 5 panels", panelCount === 5, `found=${panelCount}`);
check("panel lefts are 0/20/40/60/80", JSON.stringify(lefts) === JSON.stringify([0, 20, 40, 60, 80]), `lefts=${lefts}`);
check("panels cover full width", panelW >= 20 && lefts[4] + panelW >= 100, `width=${panelW}%`);
check("blade exit animation wired", /\.is-exiting\s+\.boot__blade\s*\{[^}]*animation:/s.test(css));
check("panel exit animation wired", /\.is-exiting\s+\.boot__panel\s*\{[^}]*animation:/s.test(css));
check("boot-panel ends at translateY(-101%)", /@keyframes\s+boot-panel\s*\{[^}]*translateY\(-101%\)/s.test(css));
check("driver adds is-exiting class", driver.includes("is-exiting"));
check("driver removes the node", driver.includes("removeChild"));
check("driver dispatches done event", driver.includes("sq:initial-loader-done"));

const win = new Window({ url: "http://localhost/?loader" });
try {
  win.document.write(html);
  win.document.close();
  win.eval(driver);
  const loader = win.document.getElementById("sq-initial-loader");
  if (!loader) {
    check("curtain present for runtime exit test", false, "element missing — cannot test exit");
  } else {
    check("panels occupy children 6-10", [5, 6, 7, 8, 9].every((i) => loader.children[i]?.classList.contains("boot__panel")));
    win.__SQ_EXIT_INITIAL_LOADER();
    await new Promise((r) => setTimeout(r, 150));
    const stillThere = win.document.getElementById("sq-initial-loader");
    check("exit applies is-exiting class", !!stillThere && stillThere.classList.contains("is-exiting"));
    const computed = win.getComputedStyle(stillThere || loader).backgroundColor;
    check("computed container background is transparent during exit", (computed === "transparent" || computed === "rgba(0, 0, 0, 0)"), `computed=${computed}`);
  }
} finally {
  await win.happyDOM.close();
}
if (failures) {
  console.error(`\nloader-exit-check: ${failures} check(s) FAILED — check transparent container backgrounds in index.html and src/styles/loader.css, rebuild, and re-run.`);
  process.exit(1);
}
console.log("\nloader-exit-check: all checks passed — exit transparency and animation wiring are intact.");
