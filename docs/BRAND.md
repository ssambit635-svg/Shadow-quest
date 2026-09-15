# Brand — the ShadowQuest mark

> The logo is not drawn by hand and pasted in. Every mark, tile, favicon and
> lockup in this repo is generated from one geometry in
> [`scripts/brand.mjs`](../scripts/brand.mjs), and `npm run brand:check` fails
> the build when any of them disagree with it.

---

## 1. The mark — "The Sheared Eclipse"

A bone **orbit** around a vermilion **sun**, cut once by a straight line and
pulled apart along it. The half above the cut keeps the light. The half below it
is the **shadow**: the same geometry, slipped, drawn in graphite at a fraction of
its weight, with no colour of its own.

That is the product in one image — you, and the self you have to out-walk. The
orbit is the loop the app runs (record → repeat → rise); the sun is the ki it
scores; the shear is the discipline. One mark, two halves, one idea.

Three properties make it work as an icon rather than an illustration:

- **The silhouette is not a circle.** The slipped half hangs off the cut, so the
  outline is recognisable even when the colour is stripped or the mark is 16px.
- **Two halves, not three objects.** Nothing floats free; nothing has to be read
  in relation to anything else.
- **It survives its own crops.** The whole construction, including the displaced
  half, fits inside Android's centre-80% adaptive crop — and the generator
  refuses to build a tuning that doesn't.

## 2. What was wrong with the previous mark

Recorded here so the decisions are not relitigated every six months. The old
icon (`#c1362b` sun, `#e6ded0` brush stroke, a dim ground line) had five problems:

| # | Problem | Consequence |
|---|---|---|
| 1 | Three unrelated objects: disc, stroke, ground line | The eye has to work out what the relationship is; there isn't one |
| 2 | The stroke's right terminal ended in a bulb *inside* the sun | Read as a rendering error, not a loaded brush |
| 3 | Composition off-centre (disc up-right, stroke swinging left) | Android's circular crop clipped the stroke's tail; the mark looked different per launcher |
| 4 | Thin strokes at small sizes | At 32px and below it degenerated to mush — the favicon was a red smudge |
| 5 | Two colours (`#0c0b0a` field, `#c1362b` sun) that no token defines | The logo and the theme drifted apart; the logo was not "the site, shrunk" |

Problems 1–4 are fixed by construction: two halves, one cut, centred optically,
tuned per size class (§4). Problem 5 is fixed by pinning the mark to
`src/styles/tokens.css` and generating everything from it.

## 3. Construction

Solved numerically in the cut's own frame (`x` along the shear, `y` along its
normal, origin at the sun's centre), then rotated. `scripts/brand.mjs` emits the
path data; nobody should retype it.

| Knob | Mark | Tile | Favicon | Meaning |
|---|---|---|---|---|
| `r` / `sun` | 134 | 118 | 96 | sun radius |
| `ringIn`–`ringOut` | 146–180 | 134–170 | 108–184 | the orbit, and its thickness |
| `cut` | +10 | +12 | +24 | where the shear sits off the centre |
| `tilt` | −20° | −20° | −20° | the cut's angle; negative rises to the right |
| `slip` | 25 × 21 | 19 × 16 | 42 × 36 | how far the shadow has fallen |
| `scale` | 0.975 | 0.975 | 0.955 | the shadow's circle is smaller: cast, not mirrored |

**Never rotate the cut.** The −20° tilt is the composition; levelled, the mark
becomes a pie chart. The same goes for the halves: they are congruent except for
the slip and the scale — do not redraw the shadow as a different shape.

Clear space on every side equals the sun's radius (≈ ¼ of the mark's width).
Minimum sizes: **16px** for the favicon geometry, **32px** for anything else.

## 4. What ships where

| Artefact | Source | Consumers |
|---|---|---|
| `src/components/Sigil.tsx` | generated | nav, boot curtain, login gate, phone bar, admin — the only mark the app draws |
| `public/brand/mark.svg` | generated | transparent mark; sun from `var(--vermilion)`, everything else `currentColor` |
| `public/brand/mark-on-ink.svg` → `public/icons/icon.svg` | generated | **the** app tile: `scripts/pwa-icons.mjs` and `scripts/android-assets.mjs` cut every raster from it |
| `public/brand/mark-on-paper.svg` | generated | `[data-tone="paper"]` sections, print |
| `public/brand/mark-mono-{light,dark}.svg` | generated | photography, stamps, one-colour contexts |
| `public/favicon.svg` | generated | browser tab — its own geometry, deliberately louder |
| `public/brand/lockup-{horizontal,stacked}.svg`, `wordmark*.svg` | generated | README, docs, marketing, store listings — **outlined**, no font needed |
| `public/brand/index.html` | generated | the visual sheet: mark, construction, sizes, tile, palette, rules |
| `public/brand/proof-*.jpg` | `npm run brand:preview` | raster proofs: sizes, paper, maskable crop, mono, on-photo, lockups |

The React mark takes no colour props on purpose. The sun reads `--vermilion` and
the orbit and shadow read `currentColor`, so one component is correct on ink, on
paper, on a photo, and in a light or a dark bottom bar, with no theme prop
threaded through the tree.

## 5. Rules

**Do**

- Use the mark alone wherever the wordmark is already on screen.
- Use a mono treatment on photography or texture — never the coloured one.
- Use the outlined lockups for anything that leaves the repo (e-mail, docs,
  stores, print). They are self-contained: the same file renders in a browser
  with no fonts, in CI with no fonts, and in Illustrator with no fonts.
- Theme it with `color`/`currentColor` in the app, not with props or new fills.

**Don't**

- Don't rotate, skew, outline, glow, gradient or drop-shadow the mark.
- Don't recolour the sun. Vermilion is the only action colour the theme allows.
- Don't remove the shadow half or "tidy" the shear into a level line.
- Don't hand-edit path data in `Sigil.tsx`, `icon.svg` or `favicon.svg` — it is
  generated and `brand:check` will know.
- Don't use `#0c0b0a` / `#c1362b` (see §7).

## 6. Workflow

```bash
npm run brand          # regenerate every artefact from the geometry
npm run brand:check    # CI: exit 1 if anything on disk disagrees with the script
npm run brand:icons    # cut the PWA + Android rasters from public/icons/icon.svg
npm run brand:preview  # raster proofs into public/brand/proof-*.jpg
```

After changing `GEO`/`GEO_TILE`/`GEO_FAV` in `scripts/brand.mjs`: `npm run brand
&& npm run brand:icons`, then look at `public/brand/proof-sizes.jpg` — that sheet
contains the 16px, the paper version and the Android crop, which are the three
places a pretty mark usually dies.

The wordmark's letterforms are outlines in `scripts/brand-letterforms.json`,
extracted from Orbitron ExtraBold 800 and Rajdhani SemiBold 600 (SIL OFL 1.1) by
`scripts/brand-letterforms.mjs`. Re-extract them only if the wordmark's own type
changes; the TTFs are not vendored, so the script takes their paths as arguments.

The Japanese accent line (影、道を行く) is **not** part of the exported lockups, on
purpose: outlining it would mean vendoring a CJK subset for one line, and leaving
it as live `<text>` would mean a logo that renders in whichever mincho the reader
happens to have. It stays where type is already a webfont — `public/brand/index.html`
and the boot curtain.

## 7. Known drift, deliberately left alone

The mark now speaks the theme's palette; a few places still carry the old ink and
the old vermilion. They are not brand assets, they are app chrome, and changing
them changes what the status bar, splash and manifest look like on a phone — so
they are listed rather than silently swept:

| Where | Value | Token value |
|---|---|---|
| `public/manifest.webmanifest` — `background_color`, `theme_color` | `#0c0b0a` | `--ink-900` `#08090c` |
| `index.html` — `<meta name="theme-color">` ×3 | `#0c0b0a` | same |
| `android/.../values/colors.xml` — `colorPrimary`, `ink`, `ic_launcher_background` | `#0c0b0a` | same |
| `android/.../values/colors.xml` — `colorAccent`, `vermilion` | `#c1362b` | `--vermilion` `#d43d31` |
| `capacitor.config.ts` — splash/backgroundColor | `#0c0b0a` | same |
| `README.md` — `#f4efe6` "bone paper" | old paper value | `--bone-100` `#eef1f6` |

The generated PNG rasters no longer depend on any of them:
`scripts/pwa-icons.mjs` and `scripts/android-assets.mjs` now flatten on
`#08090c`, which is the field the tile itself is drawn on.
