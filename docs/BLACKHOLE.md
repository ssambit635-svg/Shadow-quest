# The hero black hole

`src/components/BlackHole.tsx` is a real-time, gravitationally lensed black hole.
It is not a picture of a ring laid over a disc: every pixel fires one ray out of
the camera and walks it backwards through curved Schwarzschild space until the
ray either falls through the horizon, leaves for the stars, or cuts the gas
disc — often three or four times, because a ray can loop the hole and come
back. The disc is drawn once. The halo above it, the halo below it and the thin
ring hugging the shadow are the same disc, seen again through bent light.

It sits behind the landing hero (`src/sections/Hero.tsx`, `.hero__void`), in
the right half of the section — the same half the samurai plate occupies — and
it is a backdrop: the plate, the argument, the foot and the CTA are all
unchanged and all still legible. `docs/BRAND.md` owns the mark; this file owns
the hole.

---

## 1 · Where it is, and what it is drawn into

```
hero (section, position:relative, z-index:auto)
├─ .hero__ghost            z0   the 影 watermark
├─ .hero__void             z1   ← the black hole's box (pointer-events:none)
│   └─ .hero__hole         the sized, masked square the canvas fills
├─ .hero__dust             z1   ember motes
├─ .hero__grid  (shell)    z1   the argument, left · the plate, right
├─ .hero__foot  (shell)    z1   the four readouts
└─ .hero__brush            z0   the vermilion wash
```

`.hero__void` is the section's own width, anchored to the shell's centre and
offset by the shell's gutter, so it can carry the same column arithmetic the
grid uses without knowing the grid exists:

```css
.hero__void { position:absolute; inset-block:0; left:50%; translate:-50% 0; }
.hero__hole { right: calc(var(--gutter) + var(--rail) - 3.5rem);
              top: calc(50% + 2.5rem);
              width: min(40rem, 50vw, 80svh); aspect-ratio: 1/1; }
```

Three consequences worth knowing before touching any of it:

- **`- 3.5rem`** pulls the hole slightly toward the section's centre so its
  glow reaches under the headline instead of stopping at the plate.
- **`80svh`** is load-bearing. On a short laptop the hero is short too, and a
  fixed square would run its bottom edge — where the mask has *not* finished —
  through the section boundary. Sizing it against the viewport keeps the whole
  falloff inside the section at any height.
- **The mask, not the shader, fades it out.** `radial-gradient(closest-side at
  50% 60%, #000 55%, transparent 100%)`. A hard canvas edge would read as a
  video pasted into the hero; the falloff the browser applies instead thins the
  gas into the ink the page is already painted on, so there is no edge to see.
  The composite shader deliberately has no scrim layer for the same reason.

### The three places `focus` is written down

The hole is not centred in its square — it is drawn low and slightly left
(`focus = [0.5, 0.6]`), which is where it lands under the plate rather than
behind it. That number appears three times and must be the same three numbers:

| where | what |
|-------|------|
| `Hero.tsx → <BlackHole focus={[0.5, 0.6]} />` | where the hole is rendered in the square |
| `home.css → .hero__hole { mask-image: … at 50% 60% }` | where the mask's centre is |
| `home.css → .hero__hole { top: calc(50% + 2.5rem) }` | where the square sits in the hero |

Move one and the hole slides out from under its own fade.

---

## 2 · Scroll is the whole of the interaction

There is no drag, no pointer tracking, no auto-orbit. The camera holds still
and the gas does the moving — the picture's movement is the accretion disc's,
which is where it belongs, and the hero already carries three pointer-chasing
effects (parallax, wash, magnet) that a fourth would only muddy.

As the hero leaves the viewport, progress `p` runs 0 → 1 and is eased
`smoothstep`, driving exactly two things:

- **`swing`** (default 26°) — the camera's azimuth around the hole;
- **`dolly`** (default 0.18) — the camera closes 18% of its distance.

`p` is read from the *void's own* `getBoundingClientRect()`, so there is no
scroll listener, no `ScrollTrigger` and no element to keep in sync with it.
Because the camera moves, the temporal average is not a valid estimate of the
same sky frame to frame; the blend weight is driven up toward a hard reset in
proportion to how far the camera moved last frame, and the average only starts
accumulating again once the page has settled. A `prefers-reduced-motion`
reader gets `p = 0` — one settled still frame, and no animation loop at all.

---

## 3 · Dials

Everything is a prop on the component with a default tuned for the hero slot.
`Hero.tsx` sets `focus` and nothing else; the defaults below are the hero's
picture. Units are the horizon's: `r = 1` is the event horizon, the photon
sphere sits at 1.5, the shadow the camera sees is 2.6 across the radius, and
the disc starts at 3 — the innermost stable orbit gas can hold.

| prop | hero | what it does |
|------|------|--------------|
| `distance` | 11.5 | camera distance from the hole, in horizon radii. Smaller is bigger |
| `elevation` | −3.5 | degrees above the disc plane. Near 0 the disc is edge-on and the far side arches over the shadow as the halo; past ~25 the halo folds away and you are looking down at a ring |
| `azimuth` | −6 | where the camera sits around the hole |
| `roll` | −17 | turns the picture about the line of sight, so the disc runs on a diagonal |
| `fov` | 44 | vertical field of view |
| `diskInner` / `diskOuter` | 3 / 7.2 | the disc's edges, in horizon radii. The outer edge is what sets the picture's reach — it is the halo, not the shadow, that decides how wide the object looks |
| `diskThickness` | 0.3 | half-thickness at the rim; it flares outward from there |
| `diskDensity` | 0.95 | how much gas there is |
| `brightness` | 0.6 | gas brightness before tone mapping |
| `spinSpeed` | 0.05 | turns of the inner rim per second. The rest of the disc follows Kepler, so it lags — hard. This is where nearly all the movement comes from |
| `grain` | 0.5 | size of the turbulence. Higher is finer |
| `doppler` | 0.4 | relativistic beaming, 0 to 1. The gas at the rim runs at 0.41c, so the side coming at you is thrown brighter and bluer |
| `hot` / `mid` / `cool` | `#eef1f6` / `#c7a46a` / `#8a241d` | the gas temperature ramp — bone, brass, deep vermilion |
| `stars` | 0.35 | background stars. They are lensed with everything else, so near the rim they smear into arcs |
| `glow` | 0.75 | bloom |
| `exposure` | 0.9 | exposure into the ACES curve |
| `vignette` | 0.5 | corner darkening |
| `steps` | 200 | steps each ray may take. The one dial that costs real time; 300 is clean, below 140 the disc starts to band |
| `resolution` | 0.5 | render scale. Drop it before you drop `steps` |
| `maxDpr` | 1.25 | cap on device pixel ratio. At dpr 2 an uncapped scene render is four times the work for a soft halo nobody can resolve |
| `focus` | `[0.5, 0.6]` | where the hole sits in the square — see §1 |
| `swing` / `dolly` | 26 / 0.18 | the scroll's two degrees of freedom — see §2 |

**The palette is the brand, by accident.** The disc's hottest gas is at the
inner rim and it cools outward, and this project's palette runs in exactly that
order: bone `#eef1f6` for the rim, brass `#c7a46a` through the middle, deep
vermilion `#8a241d` at the outer edge. That is the only reason the picture is
allowed on the page at all — it reads as *something* and as *this site* at the
same time. The hot zone is deliberately short (`smoothstep(0.68, 1.18, heat)`):
a physically hotter rim blows out to white under ACES and turns the disc into a
bright grey smear on a site whose darkest value is `#08090c`.

---

## 4 · What it costs, and what it does when the machine is slow

Render scale and step count are both props, both lowered here, and both lowered
again at runtime if the frames are long:

- **`steps`** starts at the prop and walks itself down toward a floor of 110
  (40 at a time) any time the smoothed frame time sits over 28ms, and back up
  under 12ms. Hysteresis on both ends, so the picture cannot visibly pump.
- **Software rasterisers** (SwiftShader, llvmpipe, the sort of renderer a
  virtual desktop or a headless browser reports) are detected through
  `WEBGL_debug_renderer_info` before anything is drawn and dropped to a third
  of the render scale, 1× DPR and 120 steps. Without this the shader runs at
  seconds per frame and the browser kills the context for hanging.
- **Nothing is drawn when it cannot be seen.** The animation stops while the
  hero is off screen (`IntersectionObserver`) or the tab is hidden
  (`visibilitychange`) — no frames, no accumulation, no GPU wake-ups.
- **Nothing is drawn until it can be seen.** The loop is gated on the boot
  curtain (`lib/ready.ts`). A still frame is settled at mount, and playback
  starts when the loader lifts.
- **Narrow screens never mount it.** Below 981px the hero stacks to one column
  and there is no empty right half for a backdrop to fill; the phone face of
  this app is a different UI and a ray marcher is not what that screen needs.
  The component asks the same media query in JS (`useMedia`) before it ever
  makes a GL context, and the CSS hides `.hero__void` on the same breakpoint.

### When it cannot run at all

The hero is never allowed to break for the sake of the hole. Every exit is
quiet and leaves the page exactly as it was before this component existed:

- no WebGL context, or a `getContext` that throws → canvas hidden,
  `data-blackhole` on the host says why, the section keeps its ink background;
- a shader that fails to compile or link → same, with one `console.error` line;
- a context lost mid-session → the loop stops and the canvas is hidden (a dead
  canvas paints white over the hero, which is worse than nothing). If the
  context is restored, everything is rebuilt and the picture comes back;
- a resize that takes the hole off the breakpoint → the effect tears down, and
  the GL objects are deleted. The context itself is deliberately left alive:
  React StrictMode runs every effect twice on the same DOM, and a canvas whose
  context was lost hands the same dead context back to the next `getContext`
  call, after which every shader fails with an empty message.

---

## 5 · How to tune it, and how it was tuned

Change a prop in `src/sections/Hero.tsx` and the dev server hot-reloads; the
defaults live in `BlackHole.tsx`. If you are moving the hole's *position*, read
§1 first — three numbers move together.

The values above were chosen by rendering the scene pass offline: a CPU port of
`SCENE_FRAME` was traced at 200–240², tone-mapped through the same ACES curve
and composited behind a blocked-in hero, then compared across camera distances,
elevations, disc outer radii and rim temperatures. Two things came out of that
and are worth keeping in mind when retuning:

- **`diskOuter` decides the composition, not `distance`.** The halo is the
  widest part of the picture, so the outer edge is what has to fit inside the
  mask; pulling the camera back shrinks the shadow faster than it shrinks the
  halo.
- **The plate covers the top of the hole on purpose.** At `focus = [0.5, 0.6]`
  the shadow's upper half sits behind the samurai plate and the lensed band
  arcs out below it, which is what makes the object read as *behind* the hero
  rather than as a sticker on top of it.

### Checks

```sh
npm run typecheck
npm run build
node scripts/audit.mjs          # boots the real bundle, landing page included
```

`scripts/audit.mjs` runs the landing page in an environment with no canvas
context at all, which is the component's most important fallback: if the guard
ever stops working, the audit fails with a page error rather than the hero
quietly disappearing in a browser nobody tested.

A visual pass still needs a real GPU:

```sh
npm run dev
# http://localhost:5173 — the hole is in the hero's right half, behind the plate
```

The `BlackHoleProps` interface is the source of truth for every dial; this
document is the map, not the territory.
