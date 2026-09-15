/**
 * scripts/pwa-icons.mjs — derive the installable-app icon set from one SVG.
 *
 * The same mark ships three ways, because the three consumers disagree about
 * what an icon is:
 *   · `icon-192.png` / `icon-512.png`  — the web manifest, art inset on ink.
 *   · `maskable-512.png`               — Android adaptive icons, which crop a
 *     circle/squircle out of the centre 80%, so the mark is drawn small and
 *     the ink runs to the edge as bleed.
 *   · `apple-touch-icon.png`           — iOS, which refuses transparency and
 *     rounds the corners itself.
 *
 * Run: node scripts/pwa-icons.mjs   (idempotent)
 */
import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const OUT = "public/icons";
/* Same ink as tokens.css --ink-900 and the tile in public/icons/icon.svg; the
   flatten only matters where the SVG is transparent, and a different value
   here would show as a seam one pixel wide. */
const INK = "#08090c";
const SRC = `${OUT}/icon.svg`;

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

/** Re-pad an SVG's artwork into the maskable safe zone (centre 80%). */
function maskableSvg(svg) {
  return svg
    .replace('viewBox="0 0 512 512"', 'viewBox="0 0 512 512"')
    .replace(
      /(<rect width="512" height="512"[^>]*\/>)/,
      `$1<g transform="translate(51.2 51.2) scale(0.8)">`,
    )
    .replace("</svg>", "</g></svg>");
}

const base = readFileSync(SRC, "utf8");
const maskable = maskableSvg(base);

const jobs = [
  { svg: base, file: "icon-192.png", size: 192 },
  { svg: base, file: "icon-512.png", size: 512 },
  { svg: maskable, file: "maskable-192.png", size: 192 },
  { svg: maskable, file: "maskable-512.png", size: 512 },
  { svg: base, file: "apple-touch-icon.png", size: 180 },
];

for (const { svg, file, size } of jobs) {
  const dst = `${OUT}/${file}`;
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toFile(dst);
  const { size: bytes } = await import("node:fs/promises").then((m) => m.stat(dst));
  console.log(`icon → ${dst} (${size}×${size}, ${Math.round(bytes / 1024)} KB)`);
}
