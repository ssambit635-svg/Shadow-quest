/* smoke-canonical.mjs — proof that the retired address cannot dead-end.
 *
 * The live deployment answers the page AND the /api/* calls the app makes
 * (render.yaml → service `shadowquest`). The old Render static site at
 * shadow-quest.onrender.com still deploys this same repository and still
 * looks right, but nothing behind it answers /api — which is the "This build
 * points at an address with no ShadowQuest API behind it" the sign-in gate
 * reports, and why "Continue with Google" dies there no matter what the app
 * itself does.
 *
 * public/sq-canonical.js therefore forwards a retired address to the live
 * one. This script boots the built page in happy-dom at every address that
 * matters and asserts where the operator is — and is not — sent:
 *
 *   1. the retired host forwards to the live host
 *   2. the whole address travels: path, ?query, and the #fragment that
 *      carries a Google handoff code
 *   3. the live host is never redirected, so a loop is impossible
 *   4. localhost, preview hosts and the APK's https://localhost stay put
 *   5. ?sq_stay=1 stays put (the escape hatch)
 *   6. dist/index.html really loads the shim — a build that dropped the tag
 *      would silently restore the dead end
 *
 * Run:  npm run smoke:canonical   (builds first via presmoke:canonical)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "dist/index.html"), "utf8");
const shim = readFileSync(resolve(root, "public/sq-canonical.js"), "utf8");

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !extra ? "" : ` — ${extra}`}`);
  if (!cond) failures += 1;
};

/** Load the built page at `url`, run the shim, report where it ended up. */
function boot(url) {
  const win = new Window({ url });
  win.document.write(html);
  win.document.close();
  win.eval(shim);
  return { win, href: win.location.href, decision: win.__SQ_CANONICAL ?? null };
}

const LIVE = "https://shadowquest.onrender.com";

function main() {
  // ---- the address itself travels ----------------------------------------
  {
    const { win, href } = boot("https://shadow-quest.onrender.com/");
    check("retired root forwards to the live host", href === `${LIVE}/`, href);
    check("the forward is a replace, not a push", win.history.length <= 1, `length=${win.history.length}`);
    win.happyDOM.close();
  }
  {
    const back = "https://shadow-quest.onrender.com/#/login?sq_auth=ok&code=handoff-abc123";
    const { win, href } = boot(back);
    check(
      "a Google handoff code survives the forward",
      href === `${LIVE}/#/login?sq_auth=ok&code=handoff-abc123`,
      href,
    );
    win.happyDOM.close();
  }
  {
    const { win, href } = boot("https://shadow-quest.onrender.com/ledger?tab=today#/app");
    check(
      "path, query and fragment all travel",
      href === `${LIVE}/ledger?tab=today#/app`,
      href,
    );
    win.happyDOM.close();
  }

  // ---- the live host is a dead end for the shim --------------------------
  {
    const { win, href, decision } = boot(`${LIVE}/#/login`);
    check("the live host is never forwarded", href === `${LIVE}/#/login`, href);
    check("and it says so", decision?.reason === "live", JSON.stringify(decision));
    win.happyDOM.close();
  }

  // ---- everywhere else is left alone -------------------------------------
  for (const url of [
    "http://localhost:5173/#/login?sq_auth=ok&code=x",
    "https://localhost/#/login?sq_auth=ok&code=x",
    "https://abc123.e2b.app/#/login",
    "https://example.com/",
  ]) {
    const { win, href } = boot(url);
    check(`left alone: ${url}`, href === url, href);
    win.happyDOM.close();
  }

  // ---- the escape hatch ---------------------------------------------------
  {
    const url = "https://shadow-quest.onrender.com/?sq_stay=1";
    const { win, href, decision } = boot(url);
    check("?sq_stay=1 stays put", href === url, href);
    check("and it says so", decision?.reason === "stayed", JSON.stringify(decision));
    win.happyDOM.close();
  }

  // ---- the built page actually loads it ----------------------------------
  check(
    "dist/index.html loads /sq-canonical.js",
    /<script[^>]+src="\/sq-canonical\.js"/.test(html),
  );
  check(
    "the shim is deferred, so the loader still paints first",
    /<script[^>]+defer[^>]+src="\/sq-canonical\.js"/.test(html),
  );

  if (failures) {
    console.error(`\ncanonical smoke: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\ncanonical smoke: all checks passed — retired addresses forward, everything else is untouched.");
}

main();
