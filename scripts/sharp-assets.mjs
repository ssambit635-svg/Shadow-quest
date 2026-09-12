/**
 * scripts/sharp-assets.mjs — turn the painted plates into web assets.
 *
 * Two things happen here beyond compression:
 *  · photos become progressive JPEG (paper is opaque, so no alpha is needed)
 *  · the brush stroke and the ink wash are re-emitted as ALPHA MASKS, so CSS
 *    can paint them in any colour (currentColor-ish via mask + background) and
 *    animate them without a second art pass.
 *
 * Run: node scripts/sharp-assets.mjs   (idempotent; safe to re-run after
 * dropping new PNGs into public/img-src/)
 */
import sharp from "sharp";
import { existsSync, mkdirSync } from "node:fs";

const SRC = "public/img-src";
const OUT = "public/img";

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

/**
 * Ink is dark, paper is light → invert luminance into alpha.
 * `width` exists because these are *masks*: they're never seen directly, so a
 * 900px copy of a 1400px plate is indistinguishable at a tenth the weight.
 */
async function toMask(src, dst, { gamma = 1.6, threshold = 0, width } = {}) {
  let img = sharp(src).grayscale().toColorspace("b-w");
  if (width) img = img.resize({ width, fit: "inside" });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i++, o += 4) {
    let lum = 1 - data[i] / 255; // 1 = solid ink
    lum = Math.pow(lum, gamma);
    if (threshold && lum < threshold) lum = 0;
    // Masks key off alpha; paint a neutral grey so the mask stays debuggable.
    out[o] = 30;
    out[o + 1] = 26;
    out[o + 2] = 24;
    out[o + 3] = Math.round(lum * 255);
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, effort: 8 })
    .toFile(dst);
  const stat = await sharp(dst).metadata();
  console.log(`mask → ${dst} (${stat.width}x${stat.height})`);
}

async function photo(src, dst, { quality = 78, resize } = {}) {
  let p = sharp(src).rotate().toColorspace("srgb");
  if (resize) p = p.resize(resize);
  await p.jpeg({ quality, progressive: true, mozjpeg: true }).toFile(dst);
  const { size } = await import("node:fs/promises").then((m) => m.stat(dst));
  console.log(`jpg  → ${dst} (${Math.round(size / 1024)} KB)`);
}

const run = async () => {
  await photo(`${SRC}/samurai-hero.png`, `${OUT}/samurai-hero.jpg`, { quality: 80 });
  await photo(`${SRC}/duel-wide.png`, `${OUT}/duel-wide.jpg`, {
    quality: 80,
    resize: { width: 1600, fit: "inside" },
  });
  await photo(`${SRC}/ink-wash.png`, `${OUT}/ink-wash.jpg`, { quality: 74 });
  await toMask(`${SRC}/brush-stroke.png`, `${OUT}/brush-mask.png`, { gamma: 1.35, width: 1100 });
  await toMask(`${SRC}/ink-wash.png`, `${OUT}/wash-mask.png`, { gamma: 2.1, width: 900 });
};

await run();
