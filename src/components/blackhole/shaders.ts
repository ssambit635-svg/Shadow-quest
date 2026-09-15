/**
 * shaders.ts — the GLSL for the singularity plate.
 *
 * One idea, four passes:
 *
 *   · SKY     a procedural deep field — stars on a power-law brightness
 *             curve, a galactic band, cold dust. Generated once, on the GPU,
 *             into a cubemap, because the lensing shader has to sample the
 *             sky *by direction* after the light has been bent.
 *   · DISK    the accretion structure, also generated once into an RGBA16F
 *             target: emissivity, optical depth, hot knots, corona haze.
 *             Stored as *structure*, not as colour — the colour comes out of
 *             the temperature in the trace, because the observed temperature
 *             is the emitted one shifted by the Doppler/gravitational factor,
 *             and that shift is what the picture is really about.
 *   · TRACE   one fragment shader, one ray per pixel: the Schwarzschild null
 *             geodesic, integrated with RK4 on
 *
 *                 d²r⃗/dλ² = −3/2 · h² · r⃗ / r⁵ ,   h = |r⃗ × dr⃗/dλ|
 *
 *             which is exactly the Binet equation u'' + u = 3/2·u² (u = 1/r,
 *             r in units of the Schwarzschild radius) written in Cartesian
 *             form — light bends because the equation says so, not because a
 *             trick says so. The disk is crossed analytically as a Gaussian
 *             slab, so the sheet never has to be caught between steps.
 *   · LOOK    the photographic half: bright-pass, two blur widths, an
 *             anamorphic streak, ACES, chromatic aberration, grain, vignette,
 *             and a temporal average that keeps the frame still while the
 *             camera rests and drops to a single sample the moment you drag.
 *
 * Everything is GLSL 1 syntax; three.js rewrites it to ES 3.0 for WebGL2
 * (varying→in, gl_FragColor→pc_fragColor, texture2D/Cube→texture).
 */

/* ------------------------------------------------------------ shared */

export const GLSL_COMMON = /* glsl */ `
#define SQ_PI  3.141592653589793
#define SQ_TAU 6.283185307179586

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(
    mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
    mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x),
    f.y);
  float b = mix(
    mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
    mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x),
    f.y);
  return mix(a, b, f.z);
}

/* Three octaves, fixed — a loop bound the compiler can unroll, and an
   fbm that is not the expensive part of anything here. */
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s / 0.875;
}

/* A blackbody ramp, normalised: t = 1 is white-blue (the inner edge of the
   disk, ~10⁴ K), t ≈ 0.3 is the deep orange of the outer disk, t → 0 the
   dull red of something barely lit. In between it goes through the same
   white-brass-vermilion the rest of the site is drawn in, which is not a
   coincidence — the palette was the physics all along. */
vec3 blackbody(float t) {
  t = clamp(t, 0.0, 1.35);
  vec3 c = mix(vec3(1.00, 0.26, 0.09), vec3(1.00, 0.55, 0.24), smoothstep(0.05, 0.42, t));
  c = mix(c, vec3(1.00, 0.86, 0.70), smoothstep(0.40, 0.74, t));
  c = mix(c, vec3(0.88, 0.93, 1.00), smoothstep(0.72, 1.0, t));
  return c;
}

vec3 aces(vec3 x) {
  // Narkowicz's ACES fit — good enough to be worth its four instructions,
  // and it keeps the disk's core from clipping to flat white.
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;

/* ------------------------------------------------------------- quad */

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* -------------------------------------------------------------- sky */

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
${GLSL_COMMON}

uniform float uSeed;
varying vec3 vDir;

/* The sky cube holds only what a texture can hold honestly: the smooth
   background — the dust band and the faint nebulae. Point sources cannot
   live in a cube this size (a 1024² face is 0.35° per texel; a star written
   into it is either a blob or, if it is small enough to be a star, never
   sampled at all). The stars are evaluated in the trace pass instead, after
   the lensing, where they can be sub-pixel sharp at any zoom. */
void main() {
  vec3 d = normalize(vDir);

  /* The band: a plane of dust the camera happens to be near — the one
     structure that makes a starfield read as a *place*. */
  vec3 bandN = normalize(vec3(0.32, 0.86, -0.40));
  float band = exp(-pow(dot(d, bandN) / 0.34, 2.0));

  float n1 = fbm3(d * 2.4 + uSeed * 3.0);
  float n2 = fbm3(d * 6.1 - uSeed * 5.0);
  /* A low power on purpose. Sharp filaments out here are the worst of both
     worlds: too structured to read as distance, too faint to read as
     anything else — they just look like something is wrong with the render. */
  float dust = pow(clamp(n2 * 0.5 + n1 * 0.75, 0.0, 1.6), 1.35);

  /* Faint enough to be *felt* rather than seen — a starfield with a visible
     fog in front of it is a starfield nobody believes. */
  vec3 nebula = vec3(0.0125, 0.0048, 0.0042) * n1;
  nebula += vec3(0.0046, 0.0054, 0.0115) * (1.0 - n1) * 0.6;
  nebula *= (0.10 + 0.85 * band) * (0.35 + 1.05 * dust);

  /* The cube carries the smooth background only — dust and band — because
     smooth things survive being stored in a small texture and point things
     do not. The stars arrive in the trace pass, where they can be sharp. */
  gl_FragColor = vec4(nebula, 1.0);
}
`;

/* ------------------------------------------------------------- disk */

export const DISK_FRAG = /* glsl */ `
${GLSL_COMMON}

uniform float uDiskIn;
uniform float uDiskOut;
uniform float uSeed;
varying vec2 vUv;

/* The disk, as structure.
 *
 * x runs around the ring (periodic — the texture wraps), y runs across it in
 * *log* radius, which is the only spacing that gives the inner rings the room
 * they need; a linear radius would spend three quarters of the texture on the
 * outer third of the picture.
 *
 * Four channels, no colour:
 *   r  emissivity      filaments, sheared into arcs by the radius term in the
 *                      noise domain — a disk shears, so the noise domain has
 *                      to be sheared with it or the pattern reads as smoke
 *   g  optical depth   the dense strands that actually hide what is behind
 *   b  hot knots       sparse, sharply bright: the flares real disks show
 *   a  corona          the thin hot plasma that hangs above the sheet
 */
void main() {
  float lr = clamp(vUv.y, 0.0, 1.0);
  float r = uDiskIn * pow(uDiskOut / uDiskIn, lr);
  float phi = vUv.x * SQ_TAU;
  float spin = log(r / uDiskIn);

  float ang = phi + spin * 1.15;
  vec3 q = vec3(cos(ang) * r * 0.55, sin(ang) * r * 0.55, spin * 2.35 + uSeed);

  /* Three tiers. The middle one is stretched along the ring — its noise
     domain is compressed radially and expanded azimuthally, so it comes out
     as the long filaments a sheared disk actually shows, instead of the
     isotropic blobs a plain fbm would give. The finest tier is deliberately
     coarse: at a grazing angle a pixel covers about one texel of this sheet,
     and detail finer than a texel does not become detail, it becomes moiré. */
  float f = fbm3(q);
  /* The filament domain: a slow lap around the ring (the unit circle, so it
     closes on itself and leaves no seam) against a fast axis in radius. The
     noise therefore varies about four times faster across the disk than
     along it, which is what turns blobs into arcs. */
  vec3 filP = vec3(cos(ang), sin(ang), 0.0) * 1.6 + vec3(0.0, 0.0, r * 2.6 + spin * 3.0);
  float fil = fbm3(filP);
  float fh = fbm3(q * 5.20 + 31.0);

  float inner = 1.0 - smoothstep(0.0, 0.32, lr);
  /* The inner edge is softened a little — a step edge here is the loudest
     thing in the frame, and the photon ring that focuses on it comes out as
     a dotted line rather than a caustic. A *little*: soften it by much and
     the lensed band thickens until the shadow has no edge at all, which is
     the one thing this picture cannot afford. */
  float edges = smoothstep(0.0, 0.028, lr) * (1.0 - smoothstep(0.62, 1.0, lr));

  /* Filaments, not smoke: a high power on the low octaves leaves thin bright
     strands with real gaps between them, and the gaps are what let the
     shadow read as a shadow. */
  float strands = pow(clamp(f * 1.45 - 0.06, 0.0, 2.0), 2.1);
  float emissivity = strands * (0.34 + 1.35 * fil);
  emissivity *= edges * (0.45 + 1.55 * inner);
  emissivity = clamp(emissivity, 0.0, 2.4);

  float optical = pow(clamp(f * 1.35 - 0.12, 0.0, 2.0), 2.0) * (0.30 + 1.05 * fil) * edges;
  optical = clamp(optical, 0.0, 2.0);

  float knots = pow(max(fh - 0.30, 0.0) * 2.6, 3.0) * (0.25 + 0.95 * inner);
  knots = clamp(knots, 0.0, 3.0);

  float corona = smoothstep(0.35, 0.95, f) * edges * (0.30 + 0.7 * inner);

  gl_FragColor = vec4(emissivity, optical, knots, corona);
}
`;

/* ------------------------------------------------------------- trace */

export const TRACE_FRAG = /* glsl */ `
${GLSL_COMMON}

uniform float uAspect;
uniform mat3  uBasis;
uniform vec3  uCamPos;
uniform float uTanHalfFov;
uniform float uTime;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uDiskH;
uniform float uDiskKappa;
uniform float uDiskGain;
uniform float uHotGain;
uniform float uHazeGain;
uniform float uSkyGain;
uniform float uSkyLod;
uniform float uSpinRate;
uniform float uMaxSteps;
uniform float uStepScale;
uniform float uEscape;
uniform vec2  uJitter;
uniform vec2  uPixel;      // one pixel of the trace target, in NDC
uniform float uJitterScale;
uniform float uStarSigma;  // one star's radius, in radians
uniform float uStarGain;
uniform float uSeed;
uniform sampler2D uDiskTex;
uniform samplerCube uSky;

varying vec2 vUv;

const float SQ_RS = 1.0;          // everything is measured in Schwarzschild radii

/* d²r⃗/dλ² for a null geodesic of the Schwarzschild metric, rs = 1.
   h² = |r⃗ × dr⃗/dλ|² is a constant of the motion — the same h² the Binet form
   carries in its 3/2·u² term. */
vec3 accel(vec3 p, float h2) {
  float r2 = dot(p, p);
  float r5 = r2 * r2 * sqrt(r2);
  return -1.5 * h2 * p / max(r5, 1e-7);
}

/* Observed / emitted frequency for a point on the disk: a circular orbit at
   r (v = √(M/r) = √(rs/2r) in units of c) seen from the camera, times the
   √(1 − rs/r) a photon loses climbing back out. This one number is why a
   black hole photograph is brighter on one side than the other. */
float frequencyShift(vec3 hit, vec3 toCam, float r) {
  float beta = sqrt(0.5 / max(r, 1.6));
  vec3 vdir = normalize(vec3(-hit.z, 0.0, hit.x));   // prograde tangent, +φ
  float gamma = inversesqrt(max(1.0 - beta * beta, 1e-4));
  float doppler = 1.0 / (gamma * (1.0 - beta * dot(vdir, toCam)));
  float gravity = sqrt(max(1.0 - SQ_RS / max(r, 1.05), 1e-4));
  return doppler * gravity;
}

/* The disk is an *infinitely thin sheet with a Gaussian vertical profile*,
   which is the one geometry whose column depth along a ray can be written
   down instead of marched: H√π /|cos i|. So the sheet can never be stepped
   over — no matter how long the geodesic step was — and grazing rays, which
   look through hundreds of scale heights of it, saturate to opaque on their
   own. That is also exactly what an edge-on disk looks like: a bright limb.
   A second branch handles the segment that grazes the sheet without crossing
   the mid-plane. */
void diskSegment(vec3 p0, vec3 p1, out vec3 emit, out float tau) {
  emit = vec3(0.0);
  tau = 0.0;

  vec3 seg = p1 - p0;
  float len = length(seg);
  if (len < 1e-6) return;
  vec3 sdir = seg / len;

  float y0 = p0.y;
  float y1 = p1.y;
  float dy = abs(sdir.y);

  vec3 sp;
  float path;
  float H;

  if (y0 * y1 <= 0.0) {
    float t = y0 / (y0 - y1);
    sp = mix(p0, p1, t);
    H = uDiskH * (0.30 + 0.70 * length(sp.xz) / uDiskOut);
    path = 1.7724539 * H / max(dy, 0.02);
  } else {
    vec3 mid = mix(p0, p1, 0.5);
    float rm = length(mid.xz);
    H = uDiskH * (0.30 + 0.70 * rm / uDiskOut);
    float yc = abs(mid.y);
    if (dy > 0.85 || yc > 2.2 * H) return;
    sp = mid;
    path = len * exp(-(yc * yc) / (H * H));
  }

  float r = length(sp.xz);
  if (r < uDiskIn * 0.88 || r > uDiskOut) return;

  float phi = atan(sp.z, sp.x);
  float shear = uSpinRate * uTime * pow(max(r, 1.0), -1.5);
  float u = phi / SQ_TAU + shear;
  float v = log(r / uDiskIn) / log(uDiskOut / uDiskIn);
  vec4 tex = texture2D(uDiskTex, vec2(u, clamp(v, 0.0, 1.0)));

  float shift = clamp(frequencyShift(sp, -sdir, r), 0.32, 1.45);
  float tEmit = 1.18 * pow(uDiskIn / r, 0.92);
  /* The observed temperature is the emitted one times the shift — and the
     radiance goes as its *fourth* power, so the approaching side is not
     merely brighter, it dominates. Held at 2.6 rather than 4 so the shadow
     still has a disk around it instead of one lit crescent. */
  float tObs = clamp(tEmit * shift, 0.07, 1.35);

  tau = tex.g * uDiskKappa * path;
  float alpha = 1.0 - exp(-tau);

  vec3 source = blackbody(tObs) * pow(tObs, 2.4) * uDiskGain;
  source *= tex.r + tex.b * uHotGain;
  emit = source * alpha;
}

/* One lattice shell of stars. Called three times with different scales —
   written out rather than looped over arrays, because GLSL ES 1.0 wants
   constant indices and three calls cost nothing. */
vec3 starShell(vec3 d, float scale, float density, float seed, float weight, float sigma0) {
  vec3 p = d * scale;
  vec3 cell = floor(p);
  vec3 acc = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    vec3 o = vec3(mod(float(i), 2.0), mod(floor(float(i) * 0.5), 2.0), floor(float(i) * 0.25));
    vec3 c = cell + o;
    vec3 h = hash33(c * 1.37 + seed);
    if (h.x > density) continue;

    vec3 h2 = hash33(c * 2.11 + seed * 1.7 + 5.7);
    vec3 dv = (c + h2) - p;
    float d2 = dot(dv, dv);

    float mag = h.y * h.y * h.y * h.y;
    /* sigma0 arrives as a pixel angle in radians; d is measured in lattice
       cells, so the two only agree once sigma is scaled by the shell. That
       factor is the difference between a starfield and an empty sky. */
    float sigma = max(sigma0 * scale * (0.55 + 1.3 * mag), 0.00035);
    float core = exp(-d2 / (sigma * sigma));
    float temp = mix(0.30, 1.0, h2.z);
    vec3 tint = mix(vec3(1.0, 0.70, 0.48), vec3(0.74, 0.84, 1.0), temp);
    acc += tint * core * (0.30 + mag * 9.0) * weight;
  }
  return acc;
}

/* The densities are small on purpose. A shell of scale s has about 4πs² cells
   on the sky, so a shell at s = 30 with density 0.02 carries ~220 stars in the
   *whole sphere*, and the 190 shell carries a few thousand faint ones. Anything
   denser stops being a sky and becomes static. */
vec3 starField(vec3 d, float sigma0, float gain) {
  vec3 stars = vec3(0.0);
  stars += starShell(d, 30.0, 0.020, uSeed + 1.0, 1.00, sigma0);
  stars += starShell(d, 82.0, 0.011, uSeed + 9.0, 0.65, sigma0);
  stars += starShell(d, 190.0, 0.0075, uSeed + 21.0, 0.30, sigma0);
  return stars * gain;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  /* Sub-pixel jitter — the other half of the temporal average. While the
     camera moves the jitter is pinned to the pixel centre so nothing
     shimmers; while it rests, each frame lands somewhere else inside the
     pixel and the average is a genuinely multi-sampled edge. The radius runs
     wider than one pixel on purpose: the photon ring is a caustic, of no
     width at all in the exact solution, and a sample confined to one pixel
     lights it as a dotted line. */
  ndc += (uJitter - 0.5) * uPixel * uJitterScale;
  vec3 dir = normalize(uBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));

  vec3 pos = uCamPos;
  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool captured = false;

  for (int i = 0; i < 400; i++) {
    if (float(i) >= uMaxSteps) break;

    float r = length(pos);
    if (r < SQ_RS * 1.02) { captured = true; break; }
    if (r > uEscape && dot(pos, vel) > 0.0) break;

    /* Step grows with the local radius: the curvature that matters lives
       inside a few rs, and out at r ≈ 20 a step of two radii is still a
       straight line. The first step carries the pixel's jitter so that the
       banding grazing rays produce becomes grain the eye will accept. */
    float dt = uStepScale * clamp(0.055 * pow(r, 1.35), 0.015, 2.2);
    if (i == 0) dt *= 0.30 + 0.70 * fract(uJitter.x * 7.13 + uJitter.y * 3.71);

    vec3 p0 = pos;
    vec3 v0 = vel;
    vec3 k1x = v0;               vec3 k1v = accel(p0, h2);
    vec3 k2x = v0 + 0.5 * dt * k1v; vec3 k2v = accel(p0 + 0.5 * dt * k1x, h2);
    vec3 k3x = v0 + 0.5 * dt * k2v; vec3 k3v = accel(p0 + 0.5 * dt * k2x, h2);
    vec3 k4x = v0 + dt * k3v;       vec3 k4v = accel(p0 + dt * k3x, h2);

    vec3 p1 = p0 + (dt / 6.0) * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
    vec3 v1 = v0 + (dt / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

    vec3 emit = vec3(0.0);
    float tau = 0.0;
    diskSegment(p0, p1, emit, tau);
    if (tau > 0.0 || emit.r + emit.g + emit.b > 0.0) {
      col += trans * emit;
      trans *= exp(-tau);
      if (trans < 0.0025) { trans = 0.0; break; }
    }

    /* Corona: the optically thin plasma that hangs over the sheet, falling
       off with radius and with height. Without it the shadow has a hard edge
       against the disk and the picture reads as a diagram.
       It is gated *outside* the inner edge, and that gate is the difference
       between a black hole and a dark brown egg. Inside a thin disk's ISCO
       there is almost nothing left to glow, and a glow there sits directly in
       front of the shadow — the one place in the frame that has to be black
       for the picture to mean anything. */
    if (r < 12.0 && uHazeGain > 0.0) {
      vec3 mid = mix(p0, p1, 0.5);
      float segLen = distance(p0, p1);
      float rm = length(mid);
      float inner = smoothstep(1.35, 3.75, rm);
      float dens = uHazeGain * exp(-max(rm - 1.7, 0.0) * 0.62) * exp(-abs(mid.y) * 0.30) * inner;
      if (dens > 0.0006) {
        float n = vnoise(mid * 1.35 + vec3(0.0, uTime * 0.04, 0.0));
        float d = dens * (0.50 + 1.05 * n) * segLen;
        col += trans * vec3(1.00, 0.62, 0.44) * d * 2.0;
        trans *= exp(-d * 0.55);
      }
    }

    pos = p1;
    vel = v1;
  }

  if (!captured) {
    vec3 outDir = normalize(vel);
    vec3 sky = textureCube(uSky, outDir, uSkyLod).rgb * uSkyGain;
    /* A star is behind the camera as often as in front of it, and the sky
       map's band is the only thing that needs the cube at all. */
    float band = exp(-pow(dot(outDir, normalize(vec3(0.32, 0.86, -0.40))) / 0.34, 2.0));
    sky += starField(outDir, uStarSigma, uStarGain) * (0.55 + 0.85 * band);
    col += trans * sky;
  }

  gl_FragColor = vec4(col, 1.0);
}

`;

/* --------------------------------------------------- temporal average */

export const BLEND_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform float uMix;
varying vec2 vUv;
void main() {
  vec3 p = texture2D(uPrev, vUv).rgb;
  vec3 c = texture2D(uCur, vUv).rgb;
  gl_FragColor = vec4(mix(p, c, uMix), 1.0);
}
`;

/* ------------------------------------------------------------ look */

export const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float w = smoothstep(uThreshold, uThreshold + uKnee, l);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uDir;      // texel-scaled direction
varying vec2 vUv;

/* Nine taps, Gaussian-ish weights. Separable, so two passes make a real
   two-dimensional blur for the price of one and a half. */
void main() {
  vec3 sum = texture2D(uTex, vUv).rgb * 0.227027;
  sum += (texture2D(uTex, vUv + uDir * 1.3846).rgb + texture2D(uTex, vUv - uDir * 1.3846).rgb) * 0.316216;
  sum += (texture2D(uTex, vUv + uDir * 3.2308).rgb + texture2D(uTex, vUv - uDir * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`;

export const STREAK_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uStep;    // texel-scaled, always horizontal
varying vec2 vUv;
void main() {
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 26.0);
    sum += texture2D(uTex, vUv + uStep * fi).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
${GLSL_COMMON}

uniform sampler2D uScene;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform sampler2D uStreak;
uniform vec2  uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloom;
uniform float uStreakGain;
uniform float uAberration;
uniform float uGrain;
uniform float uVignette;
uniform float uLoading;   // 0..1, the first-light fade

varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);

  /* Chromatic aberration, radial and tiny — the last thing a real lens does
     to a bright edge, and the cheapest way to make a rendered frame stop
     looking rendered. */
  float ca = uAberration * (0.35 + r2 * 2.2);
  vec3 scene;
  scene.r = texture2D(uScene, vUv + c * ca).r;
  scene.g = texture2D(uScene, vUv).g;
  scene.b = texture2D(uScene, vUv - c * ca).b;

  vec3 bloom = texture2D(uBloomA, vUv).rgb + texture2D(uBloomB, vUv).rgb * 1.45;
  vec3 streak = texture2D(uStreak, vUv).rgb;

  vec3 col = scene + bloom * uBloom + streak * uStreakGain * vec3(1.0, 0.60, 0.44);
  col *= uExposure * uLoading;

  col = aces(col);

  col *= 1.0 - uVignette * smoothstep(0.02, 0.62, r2);
  col += (hash13(vec3(vUv * uRes, fract(uTime) * 977.0)) - 0.5) * uGrain;

  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`;
