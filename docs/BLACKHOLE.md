# The singularity

The hero's right-hand plate is not a picture. It is a live WebGL2 render of a
black hole: a Schwarzschild null-geodesic integrator in a fragment shader, an
accretion disk crossed analytically, and a star field evaluated after the light
has been bent. Drag it and you orbit the hole; leave it alone and it drifts.

```
src/components/blackhole/
  BlackHole.tsx   the plate: capability probe, lazy import, fallback, frame
  renderer.ts     three.js: the passes, the adaptive resolution, the camera
  shaders.ts      every line of GLSL, in four passes
src/styles/blackhole.css   the chrome (HUD, hint, the drawn fallback)
```

## Why it is not an image

A photograph of a black hole is one framing of one moment. This one is a
camera around a real solution of the field equations, so it can be orbited,
zoomed and left running — and the physics is what makes it hold up at any
angle rather than only the angle the artist chose.

## The physics, and where it is approximated

**The geodesic.** Each pixel shoots a ray. The ray is integrated with RK4 on

```
d²r⃗/dλ²  =  −3/2 · h² · r⃗ / r⁵          h = |r⃗ × dr⃗/dλ|
```

which is the Binet equation for light in Schwarzschild (`u″ + u = 3/2·u²`,
with `u = 1/r` and `r` in Schwarzschild radii) written in Cartesian form. `h²`
is a constant of the motion, so it is computed once per pixel from the
starting position and velocity. A ray that reaches `r < 1.02 rs` is captured;
one that reaches 34 rs moving outward escapes and samples the sky.

**The disk** is an infinitesimally thin sheet with a Gaussian vertical
profile. That choice buys two things: the column depth along a ray is known in
closed form (`H√π / |cos i|`) rather than marched, so the sheet can never be
stepped over however long the step was; and grazing rays — which look along
hundreds of scale heights of it — saturate to opaque on their own, which is
exactly what a disk seen nearly edge-on looks like. A second branch handles a
segment that grazes the sheet without crossing the mid-plane.

**The temperature** is the reason the picture is asymmetric. A point on the
disk orbits at `β = √(M/r)` and the light it emits is beamed by
`1/(γ(1 − β·cos θ))` toward the camera; climbing back out costs another
`√(1 − rs/r)`. The observed temperature is the emitted one times that factor,
and the radiance then goes as its *fourth* power — held here at 2.6, because
at a literal 4 the shadow loses its disk to a single crescent. Colour comes
from a blackbody ramp normalised to the site's own palette.

**Approximations, named:** Schwarzschild, not Kerr (no spin of the hole
itself — the disk still orbits); no radiation transport between annuli beyond
the local blackbody; no self-gravity; corona haze is an exponential stand-in
for scattering rather than a solved transfer; the sky is procedural. None of
these are visible at this size, and each would cost a multiple of the frame.

## The four passes

| pass | what it does |
| --- | --- |
| SKY | once, into a 512² cubemap: the dust band and faint nebulae. Smooth things only — a point source cannot live in a texture that coarse. |
| DISK | once, into an RGBA16F sheet of *structure*: emissivity, optical depth, hot knots, corona. Colour is decided later, in the trace, because the colour depends on the ray. |
| TRACE | per frame, per pixel: the integration above, the star field on escaping rays, ACES-free linear output. |
| LOOK | bright-pass, two blur widths, an anamorphic streak, then one composite: ACES tonemap, chromatic aberration, grain, vignette, sRGB. |

Stars are evaluated in TRACE, not stored in the sky map. In a 512² cube a
texel is 0.7°, so a stored star is either a blob or — if it is small enough to
be a star — never sampled at all. Their radius is set from the frame's own
pixel angle, so they stay points at every zoom.

## Motion and samples

The camera has three states, and the temporal policy follows them:

- **moving** (drag, zoom, idle drift) — the trace runs at a fraction of its
  full rate, and the frame is blended 18% with its predecessor. Enough to take
  the crawl off the shadow's edge, not enough to smear a star.
- **settling** (a third of a second after the last motion) — the camera is at
  the pixel centre and the running average opens back up.
- **still** (the pointer is on the plate, or the camera has not been touched)
— the camera stops entirely and the average converges over a dozen jittered
samples. Sub-pixel jitter is what resolves the photon ring, which is a caustic
and therefore of no width at all; a sample confined to one pixel lights it as
a dotted line.

The resting state is tied to `:hover` on purpose. Pointing at something is the
human signal for *I am looking at this now*, and it is the only moment the
renderer is allowed to stop and let its samples accumulate.

## Cost

- The trace's working resolution is capped (~2 MP) and then scaled down
  whenever the frame budget slips, with a floor at 60% — below that the trace
  reads as a JPEG rather than a lens. Under the floor the renderer skips
  frames instead, so the camera stays smooth even when the picture rate does
  not.
- Blur and streak offsets are fractions of the frame, never texel counts: a
  texel count would widen the glow exactly when the resolution dropped, and a
  picture that changes character as the machine gets busy reads as broken.
- three.js and all of the above live in a lazily imported chunk (~140 kB
  gzip). The landing page's own bundle is unchanged; the plate paints its
  fallback and the hero finishes its entrance before the engine is fetched.
- One draw call per frame plus seven small ones, no post-processing chain
  beyond the two blurs.

## Failure and preference

- **No WebGL2**, a lost context, or a shader that will not compile: the plate
  shows a drawn singularity (halo, disk band, shadow, photon ring) and the
  hero is otherwise untouched. The art is never an empty box.
- **`prefers-reduced-motion`**: the same image, rendered once. The idle drift
  is off; drag, wheel and keyboard still work and repaint.

## Driving it

| gesture | result |
| --- | --- |
| drag | orbit (azimuth and inclination) |
| wheel / pinch | distance, 8.5–52 rs |
| double-click | back to the opening framing |
| arrow keys, `+` / `−` | the same, from the keyboard (the canvas takes focus) |

`touch-action: pan-y` on the canvas means a vertical drag on a phone scrolls
the page and a horizontal one orbits — the plate never traps the scroll. The
wheel is only `preventDefault`ed while it is actually changing the distance,
so at the near and far limits the page scrolls as usual.
