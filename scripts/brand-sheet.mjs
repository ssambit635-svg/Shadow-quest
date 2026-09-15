/**
 * scripts/brand-sheet.mjs — public/brand/index.html, the brand sheet.
 *
 * Generated on purpose. A hand-written sheet is a document that quietly goes
 * out of date the first time somebody retunes the mark; this one is another
 * artefact of scripts/brand.mjs, so `npm run brand:check` fails if the picture
 * and the pixels ever disagree. It inlines the live mark and derives its own
 * palette from the same tokens the script paints with.
 *
 * It is a page for humans, not part of the app: it lives in public/, loads the
 * site's webfonts, and never runs a line of script (the CSP in public/_headers
 * is script-src 'self', and a brand sheet that needs JS is a brand sheet that
 * will be broken in production).
 */

export default function sheet({ T, TAGLINE, markBody, GEO, GEO_TILE, GEO_FAV, n }) {
  const live = markBody({ paint: "live" });
  const ink = markBody({ tile: true });
  const paper = markBody({ tile: true, paint: "onPaper" });
  const mono = markBody({ paint: "monoLight" });

  const swatches = [
    ["--ink-900", T.ink, "the field; every tile, the splash"],
    ["--bone-100", T.bone100, "the orbit, the wordmark"],
    ["--bone-500", T.bone500, "the shadow half, nothing else"],
    ["--vermilion", T.vermilion, "the sun; the only action colour"],
    ["--brass", T.brass, "rules and readouts only"],
  ];

  const sizes = [16, 24, 32, 48, 64, 96, 128];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="robots" content="noindex" />
    <title>ShadowQuest — brand sheet</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;800;900&family=Rajdhani:wght@400;500;600;700&family=Manrope:wght@300;400;600&family=JetBrains+Mono:wght@400;600&family=Shippori+Mincho:wght@500;700&display=swap"
      rel="stylesheet"
    />
    <style>
      /* Generated from the same palette scripts/brand.mjs paints with, so this
         page cannot drift from the theme it documents. */
      :root {
        --ink-900: ${T.ink};
        --ink-800: ${T.ink800};
        --bone-100: ${T.bone100};
        --bone-200: ${T.bone200};
        --bone-300: ${T.bone300};
        --bone-500: ${T.bone500};
        --vermilion: ${T.vermilion};
        --vermilion-lit: ${T.vermilionLit};
        --brass: ${T.brass};
        --line: color-mix(in srgb, var(--bone-200) 12%, transparent);
        --font-display: Orbitron, "Eurostile Extended", Rajdhani, sans-serif;
        --font-label: Rajdhani, Oswald, "Arial Narrow", sans-serif;
        --font-body: Manrope, "Helvetica Neue", Arial, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, monospace;
        --font-jp: "Shippori Mincho", serif;
        color-scheme: dark;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--ink-900);
        color: var(--bone-100);
        font: 400 15px/1.75 var(--font-body);
        -webkit-font-smoothing: antialiased;
      }
      .wrap { max-width: 1160px; margin: 0 auto; padding: 0 clamp(18px, 4vw, 44px) 120px; }
      header.top {
        padding: 64px 0 40px;
        border-bottom: 1px solid var(--line);
        display: grid;
        grid-template-columns: 96px 1fr;
        gap: 28px;
        align-items: center;
      }
      header.top .mark { width: 96px; color: var(--bone-200); }
      h1 {
        font: 800 clamp(24px, 4.4vw, 40px)/1.1 var(--font-display);
        letter-spacing: 0.18em;
        margin: 0;
      }
      h1 em { font-style: normal; color: var(--vermilion); }
      .sub { margin: 12px 0 0; color: var(--bone-300); font: 500 11px/1 var(--font-label); letter-spacing: 0.34em; text-transform: uppercase; }
      .jp { font: 500 15px/1 var(--font-jp); color: var(--bone-500); letter-spacing: .3em; margin-top: 14px; }
      section { padding: 56px 0; border-bottom: 1px solid var(--line); }
      h2 {
        font: 600 11px/1 var(--font-label);
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--brass);
        margin: 0 0 6px;
      }
      h2 + p.lede { margin: 0 0 28px; color: var(--bone-300); max-width: 78ch; }
      .grid { display: grid; gap: 14px; }
      .g-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .g-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .g-auto { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
      @media (max-width: 880px) { .g-4, .g-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      .cell {
        border: 1px solid var(--line);
        background: var(--ink-800);
        padding: 22px;
        display: grid;
        place-items: center;
        gap: 14px;
        min-height: 150px;
      }
      .cell.paper { background: ${T.paper}; color: var(--ink-900); }
      .cell.photo {
        background: #cbc4b6 url("/img/ink-wash.jpg") center/cover;
        color: var(--bone-100);
        position: relative;
        isolation: isolate;
      }
      .cell.photo::after { content: ""; position: absolute; inset: 0; background: rgba(8,9,12,.45); z-index: -1; }
      .cap { font: 600 9px/1 var(--font-label); letter-spacing: 0.22em; text-transform: uppercase; color: var(--bone-500); }
      .cell.paper .cap { color: #6d7482; }
      figure { margin: 0; width: 100%; display: grid; place-items: center; gap: 12px; }
      img, svg { max-width: 100%; height: auto; display: block; }
      .strip { display: flex; align-items: flex-end; gap: 26px; flex-wrap: wrap; }
      .strip .u { display: grid; gap: 10px; justify-items: center; }
      .sw { display: grid; grid-template-columns: 58px 1fr; gap: 16px; align-items: center; border: 1px solid var(--line); padding: 14px 16px; }
      .sw i { display: block; height: 44px; border: 1px solid rgba(255,255,255,.08); }
      .sw b { font: 600 12px/1.4 var(--font-mono); display: block; }
      .sw span { color: var(--bone-300); font-size: 12.5px; }
      code { font: 600 12.5px/1.7 var(--font-mono); color: var(--bone-200); }
      pre {
        margin: 0; padding: 18px 20px; overflow-x: auto;
        border: 1px solid var(--line); background: #06070a;
        font: 400 12.5px/1.9 var(--font-mono); color: var(--bone-200);
      }
      pre b { color: var(--brass); font-weight: 600; }
      .rule { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      @media (max-width: 880px) { .rule { grid-template-columns: 1fr; } }
      .do, .dont { border: 1px solid var(--line); padding: 20px 22px; background: var(--ink-800); }
      .do h3, .dont h3 { margin: 0 0 12px; font: 600 10px/1 var(--font-label); letter-spacing: .26em; text-transform: uppercase; }
      .do h3 { color: var(--bone-100); }
      .dont h3 { color: var(--vermilion-lit); }
      ul { margin: 0; padding-left: 18px; }
      li { margin: 7px 0; color: var(--bone-300); font-size: 13.5px; }
      li b { color: var(--bone-100); font-weight: 600; }
      .files { font: 400 12.5px/2 var(--font-mono); color: var(--bone-300); }
      .files b { color: var(--bone-100); font-weight: 600; }
      footer { padding: 40px 0 0; color: var(--bone-500); font-size: 12.5px; }
      a { color: var(--brass); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--brass) 35%, transparent); }
      a:hover { color: var(--vermilion-lit); border-color: currentColor; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="top">
        <figure class="mark">
          <svg viewBox="0 0 512 512" fill="none" role="img" aria-label="ShadowQuest mark">
            ${live}
          </svg>
        </figure>
        <div>
          <h1>SHADOW<em>QUEST</em></h1>
          <p class="sub">${TAGLINE}</p>
          <p class="jp">影、道を行く</p>
        </div>
      </header>

      <section>
        <h2>The mark — “The Sheared Eclipse”</h2>
        <p class="lede">
          A bone orbit around a vermilion sun, cut once and pulled apart along the
          cut. The upper half keeps the light; the lower half — same geometry,
          slipped, graphite, no colour of its own — is the shadow. The mark is the
          product in one sentence: you, and the self you have to out-walk.
        </p>
        <div class="grid g-4">
          <div class="cell"><figure><svg viewBox="0 0 512 512" fill="none" width="170">${live}</svg><figcaption class="cap">mark · currentColor</figcaption></figure></div>
          <div class="cell paper"><figure><svg viewBox="0 0 512 512" fill="none" width="170">${paper}</svg><figcaption class="cap">on paper</figcaption></figure></div>
          <div class="cell photo"><figure><svg viewBox="0 0 512 512" fill="none" width="170">${mono}</svg><figcaption class="cap">one colour, on texture</figcaption></figure></div>
          <div class="cell"><figure><img src="/brand/mark-mono-dark.svg" width="170" alt="monochrome mark" /><figcaption class="cap">mono · dark</figcaption></figure></div>
        </div>
      </section>

      <section>
        <h2>Construction</h2>
        <p class="lede">
          Everything below is a number in <code>scripts/brand.mjs</code>, not a
          measurement off a picture. The cut is one straight line at
          <b>${GEO.tilt}°</b>; the two halves are congruent except that the shadow is
          slipped <b>${GEO.slip.x} × ${GEO.slip.y}</b> and drawn on a circle
          <b>${Math.round((1 - GEO.scale) * 1000) / 10}%</b> smaller, which is what
          makes it read as cast rather than mirrored.
        </p>
        <div class="grid g-3">
          <div class="cell"><figure><svg viewBox="0 0 512 512" fill="none" width="230">${construction(GEO)}</svg><figcaption class="cap">mark · ${GEO.canvas}px grid</figcaption></figure></div>
          <div class="cell"><figure><svg viewBox="0 0 512 512" fill="none" width="230">${construction(GEO_TILE, true)}</svg><figcaption class="cap">tile · safe-zone tuned</figcaption></figure></div>
          <div class="cell"><figure><svg viewBox="0 0 512 512" fill="none" width="230">${construction(GEO_FAV)}</svg><figcaption class="cap">favicon · told louder</figcaption></figure></div>
        </div>
      </section>

      <section>
        <h2>Lockups</h2>
        <p class="lede">
          The exports are outlined, so they render the same on a machine with no
          fonts installed — which includes every e-mail client, design-tool
          import and CI rasteriser you will ever send them to. Type stays live
          only where it should: in the app, with the webfont.
        </p>
        <div class="grid" style="grid-template-columns:1fr;gap:14px">
          <div class="cell"><img src="/brand/lockup-horizontal.svg" alt="horizontal lockup" /></div>
          <div class="grid g-3">
            <div class="cell"><img src="/brand/lockup-stacked.svg" alt="stacked lockup" /></div>
            <div class="cell"><img src="/brand/wordmark.svg" alt="wordmark" /></div>
            <div class="cell paper"><img src="/brand/wordmark-on-paper.svg" alt="wordmark on paper" /></div>
          </div>
        </div>
      </section>

      <section>
        <h2>Minimum sizes</h2>
        <p class="lede">
          Below 16px the cut closes and the mark becomes a colour dot; that is the
          floor, not a suggestion. The favicon geometry (larger ring, wider void,
          deeper slip) is what holds the split legible at 16 and 32 — the tile
          numbers are for 192 and up.
        </p>
        <div class="strip">
          ${sizes
            .map(
              (s) => `<div class="u"><img src="/favicon.svg" width="${s}" height="${s}" alt="favicon at ${s} pixels" /><span class="cap">${s}px</span></div>`,
            )
            .join("\n          ")}
        </div>
      </section>

      <section>
        <h2>The tile</h2>
        <p class="lede">
          One SVG — <code>public/icons/icon.svg</code> — and two scripts cut every
          raster out of it: <code>scripts/pwa-icons.mjs</code> for the manifest and
          iOS, <code>scripts/android-assets.mjs</code> for launcher, adaptive
          foreground and splash. The dashed ring is Android's crop of the centre
          80%; the generator refuses to build a mark that crosses it.
        </p>
        <div class="grid g-4">
          <div class="cell"><img src="/icons/icon-512.png" width="170" alt="app icon" /><span class="cap">icon · 512</span></div>
          <div class="cell"><img src="/icons/maskable-512.png" width="170" alt="maskable icon" /><span class="cap">maskable · 512</span></div>
          <div class="cell"><img src="/icons/apple-touch-icon.png" width="170" alt="apple touch icon" /><span class="cap">apple-touch · 180</span></div>
          <div class="cell"><img src="/img/duel-wide.jpg" width="170" height="170" style="object-fit:cover" alt="android splash crop of the artwork" /><span class="cap">shell artwork</span></div>
        </div>
      </section>

      <section>
        <h2>Palette</h2>
        <p class="lede">
          Not a brand palette invented for the logo — the logo palette is the app's
          tokens, and <code>src/styles/tokens.css</code> is the source of truth. The
          previous icon shipped two values no token defined.
        </p>
        <div class="grid g-auto">
          ${swatches
            .map(
              ([name, hex, use]) =>
                `<div class="sw"><i style="background:${hex}"></i><div><b>${name} · ${hex}</b><span>${use}</span></div></div>`,
            )
            .join("\n          ")}
        </div>
      </section>

      <section>
        <h2>Rules</h2>
        <div class="rule">
          <div class="do">
            <h3>Do</h3>
            <ul>
              <li>Clear space on every side equal to the <b>sun's radius</b> — a quarter of the mark's width.</li>
              <li>Use the mark alone when the wordmark is already on screen (nav, tab bar, login).</li>
              <li>One colour on anything photographic, on stamps, on embroidery: <code>mark-mono-*</code>.</li>
              <li>Let <code>currentColor</code> do the theming in-app — that is why the React mark has no colour props.</li>
            </ul>
          </div>
          <div class="dont">
            <h3>Don't</h3>
            <ul>
              <li><b>Do not rotate the cut.</b> The tilt is the composition; a level cut turns the mark into a pie chart.</li>
              <li>No drop shadows, no gradients, no glow on the mark itself. The site glows; the logo does not.</li>
              <li>Never recolour the sun — vermilion is the only action colour the theme allows.</li>
              <li>Do not separate the halves or remove the shadow half; the shear is the idea, not an ornament.</li>
              <li>Do not edit the path data by hand. It is generated.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2>Regenerating</h2>
        <pre><b>npm run brand</b>         # rewrite public/brand/**, favicon, tile, Sigil.tsx, this sheet
<b>npm run brand:check</b>   # CI: fail if any of them disagrees with the generator
<b>npm run brand:icons</b>   # cut the PNG rasters (PWA + Android shell) from the tile
<b>npm run brand:preview</b> # raster proofs: sizes, paper, crop, mono, lockups</pre>
        <p class="lede" style="margin-top:22px">
          The letterform outlines in <code>scripts/brand-letterforms.json</code> are
          extracted from Orbitron ExtraBold 800 and Rajdhani SemiBold 600
          (SIL Open Font License 1.1) by <code>scripts/brand-letterforms.mjs</code>;
          the fonts themselves are not vendored.
        </p>
        <p class="files">
          <b>public/brand/</b> mark.svg · mark-on-ink.svg · mark-on-paper.svg · mark-mono-light.svg · mark-mono-dark.svg · wordmark.svg · wordmark-on-paper.svg · lockup-horizontal.svg · lockup-stacked.svg<br />
          <b>public/icons/icon.svg</b> the tile everything else is cut from · <b>public/favicon.svg</b> 64px, same construction
        </p>
      </section>

      <footer>
        <p>
          <code>npm run brand:preview</code> writes the raster proofs this page
          was checked against — <code>public/brand/proof-sizes.jpg</code> (16px,
          paper, Android&apos;s crop, mono, on texture) and
          <code>proof-lockups.jpg</code>. They are proofs, not brand assets, so
          they stay out of git. Written rules and rationale live beside the code:
          <code>docs/BRAND.md</code>.
        </p>
      </footer>
    </div>
  </body>
</html>
`;

  /** The construction lines the generator actually solved against, drawn over
      the mark itself — a diagram you can check the numbers on, not decoration. */
  function construction(g, showSafe) {
    const cx = g.cx ?? GEO.cx;
    const cy = g.cy ?? GEO.cy;
    const a = (g.tilt * Math.PI) / 180;
    const L = g.ringOut + 46;
    const dx = Math.cos(a) * L;
    const dy = Math.sin(a) * L;
    return `
      <g stroke="#6d7482" stroke-opacity=".5" fill="none" stroke-width="1.4">
        <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(g.ringOut)}" stroke-dasharray="4 4"/>
        <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(g.ringIn)}" stroke-dasharray="4 4"/>
        <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(g.sun)}"/>
        <path d="M${n(cx - dx)} ${n(cy - dy)}L${n(cx + dx)} ${n(cy + dy)}" stroke="${T.vermilion}" stroke-opacity=".85" stroke-width="1.6"/>
        ${showSafe ? `<rect x="51" y="51" width="410" height="410" stroke-dasharray="7 5" stroke="${T.brass}" stroke-opacity=".55"/>` : ""}
      </g>
      <g opacity=".92">${markBody({ geo: { ...GEO, ...g }, paint: "live" })}</g>`;
  }
}
