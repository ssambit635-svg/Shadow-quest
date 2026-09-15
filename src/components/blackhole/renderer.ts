/**
 * renderer.ts — the singularity, as three.js.
 *
 * Loaded lazily by <BlackHole /> so that three.js and all of this never sit
 * in the landing page's critical path: the plate paints its fallback, the
 * hero finishes its entrance, and only then does the renderer wake up and
 * take the frame over.
 *
 * What it does per frame, in order:
 *
 *   1. TRACE   the geodesic shader, at an adaptive resolution — cheaper while
 *              you drag, full rate when the camera rests.
 *   2. BLEND   a temporal average. Held still, the frame is the average of
 *              several jittered samples, which is where the smooth shadow
 *              edge comes from; the moment you touch it the average opens
 *              back up to a single sample so nothing smears.
 *   3. LOOK    bright-pass, two blur widths, an anamorphic streak, then one
 *              composite that tonemaps (ACES), adds chromatic aberration and
 *              grain, vignettes, and writes sRGB.
 *
 * The sky and the disk are generated once, on the GPU, into exactly the two
 * textures the trace samples: a cubemap of stars, and an RGBA16F sheet of
 * disk *structure*. Nothing is fetched, nothing is decoded, no image ever
 * crosses the network — the whole instrument is arithmetic.
 */
import * as THREE from "three";
import {
  BLEND_FRAG,
  BLUR_FRAG,
  BRIGHT_FRAG,
  COMPOSITE_FRAG,
  DISK_FRAG,
  QUAD_VERT,
  SKY_FRAG,
  SKY_VERT,
  STREAK_FRAG,
  TRACE_FRAG,
} from "./shaders";

export type BlackHoleTelemetry = {
  /** Angle between the camera and the disk's axis, in degrees. */
  inclination: number;
  /** Camera distance from the singularity, in Schwarzschild radii. */
  distance: number;
  /** Frames averaged into the frame you are looking at. */
  samples: number;
};

export type BlackHoleHandle = {
  /** Back to the framing the plate opens on. */
  reset(): void;
  /** Stop, free every GPU resource, and forget the context. */
  dispose(): void;
};

export type BlackHoleOptions = {
  canvas: HTMLCanvasElement;
  /** prefers-reduced-motion: render, don't animate. */
  reduced: boolean;
  onTelemetry?: (t: BlackHoleTelemetry) => void;
  onReady?: () => void;
  onError?: (reason: string) => void;
};

/* ------------------------------------------------------------------ tune */

const DISK_IN = 3.0; // ISCO, Schwarzschild: 6M = 3 rs
const DISK_OUT = 13.5;
const EL_MIN = 0.055; // ~3.1° above the disk plane
const EL_MAX = 1.505; // ~86.2°, just short of the polar degeneracy
const DIST_MIN = 8.5;
const DIST_MAX = 52;
const EL_OPEN = 0.205; // the framing the plate opens on: ~78.3° inclination
const AZ_OPEN = 0.62;
const DIST_OPEN = 20.5;
const FOV = 38;
/* The trace is the expensive half of this thing, so the frame it renders is
   capped and then scaled down again whenever the machine can't keep up (see
   `renderScale` below). A laptop with a real GPU sits at 1.0; an integrated
   one settles wherever it is smooth. */
const PIXEL_BUDGET = 1700 * 1050;
/* Below this share of the canvas the trace gets too soft to look like a lens
   rather than a JPEG, so the renderer stops shrinking and starts skipping
   frames instead — a slightly steppier animation beats a blurry one. */
const MIN_RENDER_SCALE = 0.6;
/* Temporal blend while something is moving: a *little* smoothing (it removes
   most of the crawl on the shadow's edge) and not enough motion to turn a
   sub-pixel star into a dash. The full converging average is reserved for a
   camera that is genuinely holding still. */
const MR_MOVING = 0.18;

/* Between them these two keep the loop honest on a laptop: dt grows with the
   radius, so a typical pixel spends its budget near the hole, where the
   bending is, and almost none of it on the straight part of its journey. */
const STEP_SCALE = 1.0;

type Cam = {
  az: number;
  el: number;
  dist: number;
  azT: number;
  elT: number;
  distT: number;
  azV: number;
  elV: number;
  idle: number;
  dragging: boolean;
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function createBlackHole(opts: BlackHoleOptions): BlackHoleHandle {
  const { canvas, reduced } = opts;
  const host = canvas.parentElement ?? canvas;

  /* ------------------------------------------------------------ context */

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(1);
  renderer.autoClear = true;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const gl = renderer.getContext();
  /* A canvas keeps its WebGL context for its whole life, lost or not, and a
     renderer built on a dead one paints nothing forever. Refusing the frame
     here means the plate shows its drawn singularity instead of a black
     rectangle. */
  if (gl.isContextLost()) throw new Error("WebGL context unavailable");
  // Half-float targets are what make the disk's core bloom instead of clipping.
  // WebGL2 makes RGBA16F filterable; rendering into one needs this extension.
  const hdr = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");

  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  const light = coarse || cores <= 4;

  const SKY_SIZE = light ? 512 : 512;
  const DISK_W = light ? 1024 : 2048;
  const DISK_H = light ? 512 : 1024;
  const MAX_STEPS = light ? 170 : 260;

  /* -------------------------------------------------- fullscreen plumbing */

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  const makeMaterial = (frag: string, uniforms: Record<string, THREE.IUniform>, vert = QUAD_VERT) =>
    new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      blending: THREE.NoBlending,
    });

  const quadMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material> = new THREE.Mesh(
    quadGeo,
    new THREE.MeshBasicMaterial(),
  );
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  const drawQuad = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quadMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  };

  /* ------------------------------------------------------------ geometry */

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  const cam: Cam = {
    az: AZ_OPEN,
    el: EL_OPEN,
    dist: DIST_OPEN,
    azT: AZ_OPEN,
    elT: EL_OPEN,
    distT: DIST_OPEN,
    azV: 0,
    elV: 0,
    idle: 0,
    dragging: false,
  };

  /* ---------------------------------------------------------- the trace */

  const traceUniforms: Record<string, THREE.IUniform> = {
    uAspect: { value: 1 },
    uBasis: { value: new THREE.Matrix3() },
    uCamPos: { value: new THREE.Vector3() },
    uTanHalfFov: { value: Math.tan((FOV * Math.PI) / 360) },
    uPixel: { value: new THREE.Vector2() },
    uStarSigma: { value: 0.00085 },
    uStarGain: { value: 1.0 },
    uSeed: { value: 2.0 },
    uJitter: { value: new THREE.Vector2(0.5, 0.5) },
    uJitterScale: { value: 1 },
    uTime: { value: 0 },
    uDiskIn: { value: DISK_IN },
    uDiskOut: { value: DISK_OUT },
    uDiskH: { value: 0.045 },
    uDiskKappa: { value: 7.0 },
    uDiskGain: { value: 1.5 },
    uHotGain: { value: 3.2 },
    uHazeGain: { value: light ? 0.012 : 0.016 },
    uSkyGain: { value: 1.0 },
    uSkyLod: { value: 0.0 },
    uSpinRate: { value: 3.4 },
    uMaxSteps: { value: MAX_STEPS },
    uStepScale: { value: STEP_SCALE },
    uEscape: { value: 34 },
    uDiskTex: { value: null },
    uSky: { value: null },
  };
  const traceMaterial = makeMaterial(TRACE_FRAG, traceUniforms);

  const blendMaterial = makeMaterial(BLEND_FRAG, {
    uPrev: { value: null },
    uCur: { value: null },
    uMix: { value: 1 },
  });
  const brightMaterial = makeMaterial(BRIGHT_FRAG, {
    uTex: { value: null },
    /* High on purpose: an anamorphic streak is what a *blinding* source does
       to a lens, and a star — however bright — is not one. Keeping the
       threshold well above the star peaks leaves the glow to the disk's hot
       inner edge, which is the only thing in frame that has earned it. */
    uThreshold: { value: hdr ? 2.2 : 0.62 },
    uKnee: { value: hdr ? 1.6 : 0.45 },
  });
  const blurMaterial = makeMaterial(BLUR_FRAG, {
    uTex: { value: null },
    uDir: { value: new THREE.Vector2() },
  });
  const streakMaterial = makeMaterial(STREAK_FRAG, {
    uTex: { value: null },
    uStep: { value: new THREE.Vector2() },
  });
  const compositeMaterial = makeMaterial(COMPOSITE_FRAG, {
    uScene: { value: null },
    uBloomA: { value: null },
    uBloomB: { value: null },
    uStreak: { value: null },
    uRes: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uExposure: { value: hdr ? 1.0 : 1.15 },
    uBloom: { value: hdr ? 0.15 : 0.10 },
    uStreakGain: { value: 0.050 },
    uAberration: { value: 0.0022 },
    uGrain: { value: 0.0075 },
    uVignette: { value: 0.42 },
    uLoading: { value: 0 },
  });

  const makeRT = (w: number, h: number, wrapS: THREE.Wrapping = THREE.ClampToEdgeWrapping) =>
    new THREE.WebGLRenderTarget(Math.max(4, w), Math.max(4, h), {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });

  let rtTrace: THREE.WebGLRenderTarget | null = null;
  let rtAccA: THREE.WebGLRenderTarget | null = null;
  let rtAccB: THREE.WebGLRenderTarget | null = null;
  let rtBright: THREE.WebGLRenderTarget | null = null;
  let rtBlurA: THREE.WebGLRenderTarget | null = null;
  let rtBlurB: THREE.WebGLRenderTarget | null = null;
  let rtWideA: THREE.WebGLRenderTarget | null = null;
  let rtWideB: THREE.WebGLRenderTarget | null = null;
  let rtStreak: THREE.WebGLRenderTarget | null = null;

  /* ------------------------------------------------------------- the sky */

  const diskRT = makeRT(DISK_W, DISK_H, THREE.RepeatWrapping);
  const diskMaterial = makeMaterial(DISK_FRAG, {
    uDiskIn: { value: DISK_IN },
    uDiskOut: { value: DISK_OUT },
    uSeed: { value: Math.random() * 40 },
  });

  const skyScene = new THREE.Scene();
  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: { uSeed: { value: 2.0 } },
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const skyGeo = new THREE.BoxGeometry(2, 2, 2);
  const skyMesh = new THREE.Mesh(skyGeo, skyMaterial);
  skyMesh.frustumCulled = false;
  skyScene.add(skyMesh);
  const skyRT = new THREE.WebGLCubeRenderTarget(SKY_SIZE, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  const skyCamera = new THREE.CubeCamera(0.1, 10, skyRT);
  skyScene.add(skyCamera);

  const generateTextures = () => {
    drawQuad(diskMaterial, diskRT);
    skyCamera.update(renderer, skyScene);
    renderer.setRenderTarget(null);
    traceUniforms.uDiskTex.value = diskRT.texture;
    traceUniforms.uSky.value = skyRT.texture;
  };

  /* ------------------------------------------------------------- sizing */

  let cssW = 0;
  let cssH = 0;
  let bufW = 0;
  let bufH = 0;
  let renderScale = light ? 0.55 : 0.80;
  if (reduced) renderScale = 1;
  let adaptiveScale = 1;
  let allocW = 0;
  let allocH = 0;

  const disposeTargets = () => {
    for (const rt of [rtTrace, rtAccA, rtAccB, rtBright, rtBlurA, rtBlurB, rtWideA, rtWideB, rtStreak]) rt?.dispose();
    rtTrace = rtAccA = rtAccB = rtBright = rtBlurA = rtBlurB = rtWideA = rtWideB = rtStreak = null;
  };

  const allocate = (force = false) => {
    const tw = Math.max(8, Math.round(bufW * renderScale * adaptiveScale));
    const th = Math.max(8, Math.round(bufH * renderScale * adaptiveScale));
    if (!force && rtTrace && tw === allocW && th === allocH) return;
    const hw = Math.max(4, Math.round(tw / 2));
    const hh = Math.max(4, Math.round(th / 2));
    const qw = Math.max(4, Math.round(tw / 4));
    const qh = Math.max(4, Math.round(th / 4));

    allocW = tw;
    allocH = th;
    disposeTargets();
    rtTrace = makeRT(tw, th);
    rtAccA = makeRT(tw, th);
    rtAccB = makeRT(tw, th);
    rtBright = makeRT(hw, hh);
    rtBlurA = makeRT(hw, hh);
    rtBlurB = makeRT(hw, hh);
    rtWideA = makeRT(qw, qh);
    rtWideB = makeRT(qw, qh);
    rtStreak = makeRT(hw, hh);

    blendMaterial.uniforms.uPrev.value = rtAccA.texture;
    blendMaterial.uniforms.uCur.value = rtTrace.texture;
    brightMaterial.uniforms.uTex.value = rtTrace.texture;
    blurMaterial.uniforms.uTex.value = rtBright.texture;
    streakMaterial.uniforms.uTex.value = rtBright.texture;
    compositeMaterial.uniforms.uScene.value = rtAccA.texture;
    compositeMaterial.uniforms.uBloomA.value = rtBlurA.texture;
    compositeMaterial.uniforms.uBloomB.value = rtWideB.texture;
    compositeMaterial.uniforms.uStreak.value = rtStreak.texture;

    traceUniforms.uAspect.value = tw / th;
    traceUniforms.uPixel.value.set(2 / tw, 2 / th);
    /* Half a pixel of radius: a star should be a point with maybe one pixel
       of light around it, and anything fatter turns the deep field into a
       bokeh test. */
    traceUniforms.uStarSigma.value = 0.55 * ((2 * traceUniforms.uTanHalfFov.value) / th);
    compositeMaterial.uniforms.uRes.value.set(bufW, bufH);
  };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === cssW && h === cssH) return;

    cssW = w;
    cssH = h;
    const raw = w * dpr;
    const rawH = h * dpr;
    const budget = Math.min(1, Math.sqrt(PIXEL_BUDGET / (raw * rawH)));
    bufW = Math.max(64, Math.round(raw * budget));
    bufH = Math.max(64, Math.round(rawH * budget));

    renderer.setSize(bufW, bufH, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    allocate(true);
  };

  /* ---------------------------------------------------------- the look */

  const param = hdr ? 1 : 0.6;
  compositeMaterial.uniforms.uBloom.value = param * 0.15;
  compositeMaterial.uniforms.uExposure.value = hdr ? 1.0 : 1.2;

  /* Blur offsets are *fractions of the frame*, not texel counts. A texel
     count would mean a wider glow whenever the adaptive resolution drops —
     the picture would change character as the machine got busy, which is
     exactly the kind of thing that makes a render feel broken. Passing a
     fraction keeps the halo the same size on screen at every resolution. */
  const frameAspect = () => (bufH > 0 ? bufW / bufH : 1.8);

  const runLook = () => {
    if (!rtTrace || !rtAccA || !rtAccB || !rtBright || !rtBlurA || !rtBlurB || !rtWideA || !rtWideB || !rtStreak) return;
    const aspect = frameAspect();

    // bright pass
    drawQuad(brightMaterial, rtBright);

    // bloom, level one: half resolution, two separable sweeps
    const near = 0.0019;
    blurMaterial.uniforms.uTex.value = rtBright.texture;
    blurMaterial.uniforms.uDir.value.set(near, 0);
    drawQuad(blurMaterial, rtBlurA);
    blurMaterial.uniforms.uTex.value = rtBlurA.texture;
    blurMaterial.uniforms.uDir.value.set(0, near * aspect);
    drawQuad(blurMaterial, rtBlurB);

    // bloom, level two: a quarter-res sweep of level one, for the wide halo
    const wide = 0.0072;
    blurMaterial.uniforms.uTex.value = rtBlurB.texture;
    blurMaterial.uniforms.uDir.value.set(wide, 0);
    drawQuad(blurMaterial, rtWideA);
    blurMaterial.uniforms.uTex.value = rtWideA.texture;
    blurMaterial.uniforms.uDir.value.set(0, wide * aspect);
    drawQuad(blurMaterial, rtWideB);

    // anamorphic streak, from the bright pass
    streakMaterial.uniforms.uTex.value = rtBright.texture;
    streakMaterial.uniforms.uStep.value.set(0.0032, 0);
    drawQuad(streakMaterial, rtStreak);

    // composite
    compositeMaterial.uniforms.uScene.value = rtAccA.texture;
    compositeMaterial.uniforms.uBloomA.value = rtBlurB.texture;
    compositeMaterial.uniforms.uBloomB.value = rtWideB.texture;
    compositeMaterial.uniforms.uStreak.value = rtStreak.texture;
    compositeMaterial.uniforms.uRes.value.set(bufW, bufH);
    drawQuad(compositeMaterial, null);
  };

  /* --------------------------------------------------------- interaction */

  const pointers = new Map<number, { x: number; y: number }>();
  let hovering = false;
  let pinchStart = 0;
  let pinchDist = 0;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cam.dragging = true;
    cam.idle = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchDist = cam.distT;
    }
    canvas.setPointerCapture?.(e.pointerId);
    canvas.dataset.bhDrag = "1";
    wake();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0 && d > 0) cam.distT = clamp((pinchDist * pinchStart) / d, DIST_MIN, DIST_MAX);
      cam.idle = 0;
      wake();
      return;
    }

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    cam.azT -= dx * 0.0062;
    cam.elT = clamp(cam.elT + dy * 0.0048, EL_MIN, EL_MAX);
    cam.azV = -dx * 0.00042;
    cam.elV = dy * 0.0003;
    cam.idle = 0;
    wake();
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      cam.dragging = false;
      delete canvas.dataset.bhDrag;
    }
    canvas.releasePointerCapture?.(e.pointerId);
    cam.idle = 0;
    wake();
  };

  const onWheel = (e: WheelEvent) => {
    const before = cam.distT;
    cam.distT = clamp(cam.distT * Math.exp(e.deltaY * 0.0014), DIST_MIN, DIST_MAX);
    cam.idle = 0;
    // Scroll chaining: at the near and far limits the wheel is handed back to
    // the page, so the plate can zoom without ever trapping the scroll.
    if (cam.distT !== before) e.preventDefault();
    wake();
  };

  /* The camera rests while the pointer is on the plate.
     Pointing at something is the human signal for "I am looking at this now",
     and it is the only moment the renderer is allowed to stop and let its
     samples accumulate: sub-pixel jitter averaged over eight frames is a
     genuinely antialiased shadow edge and a genuinely sharp star. While the
     plate drifts unattended, the same average would smear every star into a
     dash, so it doesn't run. */
  const onPointerEnter = () => {
    hovering = true;
    cam.idle = 0;
  };
  const onPointerLeave = () => {
    hovering = false;
    cam.idle = 0;
  };

  const onDoubleClick = () => {
    cam.azT = AZ_OPEN;
    cam.elT = EL_OPEN;
    cam.distT = DIST_OPEN;
    cam.azV = 0;
    cam.elV = 0;
    cam.idle = 0;
    wake();
  };

  canvas.addEventListener("pointerenter", onPointerEnter);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);

  const onKeyDown = (e: KeyboardEvent) => {
    if (document.activeElement !== canvas) return;
    const step = e.shiftKey ? 0.3 : 0.12;
    if (e.key === "ArrowLeft") cam.azT += step;
    else if (e.key === "ArrowRight") cam.azT -= step;
    else if (e.key === "ArrowUp") cam.elT = clamp(cam.elT + step * 0.5, EL_MIN, EL_MAX);
    else if (e.key === "ArrowDown") cam.elT = clamp(cam.elT - step * 0.5, EL_MIN, EL_MAX);
    else if (e.key === "+" || e.key === "=") cam.distT = clamp(cam.distT * 0.88, DIST_MIN, DIST_MAX);
    else if (e.key === "-" || e.key === "_") cam.distT = clamp(cam.distT / 0.88, DIST_MIN, DIST_MAX);
    else return;
    e.preventDefault();
    cam.idle = 0;
    wake();
  };
  canvas.addEventListener("keydown", onKeyDown);

  /* ------------------------------------------------------------- the loop */

  const resizeObserver = new ResizeObserver(() => {
    resize();
    wake();
  });
  resizeObserver.observe(host);

  let visible = true;
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
      else stop();
    },
    { threshold: 0.01 },
  );
  io.observe(canvas);

  const onVisibility = () => {
    if (document.visibilityState === "visible") wake();
    else stop();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const onContextLost = (e: Event) => {
    e.preventDefault();
    stop();
    opts.onError?.("WebGL context lost");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  let raf = 0;
  let running = false;
  let time = 0;
  let frame = 0;
  let still = 0;
  let pending = 3; // frames owed after reduced-motion / a resize
  let ready = false;
  let last = performance.now();
  let ema = 16;
  let skipCounter = 0;
  let tuneCounter = 0;
  let frameSkip = 0;
  let telemetryCounter = 0;
  let fade = 0;

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    running = false;
  }

  function wake() {
    if (reduced) pending = Math.max(pending, 3);
    if (running || !visible) return;
    if (document.visibilityState === "hidden") return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function tick() {
    raf = 0;
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    ema = ema * 0.9 + dt * 1000 * 0.1;
    time += dt;
    frame += 1;

    /* — camera: damped toward its target, then the hand-held micro-drift
         that keeps a still frame from looking frozen — */
    const k = 1 - Math.exp(-dt * 9);
    const prev = { az: cam.az, el: cam.el, dist: cam.dist };
    let drifting = false;
    cam.az += (cam.azT - cam.az) * k;
    cam.el += (cam.elT - cam.el) * k;
    cam.dist += (cam.distT - cam.dist) * k;

    if (!cam.dragging) {
      cam.idle += dt;
      // A slow idle orbit — about 0.24°/s. Fast enough to feel alive, slow
      // enough that the stars stay points instead of smearing into dashes.
      // It yields the moment the pointer arrives.
      drifting = !reduced && !hovering && cam.idle > 2.5;
      if (drifting) cam.azT += dt * 0.0042;
      if (Math.abs(cam.azV) > 1e-5) {
        cam.azT += cam.azV * dt * 60;
        cam.azV *= Math.exp(-dt * 2.6);
        if (cam.idle > 0.05) cam.azV *= Math.exp(-dt * 3.2);
      }
      if (Math.abs(cam.elV) > 1e-5) cam.elV *= Math.exp(-dt * 6);
    }

    const moved =
      Math.abs(cam.az - prev.az) + Math.abs(cam.el - prev.el) + Math.abs(cam.dist - prev.dist) * 0.02;

    /* — temporal average.
       Three regimes, and the distinction between the first two is the whole
       trick:
         · MOVING   a two-frame blend with no sub-pixel jitter. It kills most
                    of the shimmer on the shadow's edge without smearing the
                    star field, because half of one frame's motion is a tenth
                    of a pixel.
         · SETTLING a running average of up to eight jittered samples, each
                    landing somewhere different inside the pixel.
         · STILL    the converged average, redrawn a few times a second.
       A jittered average over a *moving* frame is exactly how a star field
       turns into a field of dashes, which is what the first regime exists to
       prevent. */
    const settling = moved > 2e-4;
    if (settling || cam.dragging) still = 0;
    else still += 1;
    const converging = !settling && !cam.dragging && !drifting && cam.idle > 0.35;
    let mix = 1;
    if (!reduced) mix = converging ? Math.max(1 / 8, 1 / still) : MR_MOVING;
    blendMaterial.uniforms.uMix.value = mix;
    compositeMaterial.uniforms.uLoading.value = fade;

    const el = cam.el + Math.sin(time * 0.11) * 0.0016;
    const az = cam.az + Math.sin(time * 0.073) * 0.0024;
    const ce = Math.cos(el);
    camera.position.set(cam.dist * ce * Math.cos(az), cam.dist * Math.sin(el), cam.dist * ce * Math.sin(az));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    (traceUniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
    (traceUniforms.uBasis.value as THREE.Matrix3).setFromMatrix4(camera.matrixWorld);
    traceUniforms.uTime.value = time;
    traceUniforms.uEscape.value = Math.max(34, cam.dist * 1.28);
    /* Pinned to the pixel centre while the frame is settling after motion —
       and only the pixel centre, because that is the frame the eye sees — and
       scattered two or three pixels wide while the average converges. Kicks
       of less than a pixel during motion are worse than none: they add
       flicker to a picture that is already telling you it is moving. */
    if (!reduced) {
      (traceUniforms.uJitter.value as THREE.Vector2).set(Math.random(), Math.random());
      traceUniforms.uJitterScale.value = converging ? 1.8 : 0.9;
    } else {
      (traceUniforms.uJitter.value as THREE.Vector2).set(0.5, 0.5);
      traceUniforms.uJitterScale.value = 1;
    }

    /* — resolution: a moving camera is allowed to render fewer pixels.
         Not under reduced motion: that mode paints a handful of frames and
         then stops, so there is nothing to buy by rendering them small — and
         everything to lose, because an upscaled frame is a blurry one. */
    tuneCounter += 1;
    if (tuneCounter > 22 && ready && !reduced) {
      tuneCounter = 0;
          const target = converging ? 1.0 : 0.72;
        adaptiveScale += (target - adaptiveScale) * 0.5;
        // A floor under the resolution: below it the trace stops looking like
        // a lens and starts looking like a JPEG, so no further shrinking.
        const floor = MIN_RENDER_SCALE / renderScale;
        adaptiveScale = Math.min(1, Math.max(reduced ? 0.001 : floor, adaptiveScale));
        if (ema > 26 && renderScale > 0.5 && !converging) renderScale *= 0.9;
        else if (ema < 12.5 && renderScale < 1 && still > 4) renderScale *= 1.09;
        // At the floor, buy smoothness with cadence rather than with pixels.
        if (ema > 30 && adaptiveScale <= (reduced ? 0 : floor) + 0.02 && frameSkip < 3) frameSkip += 1;
        else if (ema < 15 && frameSkip > 0) frameSkip -= 1;
        allocate();
    }

    // Cadence: on a machine that cannot hold the frame at the resolution
    // floor, render every other frame and keep the camera smooth anyway.
    if (skipCounter < frameSkip) {
      skipCounter += 1;
      raf = requestAnimationFrame(tick);
      return;
    }
    skipCounter = 0;

    if (rtTrace && rtAccA && rtAccB) {
      drawQuad(traceMaterial, rtTrace);
      drawQuad(blendMaterial, rtAccB);
      const swap = rtAccA;
      rtAccA = rtAccB;
      rtAccB = swap;
      blendMaterial.uniforms.uPrev.value = rtAccA.texture;
      runLook();
    }

    if (!ready) {
      ready = true;
      opts.onReady?.();
    }

    /* First light. Reduced motion has no time to spend on a fade — it paints
       three frames and stops — so there the curtain is simply up. */
    fade = reduced ? 1 : Math.min(1, fade + dt / 1.35);
    compositeMaterial.uniforms.uTime.value = time;

    telemetryCounter += 1;
    if (telemetryCounter >= 10 || frame === 1) {
      telemetryCounter = 0;
      opts.onTelemetry?.({
        inclination: 90 - (cam.el * 180) / Math.PI,
        distance: cam.dist,
        samples: mix >= 1 ? 1 : Math.round(1 / mix),
      });
    }

    if (reduced) {
      // No animation: paint the frames the change owed, then rest on the frame.
      pending -= 1;
      if (pending <= 0) {
        stop();
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------- boot */

  resize();
  try {
    generateTextures();
    wake();
  } catch (err) {
    opts.onError?.(err instanceof Error ? err.message : "renderer failed");
  }

  return {
    reset() {
      onDoubleClick();
    },
    dispose() {
      stop();
      resizeObserver.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerenter", onPointerEnter);
  canvas.removeEventListener("pointerleave", onPointerLeave);
  canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      disposeTargets();
      diskRT.dispose();
      skyRT.dispose();
      skyGeo.dispose();
      quadGeo.dispose();
      traceMaterial.dispose();
      blendMaterial.dispose();
      brightMaterial.dispose();
      blurMaterial.dispose();
      streakMaterial.dispose();
      compositeMaterial.dispose();
      diskMaterial.dispose();
      skyMaterial.dispose();
      quadMesh.material.dispose();
      renderer.dispose();
      /* Hand the GL context back rather than leaving it to the collector.
         A dev server that remounts this component (StrictMode, HMR) would
         otherwise walk into the browser's context limit and the plate would
         come back dead. */
      try {
        renderer.forceContextLoss();
      } catch {
        /* already gone */
      }
    },
  };
}
