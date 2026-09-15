/**
 * scripts/brand-letterforms.mjs — extract the wordmark's letterforms to paths.
 *
 * The exported lockups in public/brand are drawn from scripts/brand-letterforms.json
 * rather than from live <text>, because a logo file that depends on a font being
 * installed is a logo that renders as somebody else's typeface. This script is
 * how that JSON is made, so the outlines are reproducible instead of magic.
 *
 * The font files are not vendored (they are ~30 KB each of OFL-licensed Orbitron
 * and Rajdhani, and `npm i @expo-google-fonts/orbitron @expo-google-fonts/rajdhani`
 * or the Google Fonts repo will fetch them). opentype.js is the only dependency
 * and it is pulled in the same way, so the project's own install stays clean.
 *
 * Run:
 *   npm i --no-save opentype.js                       # dev-only, once
 *   node scripts/brand-letterforms.mjs \
 *     node_modules/@expo-google-fonts/orbitron/800ExtraBold/Orbitron_800ExtraBold.ttf \
 *     node_modules/@expo-google-fonts/rajdhani/600SemiBold/Rajdhani_600SemiBold.ttf
 *   node scripts/brand.mjs                            # then rebuild the exports
 *
 * Strings are fixed here on purpose: they are the words the brand ships with, and
 * anything that needs changing belongs in a commit, not in a command line.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = "scripts/brand-letterforms.json";
const SIZE = 100; // the nominal em the paths are stored at; brand.mjs scales it
const DISPLAY_TRACKING = 18; // 0.18em, Orbitron, the wordmark
const LABEL_TRACKING = 8; // 0.08em, Rajdhani, the two label lines

const WORDS = {
  SHADOW: { font: 0, text: "SHADOW" },
  QUEST: { font: 0, text: "QUEST" },
  TAGLINE: { font: 1, text: "DISCIPLINE BECOMES DESTINY" },
  KICKER: { font: 1, text: "PERSONAL OS  \u00b7  RECORD  \u00b7  REPEAT  \u00b7  RISE" },
};

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    "usage: node scripts/brand-letterforms.mjs <orbitron.ttf> <rajdhani.ttf>\n" +
      "  e.g. the two @expo-google-fonts TTFs (Orbitron 800ExtraBold, Rajdhani 600SemiBold)",
  );
  process.exit(2);
}

let opentype;
try {
  opentype = (await import("opentype.js")).default;
} catch {
  console.error(
    "opentype.js is not installed. This is a one-time authoring tool, not a project\n" +
      "dependency: `npm i --no-save opentype.js`, run this, then `npm prune` if you want.",
  );
  process.exit(2);
}

const fonts = args.map((f) => opentype.parse(readFileSync(resolve(f)), {}));

/**
 * One string → a list of glyph outlines plus the metrics brand.mjs needs.
 *
 * Each glyph is rendered at the origin and carries its own pen offset, rather
 * than having the offset added into its path data. That is not pedantry: doing
 * the arithmetic in path space made toPathData() emit `NaN` for the D, O and W
 * of Orbitron — letters that happen to be built from quadratic curves whose
 * control points land on the pen offset. At the origin the extraction is exact.
 */
function line(font, text, tracking) {
  let x = 0;
  let top = 0;
  let bottom = 0;
  const glyphs = [];
  for (const ch of text) {
    const adv = font.getAdvanceWidth(ch, SIZE);
    if (ch !== " ") {
      const path = font.getPaths(ch, 0, 0, SIZE)[0];
      const d = path.toPathData(2).trim();
      if (/NaN|Infinity|undefined/.test(d))
        throw new Error(`bad outline for "${ch}" in "${text}" — refusing to write ${OUT}`);
      const bb = path.getBoundingBox();
      if (Number.isFinite(bb.x1)) {
        top = Math.min(top, bb.y1);
        bottom = Math.max(bottom, bb.y2);
      }
      if (d) glyphs.push({ x: Number(x.toFixed(2)), d });
    }
    x += adv + tracking;
  }
  return {
    glyphs,
    width: Number((x - tracking).toFixed(2)),
    top: Number(top.toFixed(2)),
    bottom: Number(bottom.toFixed(2)),
  };
}

const out = {
  _note:
    "Letterform outlines extracted from Orbitron ExtraBold 800 and Rajdhani SemiBold 600 (SIL Open Font License 1.1, via @expo-google-fonts), nominal font-size 100, baseline at y=0, each glyph at the origin with its own pen offset. The exported lockups draw these instead of live text so they render identically with no font installed. Regenerate with scripts/brand-letterforms.mjs.",
  size: SIZE,
  displayTracking: DISPLAY_TRACKING,
  labelTracking: LABEL_TRACKING,
};

for (const [key, { font: face, text }] of Object.entries(WORDS)) {
  out[key] = line(fonts[face], text, face === 0 ? DISPLAY_TRACKING : LABEL_TRACKING);
}

writeFileSync(resolve(OUT), JSON.stringify(out) + "\n");
console.log(`${OUT} written`);
for (const [k, v] of Object.entries(out)) {
  if (k.startsWith("_") || typeof v !== "object") continue;
  console.log(`  ${k.padEnd(8)} ${String(v.glyphs.length).padStart(2)} glyphs · width ${v.width} · cap ${v.top} · baseline ${v.bottom}`);
}
