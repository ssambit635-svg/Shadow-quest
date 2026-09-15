/**
 * scripts/brand.mjs — the ShadowQuest logo system, generated from one geometry.
 *
 * THE MARK — "The Sheared Eclipse"
 * A bone orbit (the loop the app runs: record, repeat, rise) around a vermilion
 * sun (the ki the old icon already carried), cut once by a straight line and
 * pulled apart along it. The upper half stays where it belongs. The lower half
 * is the shadow: same geometry, slipped, drawn in graphite, no colour of its
 * own. It is not a second emblem — it is the first one, cast.
 *
 * The displacement is the entire idea. Two congruent halves offset across a cut
 * read at any size, mean "you and the self you have to out-walk", and give the
 * mark a silhouette that is not a circle, which is what the previous icon lacked
 * (a sun, a stray brush stroke ending in a bulb inside it, and a dead grey ground
 * line: three objects, no relationship, and off-centre enough that Android's
 * circular crop ate the stroke's tail).
 *
 * What ships from here: everything downstream is generated from `markPieces()`,
 * so the React mark, the app tile, the favicon, the APK launcher and the splash
 * cannot drift apart. The tilt is baked into the path data (no transform for a
 * rasteriser to lose) and there are no clip paths, masks or filters, so sharp,
 * the browser and AAPT all agree on what this looks like.
 *
 * Run: node scripts/brand.mjs             → public/brand/**, icons, favicon, Sigil
 *      node scripts/brand.mjs --preview   → PNG proofs (sizes, crop, mono, photo)
 *      node scripts/brand.mjs --probe     → a grid of geometry variants to judge
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/* ------------------------------------------------------------------ tokens */
/* Pinned to src/styles/tokens.css: one accent (vermilion), one data colour
   (brass), ink and bone. The logo is allowed nothing else. */
export const T = {
  ink: "#08090c", // --ink-900, the field the whole site paints on
  ink800: "#0f1116",
  bone100: "#eef1f6",
  bone200: "#c7ccd6",
  bone300: "#9aa2b0",
  bone500: "#4a515e", // --bone-500: the graphite a shadow is cut from
  vermilion: "#d43d31",
  vermilionLit: "#ff5a4a",
  brass: "#c7a46a",
  paper: "#eef1f6", // [data-tone="paper"] ground
  paperInk: "#191611",
  paperVermilion: "#b83227", // theme-light.css --vermilion
};

export const TAGLINE = "DISCIPLINE BECOMES DESTINY";
const FONT_DISPLAY = "Orbitron, 'Eurostile Extended', Rajdhani, sans-serif";
const FONT_LABEL = "Rajdhani, Oswald, 'Arial Narrow', sans-serif";
const FONT_JP = "'Shippori Mincho', 'Yu Mincho', serif";

/* --------------------------------------------------------------- geometry */
/**
 * The construction runs in the cut's own frame: `x` along the shear line, `y`
 * along its normal, origin at the sun's centre, +y on the lit side. Everything
 * is then four shapes — the lit ring cap, the lit sun cap, and the same two
 * again for the half that slipped.
 *
 *   sun      the disc's radius
 *   ringIn   the orbit's inner radius
 *   ringOut  the orbit's outer radius (thickness = out − in)
 *   cut      where the shear line sits, as an offset from the centre
 *   tilt     the shear line's angle, degrees; negative rises to the right
 *   slip     how far the shadow half has moved: along the cut, and off it
 *   scale    the shadow half is drawn marginally smaller, because a cast
 *            shadow does not keep the size of the thing that threw it
 *   cy       the whole motif rides a little high, because the slipped shadow
 *            pulls the composition down — optical centring, not mathematical
 */
export const GEO = {
  canvas: 512,
  cx: 256,
  cy: 248,
  sun: 134,
  ringIn: 146,
  ringOut: 180,
  cut: 10,
  tilt: -20,
  slip: { x: 25, y: 21 },
  scale: 0.975,
};

/** Tiles: the orbit thickens until it survives a 32px raster, and the whole
 *  motif is shrunk so the slipped half stays inside the maskable safe zone
 *  (centre 80% of the tile = a 205 radius). Same construction, retuned. */
export const GEO_TILE = {
  sun: 118,
  ringIn: 134,
  ringOut: 170,
  cut: 12,
  tilt: -20,
  slip: { x: 19, y: 16 },
  scale: 0.975,
};

/**
 * Favicons are their own argument. At 16–32px a hairline is a rounding error,
 * so the tab version exaggerates: a thick ring, a small sun, and a shear wide
 * enough to still read as "two halves" instead of "a circle". Not a different
 * mark — the same four paths, told louder.
 */
export const GEO_FAV = {
  sun: 96,
  ringIn: 108,
  ringOut: 184,
  cut: 24,
  tilt: -20,
  slip: { x: 44, y: 36 },
  scale: 0.95,
};

const rad = (d) => (d * Math.PI) / 180;
const n = (v) => Number(v.toFixed(2)).toString();
const P = (p) => `${n(p.x)} ${n(p.y)}`;

/** Frame of the cut: `t` runs along the shear, `nrm` points at the lit side. */
function frame(tilt) {
  const a = rad(tilt);
  return { t: { x: Math.cos(a), y: Math.sin(a) }, nrm: { x: Math.sin(a), y: -Math.cos(a) } };
}

/**
 * Where the line y = level crosses the circle (c, r), in cut-local space.
 * Null when it misses — which is how a bad tuning is caught at build time
 * instead of shipping a mark with a hole in it.
 */
function chord(c, r, level) {
  const dy = level - c.y;
  if (Math.abs(dy) >= r) return null;
  const h = Math.sqrt(r * r - dy * dy);
  return [
    { x: c.x - h, y: level },
    { x: c.x + h, y: level },
  ];
}

/**
 * Arc command from p1 to p2 on circle (c, r), taking whichever of the two arcs
 * passes nearest `via`. Removes the sweep-flag guesswork entirely.
 */
function arc(c, r, p1, p2, via) {
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
  const a2 = Math.atan2(p2.y - c.y, p2.x - c.x);
  const dist = (p) => Math.hypot(p.x - via.x, p.y - via.y);
  let best = null;
  for (const sweep of [1, 0]) {
    let delta = a2 - a1;
    if (sweep) {
      while (delta < 0) delta += Math.PI * 2;
    } else {
      while (delta > 0) delta -= Math.PI * 2;
      delta = -delta;
    }
    const mid = a1 + (sweep ? delta : -delta) / 2;
    const score = dist({ x: c.x + r * Math.cos(mid), y: c.y + r * Math.sin(mid) });
    if (!best || score < best.score) best = { score, large: delta > Math.PI ? 1 : 0, sweep };
  }
  return `A ${n(r)} ${n(r)} 0 ${best.large} ${best.sweep} ${n(p2.x)} ${n(p2.y)}`;
}

/**
 * One half of the eclipse as two closed paths — a ring cap and a sun cap —
 * built in cut-local space and mapped to canvas coordinates by `W`.
 * `side` is +1 for the lit half, −1 for the shadow; `at` is that half's centre
 * and `k` the cut level its flat edge stays flush against.
 */
function half(g, at, k, side, W, scale = 1) {
  const out = g.ringOut * scale;
  const inR = g.ringIn * scale;
  const sunR = g.sun * scale;
  const C = W(at.x, at.y);
  const far = W(at.x, at.y + side * out);
  const near = W(at.x, at.y + side * inR);

  const o = chord(at, out, k);
  const i = chord(at, inR, k);
  const s = g.sun > 1 ? chord(at, sunR, k) : null;
  if (!o || !i || (g.sun > 1 && g.hollowShadow !== true && !s))
    throw new Error(
      `brand: the cut does not cross every ring (cut ${k}, sun ${sunR}, ring ${inR}\u2013${out})`,
    );

  const ring = [
    `M ${P(W(o[0].x, o[0].y))}`,
    arc(C, out, W(o[0].x, o[0].y), W(o[1].x, o[1].y), far),
    `L ${P(W(i[1].x, i[1].y))}`,
    arc(C, inR, W(i[1].x, i[1].y), W(i[0].x, i[0].y), near),
    "Z",
  ].join(" ");

  // Sun cap: one chord, then the arc that stays on this side. `hollowShadow`
  // leaves the slipped half an empty ring — the shadow keeps the orbit but has
  // no light of its own, which is the whole brand in one decision.
  const wantSun = side > 0 || g.hollowShadow !== true;
  const disc =
    s && wantSun
      ? [
          `M ${P(W(s[0].x, s[0].y))}`,
          arc(C, sunR, W(s[0].x, s[0].y), W(s[1].x, s[1].y), near),
          "Z",
        ].join(" ")
      : "";

  return { ring, disc };
}

/**
 * The four paths of the mark, in canvas coordinates, tilt baked in.
 *   litRing, litSun    the half that stayed
 *   shadRing, shadSun  the half that slipped
 */
export function markPieces(over = {}) {
  const g = { ...GEO, ...over };
  const { t, nrm } = frame(g.tilt);
  const W = (x, y) => ({
    x: g.cx + t.x * x + nrm.x * y,
    y: g.cy + t.y * x + nrm.y * y,
  });
  const k = g.cut;
  const lit = half(g, { x: 0, y: 0 }, k, 1, W);
  const sh = g.slip ?? { x: 0, y: 0 };
  const shad = half(g, { x: sh.x, y: -sh.y }, k, -1, W, g.scale ?? 1);

  // how far the outermost point sits from the canvas centre: the maskable
  // crop gives 205, so `build` warns if a tuning exceeds it.
  const reach = g.ringOut * (g.scale ?? 1) + Math.hypot(sh.x, sh.y);

  return {
    litRing: lit.ring,
    litSun: lit.disc,
    shadRing: shad.ring,
    shadSun: shad.disc,
    reach,
    tilt: g.tilt,
    canvas: g.canvas,
  };
}

/* ------------------------------------------------------------- treatments */
/** How the four paths are painted. `live` is what the app uses. */
const PAINT = {
  onInk: (a) => ({
    sun: `fill="${a ?? T.vermilion}"`,
    ring: `fill="${T.bone100}"`,
    // graphite at four fifths weight: present, but clearly not the lit half
    shadow: `fill="${T.bone500}" fill-opacity=".78"`,
  }),
  onPaper: (a) => ({
    sun: `fill="${a ?? T.paperVermilion}"`,
    ring: `fill="${T.paperInk}"`,
    shadow: `fill="${T.paperInk}" fill-opacity=".38"`,
  }),
  monoLight: () => ({
    sun: `fill="${T.bone100}"`,
    ring: `fill="${T.bone100}"`,
    shadow: `fill="${T.bone100}" fill-opacity=".34"`,
  }),
  monoDark: () => ({
    sun: `fill="${T.paperInk}"`,
    ring: `fill="${T.paperInk}"`,
    shadow: `fill="${T.paperInk}" fill-opacity=".34"`,
  }),
  /* In-app: the sun takes the one accent tokens.css allows, and the orbit plus
     the shadow ride the host element's text colour. That is what makes a single
     component correct in the nav, on the boot curtain, on the login gate, in the
     phone's bottom bar and on a paper section — no theme prop to thread. */
  live: () => ({
    sun: `fill="var(--vermilion, ${T.vermilion})"`,
    ring: `fill="currentColor"`,
    shadow: `fill="currentColor" fill-opacity=".3"`,
  }),
};

/** Inner markup for the mark, ready to drop inside any <svg>. */
export function markBody({ paint = "onInk", tile = false, accent, geo } = {}) {
  const p = markPieces(tile ? { ...GEO_TILE, ...geo } : geo);
  const c = PAINT[paint](accent);
  return `<g>
    <path class="mark__ring" d="${p.litRing}" ${c.ring}/>
    <path class="mark__sun" d="${p.litSun}" ${c.sun}/>
    <path class="mark__shadow" d="${p.shadRing}" ${c.shadow}/>
    <path class="mark__shadow" d="${p.shadSun}" ${c.shadow}/>
  </g>`;
}

/* ------------------------------------------------------------ svg helpers */
/** HUD corner ticks — the boot curtain's inset frame, reduced to its corners. */
function ticks(size, inset, len, width, color, opacity) {
  const b = size - inset;
  return `<path d="M${inset} ${inset + len}V${inset}H${inset + len}M${b - len} ${inset}H${b}V${inset + len}M${b} ${b - len}V${b}H${b - len}M${inset + len} ${b}H${inset}V${b - len}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width}" fill="none"/>`;
}

const wrap = (w, h, body, vb) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb ?? `0 0 ${w} ${h}`}" width="${w}" height="${h}" fill="none">
${body}
</svg>
`;

/* ---- type -----------------------------------------------------------------
   The wordmark is Orbitron ExtraBold and the label line Rajdhani SemiBold —
   the same two faces tokens.css puts on the site — but the *exported* lockups
   draw them as outlines from scripts/brand-letterforms.json rather than as live
   text. A logo SVG that depends on a font being installed is a logo that renders
   as some other typeface on whoever's machine opens it, and the rasteriser in CI
   has no fonts at all. With the JSON present the exports are fontless; without
   it (a fresh clone that skipped the extraction) they degrade to live text with
   the site's own stack, which still looks right in a browser. */
const LF = (() => {
  try {
    return JSON.parse(readFileSync(resolve("scripts/brand-letterforms.json"), "utf8"));
  } catch {
    return null;
  }
})();

/** The glyph markup for one word: one path per glyph, positioned by translate. */
function glyphs(word) {
  return LF[word].glyphs
    .map((g) => `<path transform="translate(${g.x} 0)" d="${g.d}"/>`)
    .join("");
}

/**
 * SHADOW in bone, QUEST in the accent — the boot curtain's split, kept.
 *
 * Everything lives in one scaled group, so the whole wordmark is positioned by
 * (x, y) and sized by `size`, and the only numbers inside are the extraction's
 * own metrics. Width is returned because lockups need to centre against it, and
 * a `text-anchor` would not exist once the type is paths.
 */
function wordmark({ x, y, size, fill = T.bone100, accent = T.vermilion, anchor = "start" }) {
  if (!LF) {
    return {
      width: size * 11.4,
      svg: `<text x="${n(x)}" y="${n(y)}"${anchor === "start" ? "" : ` text-anchor="${anchor}"`} font-family="${FONT_DISPLAY}" font-size="${n(size)}" font-weight="800" letter-spacing="${n(size * 0.18)}" fill="${fill}">SHADOW<tspan fill="${accent}">QUEST</tspan></text>`,
    };
  }
  const k = size / LF.size;
  const gap = LF.displayTracking;
  const width = (LF.SHADOW.width + gap + LF.QUEST.width) * k;
  const at = anchor === "middle" ? x - width / 2 : x;
  return {
    width,
    svg: `<g transform="translate(${n(at)} ${n(y)}) scale(${n(k)})">
    <g fill="${fill}">${glyphs("SHADOW")}</g>
    <g fill="${accent}" transform="translate(${n(LF.SHADOW.width + gap)} 0)">${glyphs("QUEST")}</g>
  </g>`,
  };
}

/** A small caps label line (Rajdhani), outlined when the letterforms are there. */
function kicker({ x, y, size, key, text, fill = T.bone300, anchor = "start" }) {
  if (LF && key && LF[key]) {
    const width = LF[key].width * (size / LF.size);
    const at = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
    return {
      width,
      svg: `<g transform="translate(${n(at)} ${n(y)}) scale(${n(size / LF.size)})" fill="${fill}">${glyphs(key)}</g>`,
    };
  }
  return {
    width: 0,
    svg: `<text x="${n(x)}" y="${n(y)}"${anchor === "start" ? "" : ` text-anchor="${anchor}"`} font-family="${FONT_LABEL}" font-size="${n(size)}" letter-spacing="${n(size * 0.4)}" fill="${fill}">${text}</text>`,
  };
}

/* --------------------------------------------------------------- builders */
export const TILE_INK = () =>
  wrap(
    512,
    512,
    `  <rect width="512" height="512" fill="${T.ink}"/>
  ${ticks(512, 34, 24, 3, T.bone100, ".08")}
  ${markBody({ tile: true })}`,
  );

export const TILE_PAPER = () =>
  wrap(
    512,
    512,
    `  <rect width="512" height="512" fill="${T.paper}"/>
  ${ticks(512, 34, 24, 3, T.paperInk, ".16")}
  ${markBody({ tile: true, paint: "onPaper" })}`,
  );

export const FAVICON = () =>
  wrap(64, 64, `  <rect width="64" height="64" fill="${T.ink}"/>
  ${markBody({ geo: GEO_FAV })}`, "0 0 512 512");

export const LOCKUP_H = () => {
  const H = 300;
  const wm = wordmark({ x: 292, y: 150, size: 66 });
  const tag = kicker({ x: 296, y: 222, size: 19, key: "TAGLINE", text: TAGLINE });
  const kick = kicker({ x: 296, y: 254, size: 12.5, key: "KICKER", text: "PERSONAL OS  \u00b7  RECORD  \u00b7  REPEAT  \u00b7  RISE", fill: T.bone500 });
  const W = Math.max(1180, Math.ceil(Math.max(292 + wm.width, 296 + tag.width, 296 + kick.width) + 56));
  return wrap(
    W,
    H,
    `  <rect width="${W}" height="${H}" fill="${T.ink}"/>
  <g transform="translate(48 44) scale(0.4219)">
    ${markBody({})}
  </g>
  ${wm.svg}
  <path d="M296 186H${W - 56}" stroke="${T.brass}" stroke-opacity=".45" stroke-width="3"/>
  ${tag.svg}
  ${kick.svg}`,
  );
};

export const LOCKUP_V = () => {
  const W = 560;
  const H = 620;
  const cx = W / 2;
  const wm = wordmark({ x: cx, y: 486, size: 44, anchor: "middle" });
  const tag = kicker({ x: cx, y: 550, size: 13.5, key: "TAGLINE", text: TAGLINE, anchor: "middle" });
  return wrap(
    W,
    H,
    `  <rect width="${W}" height="${H}" fill="${T.ink}"/>
  ${ticks(W, 26, 20, 2, T.bone100, ".08")}
  <g transform="translate(106 62) scale(0.6797)">
    ${markBody({})}
  </g>
  ${wm.svg}
  <path d="M${cx - 132} 516H${cx + 132}" stroke="${T.brass}" stroke-opacity=".4" stroke-width="2"/>
  ${tag.svg}`,
  );
};

export const WORDMARK = () => {
  const wm = wordmark({ x: 40, y: 97, size: 66 });
  const W = Math.ceil(40 + wm.width + 40);
  return wrap(W, 150, `  <rect width="${W}" height="150" fill="${T.ink}"/>
  ${wm.svg}`);
};

export const WORDMARK_PAPER = () => {
  const wm = wordmark({
    x: 40,
    y: 97,
    size: 66,
    fill: T.paperInk,
    accent: T.paperVermilion,
  });
  const W = Math.ceil(40 + wm.width + 40);
  return wrap(W, 150, `  <rect width="${W}" height="150" fill="${T.paper}"/>
  ${wm.svg}`);
};

/* ------------------------------------------------------------------- emit */
const BR = "public/brand";
const emit = (file, text) => {
  const path = resolve(file);
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, text);
  console.log(`brand \u2192 ${file}`);
};

function artefacts() {
  // Android crops the centre 80% of the tile; on a 512 canvas that is a radius
  // of 205 from the centre. If a tuning pushes the slipped half past it, the
  // shadow gets guillotined in someone's app drawer, so fail here instead.
  const reach = markPieces(GEO_TILE).reach;
  if (reach > 205)
    throw new Error(
      `brand: the tile's outermost point is ${reach.toFixed(0)}px from centre \u2014 over Android's 205px crop`,
    );
  const out = {};
  const put = (file, text) => {
    out[file] = text;
    return text;
  };
  out.__reach = reach;
  put(`${BR}/mark.svg`, wrap(512, 512, `  ${markBody({ paint: "live" })}`));
  put(`${BR}/mark-on-ink.svg`, TILE_INK());
  put("public/icons/icon.svg", TILE_INK());
  put(`${BR}/mark-on-paper.svg`, TILE_PAPER());
  put(`${BR}/mark-mono-light.svg`, wrap(512, 512, `  ${markBody({ paint: "monoLight" })}`));
  put(`${BR}/mark-mono-dark.svg`, wrap(512, 512, `  ${markBody({ paint: "monoDark" })}`));
  put("public/favicon.svg", FAVICON());
  put(`${BR}/lockup-horizontal.svg`, LOCKUP_H());
  put(`${BR}/lockup-stacked.svg`, LOCKUP_V());
  put(`${BR}/wordmark.svg`, WORDMARK());
  put(`${BR}/wordmark-on-paper.svg`, WORDMARK_PAPER());

  // Exports carry no live text. Enforced here, in the same place the geometry is
  // enforced, because the failure mode is silent: an SVG with <text> looks right
  // in a browser and wrong literally everywhere else.
  if (!LF)
    throw new Error(
      "brand: scripts/brand-letterforms.json is missing, so the lockups would export live text.\n" +
      "       Run `node scripts/brand-letterforms.mjs <orbitron.ttf> <rajdhani.ttf>` (docs/BRAND.md §6).",
    );
  for (const f of Object.keys(out)) {
    if (f.endsWith(".svg") && /<text/.test(out[f])) throw new Error(`brand: ${f} still contains live <text>`);
  }
  putSigil(out);
  return out;
}

/** The brand sheet, generated alongside the assets so it cannot go stale. */
async function putSheet(out) {
  const { default: sheet } = await import("./brand-sheet.mjs");
  out[`${BR}/index.html`] = sheet({ T, TAGLINE, markBody, GEO, GEO_TILE, GEO_FAV, n });
}

/** Regenerate the React mark from the same numbers, so src/ and public/ agree. */
function putSigil(out) {
  const p = markPieces();
  const c = PAINT.live();
  const paths = [
    ["mark__ring", p.litRing, c.ring],
    ["mark__sun", p.litSun, c.sun],
    ["mark__shadow", p.shadRing, c.shadow],
    ["mark__shadow", p.shadSun, c.shadow],
  ]
    .map(([cls, d, attrs]) => `          <path className="${cls}" d="${d}" ${attrs} />`)
    .join("\n");
  out["src/components/Sigil.tsx"] = (`/**
 * Sigil.tsx \u2014 the ShadowQuest mark, "The Sheared Eclipse".
 *
 * A bone orbit around a vermilion sun, cut once and pulled apart along the
 * cut: the upper half stays, the lower half is the shadow \u2014 same geometry,
 * slipped, drawn in \`currentColor\` at a third of its weight with no colour of
 * its own. The sun is \`--vermilion\`, the only action colour tokens.css allows.
 *
 * Reading \`currentColor\` for everything but the sun is what makes one
 * component correct in the nav, on the boot curtain, on the login gate, in the
 * phone's bottom bar and on a paper section, with no theme prop to thread.
 *
 * THE GEOMETRY IS GENERATED. Do not hand-edit these numbers \u2014 change them in
 * \`scripts/brand.mjs\` and run \`node scripts/brand.mjs\`, which rewrites this
 * file along with public/brand/**, the favicon and the app tile.
 */
import { forwardRef } from "react";

export interface SigilProps {
  className?: string;
  size?: number | string;
  style?: React.CSSProperties;
}

export const Sigil = forwardRef<SVGSVGElement, SigilProps>(
  ({ className, size = "100%", style }, ref) => {
    return (
      <svg
        ref={ref}
        className={className}
        viewBox="0 0 512 512"
        width={size}
        height={size}
        fill="none"
        style={style}
        aria-hidden="true"
      >
        <g>
${paths}
        </g>
      </svg>
    );
  },
);

Sigil.displayName = "Sigil";
`);
}

/* ----------------------------------------------------------- PNG proofing */
/* Deliberately text-free: this container has no fonts installed, so rasterised
   type would lie about the wordmark. public/brand/index.html carries the type,
   in a browser, with the site's own webfonts. */
async function proof(kind) {
  const { default: sharp } = await import("sharp");
  const CELL = 256;
  const pad = 22;
  const at = (svg, s, pixelate) => {
    let j = sharp(Buffer.from(svg), { density: 384 }).resize(s, s).png();
    if (pixelate) j = j.resize(CELL, CELL, { kernel: "nearest" });
    return j.toBuffer();
  };
  const full = (svg) => sharp(Buffer.from(svg), { density: 384 }).resize(CELL, CELL).png().toBuffer();
  const tileSvg = (body, field = T.ink) =>
    wrap(512, 512, `<rect width="512" height="512" fill="${field}"/>${body}`);

  if (kind === "probe") {
    const V = [
      ["solid shadow", {}],
      ["hollow shadow", { hollowShadow: true }],
      ["hollow + big slip", { hollowShadow: true, slip: { x: 26, y: 22 } }],
      ["big slip 26", { slip: { x: 26, y: 22 } }],
      ["tile sizing", { sun: 116, ringIn: 132, ringOut: 168, slip: { x: 12, y: 11 } }],
      ["tile + hollow", { sun: 116, ringIn: 132, ringOut: 168, slip: { x: 12, y: 11 }, hollowShadow: true }],
      ["cut low", { cut: -22 }],
      ["cut high", { cut: 30 }],
    ];
    const cols = 8;
    const comps = [];
    for (const [i, [, g]] of V.entries()) {
      // each variant twice: once at tile weight, once at the favicon tuning and
      // pixelated to 16, so a change is judged at both ends and not one
      for (const j of [0, 1]) {
        const svg = j
          ? tileSvg(markBody({ geo: { ...GEO_FAV, ...g } }))
          : tileSvg(markBody({ geo: { ...GEO, ...g } }));
        const idx = i * 2 + j;
        comps.push({
          input: await at(svg, j ? 16 : CELL, j === 1),
          left: pad + (idx % cols) * (CELL + pad),
          top: pad + Math.floor(idx / cols) * (CELL + pad),
        });
      }
    }
    const rows = Math.ceil((V.length * 2) / cols);
    await sharp({
      create: {
        width: cols * (CELL + pad) + pad,
        height: rows * (CELL + pad) + pad,
        channels: 3,
        background: "#0d0f13",
      },
    })
      .composite(comps)
      .jpeg({ quality: 92 })
      .toFile(`${BR}/probe.jpg`);
    console.log(
      "brand \u2192 public/brand/probe.jpg  pairs (tile, favicon@16): " + V.map((v) => v[0]).join(" | "),
    );
    return;
  }

  const INK = TILE_INK();
  const PAPER = TILE_PAPER();
  const sizes = [256, 128, 64, 32, 16];
  const composites = [];
  for (const [row, tile] of [
    [0, INK],
    [1, PAPER],
  ]) {
    for (const [j, s] of sizes.entries()) {
      composites.push({
        input: await at(tile, s, s < CELL),
        left: pad + j * (CELL + pad),
        top: pad + row * (CELL + pad),
      });
    }
  }
  /* Android crops the centre 80% of the tile to a circle, squircle or
     teardrop; the dashed ring is that boundary, so anything crossing it is
     clipped in someone's drawer. */
  const ring = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}">
    <path d="M0 0H${CELL}V${CELL}H0Z M${CELL / 2} ${CELL * 0.1}a${CELL * 0.4} ${CELL * 0.4} 0 1 0 .1 0z" fill="#101216" fill-rule="evenodd"/>
    <circle cx="${CELL / 2}" cy="${CELL / 2}" r="${CELL * 0.4}" fill="none" stroke="${T.vermilionLit}" stroke-width="1.5" stroke-dasharray="5 4"/>
  </svg>`;
  const maskTest = await sharp(await at(INK, CELL))
    .composite([{ input: Buffer.from(ring) }])
    .png()
    .toBuffer();
  const photo = await sharp("public/img/ink-wash.jpg")
    .resize(CELL, CELL)
    .composite([{ input: await full(wrap(512, 512, markBody({ paint: "monoLight" }))), gravity: "centre" }])
    .png()
    .toBuffer();
  const monoInk = await full(wrap(512, 512, `<rect width="512" height="512" fill="#14161b"/>${markBody({ paint: "monoLight" })}`));
  const monoPaper = await full(wrap(512, 512, `<rect width="512" height="512" fill="${T.paper}"/>${markBody({ paint: "monoDark" })}`));
  for (const [i, img] of [maskTest, photo, monoInk, monoPaper].entries()) {
    composites.push({ input: img, left: pad + i * (CELL + pad), top: pad + 2 * (CELL + pad) });
  }
  const cols = sizes.length + 1;
  await sharp({
    create: {
      width: cols * (CELL + pad) + pad,
      height: 3 * (CELL + pad) + pad,
      channels: 3,
      background: "#101216",
    },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(`${BR}/proof-sizes.jpg`);
  console.log(
    "brand \u2192 public/brand/proof-sizes.jpg  r1 ink 256\u219216 \u00b7 r2 paper \u00b7 r3 maskable crop, on photo, mono \u00d72",
  );

  /* The lockups, rasterised. Possible only because the type is outlined: with
     live <text> this same render would fall back to some default face and the
     proof would be a lie. */
  const sheetW = 1400;
  const rows = [
    LOCKUP_H(),
    LOCKUP_V(),
    WORDMARK(),
    WORDMARK_PAPER(),
    FAVICON(),
    TILE_INK(),
  ];
  const parts = [];
  for (const svg of rows) {
    const j = sharp(Buffer.from(svg), { density: 384 });
    const m = /width="(\d+)" height="(\d+)"/.exec(svg);
    const w = Number(m[1]);
    const h = Number(m[2]);
    const target = Math.min(sheetW, w * 1.15);
    parts.push(
      await j
        .resize({
          width: Math.round(target),
          height: Math.round((target / w) * h),
        })
        .flatten({ background: "#0d0f13" })
        .png()
        .toBuffer(),
    );
  }
  let y = 24;
  const comps = [];
  const col = [];
  // lockups down the left, and the square art beside the last two rows
  const wide = parts.slice(0, 4);
  const sq = parts.slice(4);
  for (const img of wide) {
    const meta = await sharp(img).metadata();
    const scale = Math.min(1, 900 / meta.width);
    const w = Math.round(meta.width * scale);
    const h = Math.round(meta.height * scale);
    const sized = await sharp(img).resize(w, h).png().toBuffer();
    comps.push({ input: sized, left: 24, top: y });
    y += h + 22;
  }
  let sy = 24;
  for (const img of sq) {
    const sized = await sharp(img).resize(300, 300).png().toBuffer();
    comps.push({ input: sized, left: 948, top: sy });
    sy += 322;
  }
  await sharp({
    create: { width: 1272, height: Math.max(y, sy) + 12, channels: 3, background: "#0d0f13" },
  })
    .composite(comps)
    .jpeg({ quality: 92 })
    .toFile(`${BR}/proof-lockups.jpg`);
  console.log("brand \u2192 public/brand/proof-lockups.jpg  horizontal, stacked, wordmark, wordmark on paper \u00b7 favicon, tile");
}

async function build() {
  const out = artefacts();
  await putSheet(out);
  const reach = out.__reach;
  delete out.__reach;
  for (const [file, text] of Object.entries(out)) emit(file, text);
  console.log(
    `brand: tile reach ${reach.toFixed(0)}px of Android's 205px crop \u2571 ${Object.keys(out).length} files`,
  );
}

/**
 * --check: the same generation, compared to what is on disk instead of written.
 * The point is that nobody ships a nav mark that disagrees with the app icon;
 * `npm run brand:check` in CI makes that a build failure rather than a taste
 * argument. Exits 1 with the file list when something is stale.
 */
async function check() {
  const out = artefacts();
  await putSheet(out);
  delete out.__reach;
  const stale = [];
  for (const [file, text] of Object.entries(out)) {
    let onDisk = null;
    try {
      onDisk = readFileSync(resolve(file), "utf8");
    } catch {
      onDisk = null;
    }
    if (onDisk !== text) stale.push(file);
  }
  if (stale.length) {
    console.error(`brand: ${stale.length} file(s) do not match scripts/brand.mjs \u2014 run \`npm run brand\``);
    for (const f of stale) console.error(`  stale  ${f}`);
    process.exit(1);
  }
  console.log(`brand: ${Object.keys(out).length} files in step with the generator`);
}

/* Only run when this file is the entry point, so tooling can import the
   geometry without rewriting the repo on every import. */
const IS_MAIN = process.argv[1] && resolve(process.argv[1]).endsWith("brand.mjs");
if (IS_MAIN) {
  if (process.argv.includes("--check")) await check();
  else if (!process.argv.includes("--probe")) await build();
  if (process.argv.includes("--preview") || process.argv.includes("--probe")) {
    await proof(process.argv.includes("--probe") ? "probe" : "proof");
  }
}
