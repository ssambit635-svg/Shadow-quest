/**
 * scripts/android-assets.mjs — regenerate every raster the Android shell
 * ships (launcher icons, adaptive-icon layers, splash screens) from the two
 * source marks in `public/icons/`.
 *
 * Densities and pixel sizes are exactly what the Capacitor template creates,
 * so re-running this never changes the manifest or the resource qualifiers —
 * only the pixels. The adaptive foreground is drawn on the 108dp canvas with
 * the mark inside the centre 66dp, which is the safe zone Android may crop
 * to a circle, a squircle or a teardrop.
 *
 * Run: node scripts/android-assets.mjs   (idempotent)
 */
import sharp from "sharp";
import { readFileSync, existsSync } from "node:fs";

const RES = "android/app/src/main/res";
const ICON = readFileSync("public/icons/icon.svg", "utf8");

/* tokens.css --ink-900. The adaptive backdrop and the splash ground are the
   same value as the tile the scripts draw, so no edge shows on any launcher. */
const INK = "#08090c";

/** Wrap the 512-base artwork into a 108dp adaptive canvas, safe zone 66dp. */
function adaptiveForeground() {
  const inner = ICON.replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const s = 66 / 512;
  const t = (108 - 66) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="${INK}"/><g transform="translate(${t} ${t}) scale(${s})">${inner}</g></svg>`;
}

/** Splash: ink field, mark centred at ~38% of the short edge. */
function splash(w, h) {
  const inner = ICON.replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const size = Math.round(Math.min(w, h) * 0.42);
  const x = (w - size) / 2;
  const y = (h - size) / 2;
  const s = size / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${INK}"/><g transform="translate(${x} ${y}) scale(${s})">${inner}</g></svg>`;
}

const FG = adaptiveForeground();

const launchers = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];

const splashes = [
  ["mdpi", 320, 480],
  ["hdpi", 480, 800],
  ["xhdpi", 720, 1280],
  ["xxhdpi", 960, 1600],
  ["xxxhdpi", 1280, 1920],
];

async function emit(svg, dst, w, h) {
  if (!existsSync(dst.split("/").slice(0, -1).join("/"))) return;
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(w, h)
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toFile(dst);
  console.log(`android → ${dst} (${w}×${h})`);
}

for (const [dpi, px, fg] of launchers) {
  await emit(ICON, `${RES}/mipmap-${dpi}/ic_launcher.png`, px, px);
  await emit(ICON, `${RES}/mipmap-${dpi}/ic_launcher_round.png`, px, px);
  await emit(FG, `${RES}/mipmap-${dpi}/ic_launcher_foreground.png`, fg, fg);
}

for (const [dpi, w, h] of splashes) {
  await emit(splash(w, h), `${RES}/drawable-port-${dpi}/splash.png`, w, h);
  await emit(splash(h, w), `${RES}/drawable-land-${dpi}/splash.png`, h, w);
}
// The unsized fallback the launch theme paints before the density picks one.
await emit(splash(480, 800), `${RES}/drawable/splash.png`, 480, 800);

console.log("android assets regenerated");
