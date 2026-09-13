/**
 * motion.ts — the single source of truth for how this site moves.
 *
 * Rules that keep the animation "mature" instead of generic-AI:
 *  · One idea per screen, expressed once, with weight (slow-out, hard-in).
 *  · No floaty infinite loops on everything. Loops are reserved for ink
 *    that is genuinely alive: breath, drifting brush mist, a cursor lag.
 *  · Everything that enters uses the same brush vocabulary: draw, wipe,
 *    rise. Nothing scales-and-fades in like a SaaS hero.
 *  · prefers-reduced-motion is honoured at the registration layer, so a
 *    component cannot accidentally opt out of it.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { CustomEase } from "gsap/CustomEase";

export const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let registered = false;

export function initMotion() {
  if (registered || typeof window === "undefined") return;
  registered = true;

  gsap.registerPlugin(
    ScrollTrigger,
    DrawSVGPlugin,
    SplitText,
    ScrambleTextPlugin,
    CustomEase,
  );

  // Named curves — used everywhere so the site has ONE motion signature.
  CustomEase.create("brush", "M0,0 C0.16,0.84 0.24,1 1,1");
  CustomEase.create("snap", "M0,0 C0.2,0.9 0.05,1 1,1");
  CustomEase.create("steel", "M0,0 C0.65,0 0.35,1 1,1");
  CustomEase.create("breath", "M0,0 C0.4,0 0.2,1 0.6,1 0.8,1 1,0.6 1,1");
  // Slash: held breath, then the cut. For shines, sweeps, and anything that
  // should arrive like a blade rather than a brush.
  CustomEase.create("slash", "M0,0 C0.8,0 0.15,1 1,1");

  gsap.defaults({ ease: "brush", duration: 1 });
  if (REDUCED) gsap.globalTimeline.timeScale(100);

  // The scroll-velocity lean listens from the first frame.
  initVelocity();
  // And the click answer: one ink ring, no following.
  initInkRipple();
}

/**
 * Split a headline into lines/chars the way this site wants it: chars ride
 * inside line masks so nothing can escape the text block. Returns the SplitText
 * instance so the caller can revert it on unmount.
 */
export function splitTo(el: HTMLElement | null) {
  if (!el) return null;
  return new SplitText(el, {
    type: "lines,chars",
    // spans, not divs — the line masks are inline elements in the markup
    spanLines: true,
    linesClass: "st-line",
    charsClass: "st-char",
    reduceWhiteSpace: false,
    aria: "hidden",
  });
}

/**
 * Reveal a block of text char-by-char with a brush "flick" — each glyph
 * arrives from below on the shared curve, stagger tight enough to read as a
 * single stroke rather than a typewriter.
 */
export function brushReveal(
  split: SplitText | null,
  opts: { delay?: number; duration?: number; stagger?: number } = {},
) {
  const chars = split?.chars ?? [];
  if (!chars.length) return gsap.timeline();
  // Each glyph arrives from below with a whisper of rotation and settles
  // level — the line lands as one loaded stroke, not a typewriter.
  gsap.set(chars, { yPercent: 118, opacity: 1, rotate: 2 });
  return gsap.to(chars, {
    yPercent: 0,
    rotate: 0,
    duration: opts.duration ?? 1.05,
    ease: "brush",
    delay: opts.delay ?? 0,
    stagger: { each: opts.stagger ?? 0.022, from: "start" },
  });
}

/**
 * Draw an SVG path as if a loaded brush is pulling ink through it.
 * `reversed: true` un-draws — used for exits so strokes retract.
 */
export function drawIn(
  targets: gsap.TweenTarget,
  opts: {
    delay?: number;
    duration?: number;
    reversed?: boolean;
    onUpdate?: () => void;
  } = {},
) {
  return gsap.fromTo(
    targets,
    { drawSVG: opts.reversed ? "100% 100%" : "0% 0%" },
    {
      drawSVG: opts.reversed ? "0% 0%" : "100% 0%",
      duration: opts.duration ?? 1.6,
      ease: "steel",
      delay: opts.delay ?? 0,
      onUpdate: opts.onUpdate,
    },
  );
}

/**
 * Wipe a hard edge across an element (paper tear / sword pass). Deliberately
 * linear-on-start, brutal-on-end: no spring, no bounce.
 */
export function wipeIn(el: gsap.TweenTarget, opts: { delay?: number; duration?: number } = {}) {
  return gsap.fromTo(
    el,
    { clipPath: "inset(0 100% 0 0)" },
    {
      clipPath: "inset(0 0% 0 0)",
      duration: opts.duration ?? 1.1,
      ease: "snap",
      delay: opts.delay ?? 0,
    },
  );
}

/**
 * Decoded-telegraph feel for data readouts (turn counts, room codes).
 * Restrained glyph set so it reads as instrumentation, not a hacker GIF.
 */
export function scrambleTo(
  el: gsap.TweenTarget,
  text: string,
  opts: { duration?: number } = {},
) {
  return gsap.to(el, {
    duration: opts.duration ?? 0.7,
    scrambleText: {
      text,
      chars: "upperCase",
      newClass: "scram",
      speed: 0.28,
    },
    ease: "none",
    // A second decode of the same readout (stage swaps) must take over,
    // not fight the first for the text node.
    overwrite: "auto",
  });
}

/**
 * Scroll-velocity lean. One damped value, one rAF, transform-only.
 *
 * Elements tagged `data-vel` shear into a fast scroll and settle back — the
 * page leans the way a runner does, then straightens. It only runs while
 * velocity is above a hair's breadth, so at rest it costs nothing. Because
 * it writes `x`/`skewY` through GSAP's own transform store, it composes with
 * every reveal and tilt on the same element without fighting them.
 */
let velAttached = false;
const velState = { v: 0, last: 0 };
const velTargets = new Set<HTMLElement>();
let velRaf = 0;

/**
 * Collect `data-vel` elements into the shared lean set. Self-cleaning: on a
 * route swap the new page's root is registered and every node that is no
 * longer inside it is dropped, so detached targets never linger.
 */
export function registerVelTargets(root: ParentNode | null) {
  if (!root) return;
  velTargets.forEach((el) => {
    if (!root.contains(el)) velTargets.delete(el);
  });
  gsap.utils.toArray<HTMLElement>("[data-vel]", root).forEach((el) => {
    velTargets.add(el);
  });
  if (velAttached) nudgeVelocity();
}

/** Kick the loop back to life after targets are added late. */
function nudgeVelocity() {
  if (velRaf) return;
  velRaf = requestAnimationFrame(velTick);
}

function velTick() {
  velRaf = 0;
  const y = window.scrollY;
  const dy = y - velState.last;
  velState.last = y;
  velState.v = velState.v * 0.86 + dy * 0.14;

  if (Math.abs(velState.v) < 0.08) {
    // Settled: straighten once and stop the loop.
    if (velTargets.size) gsap.set(Array.from(velTargets), { x: 0, skewY: 0 });
    return;
  }
  const shear = gsap.utils.clamp(-4.5, 4.5, velState.v * -0.055);
  const drift = gsap.utils.clamp(-12, 12, velState.v * -0.2);
  gsap.set(Array.from(velTargets), { skewY: shear, x: drift });
  velRaf = requestAnimationFrame(velTick);
}

export function initVelocity() {
  if (velAttached || typeof window === "undefined" || REDUCED) return;
  velAttached = true;
  velState.last = window.scrollY;
  window.addEventListener("scroll", nudgeVelocity, { passive: true });
}

/**
 * Ink ripple — the site's click answer. A single vermilion ring blooms once
 * at the pointer and is gone; nothing follows the cursor around (that was
 * the ring the user asked to kill). One node at a time, pooled and recycled,
 * transform + opacity only.
 */
let rippleAttached = false;
let rippleNode: HTMLDivElement | null = null;
let rippleBusy = false;

export function initInkRipple() {
  if (rippleAttached || typeof window === "undefined" || REDUCED) return;
  rippleAttached = true;

  const make = () => {
    const el = document.createElement("div");
    el.className = "ink-ripple";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  };

  const onDown = (e: PointerEvent) => {
    // Only react to real, deliberate clicks on the page surface — not
    // presses held on a control that will fire its own feedback.
    if (e.button !== 0) return;
    if (rippleBusy) return;
    rippleBusy = true;

    if (!rippleNode) rippleNode = make();
    const el = rippleNode;
    const x = e.clientX;
    const y = e.clientY;

    gsap.killTweensOf(el);
    gsap.set(el, {
      left: x,
      top: y,
      xPercent: -50,
      yPercent: -50,
      scale: 0.2,
      autoAlpha: 0.85,
      width: 64,
      height: 64,
      rotate: 0,
    });

    gsap.to(el, {
      scale: 1.7,
      autoAlpha: 0,
      duration: 0.62,
      ease: "power2.out",
      onComplete: () => (rippleBusy = false),
    });
  };

  window.addEventListener("pointerdown", onDown, { passive: true });
}

/**
 * Magnetic pull: an element leans toward the pointer while it is near, then
 * settles home. One listener per element, transforms only — layout never
 * moves, so it stays cheap at 60fps.
 */
export function magnetic(el: HTMLElement, strength = 0.28, radius = 140) {
  if (REDUCED) return () => undefined;
  const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "brush" });
  const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "brush" });
  const onMove = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > radius + Math.max(r.width, r.height) / 2) {
      xTo(0);
      yTo(0);
      return;
    }
    xTo(dx * strength);
    yTo(dy * strength);
  };
  const onLeave = () => {
    xTo(0);
    yTo(0);
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  el.addEventListener("pointerleave", onLeave, { passive: true });
  return () => {
    window.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerleave", onLeave);
    gsap.set(el, { x: 0, y: 0 });
  };
}

/**
 * Pointer wash: a soft light follows the cursor across a plate (paper,
 * painting, dark field). Writes two CSS vars (`--wx/--wy`) on one lerp'd
 * tween; the visible wash is pure CSS, so nothing renders until hover.
 */
export function attachWash(el: HTMLElement) {
  if (REDUCED) return () => undefined;
  const xTo = gsap.quickTo(el, "--wx", { duration: 0.45, ease: "brush" });
  const yTo = gsap.quickTo(el, "--wy", { duration: 0.45, ease: "brush" });
  const onMove = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    xTo(((e.clientX - r.left) / r.width) * 100);
    yTo(((e.clientY - r.top) / r.height) * 100);
  };
  el.addEventListener("pointermove", onMove, { passive: true });
  return () => el.removeEventListener("pointermove", onMove);
}

/**
 * 3D tilt for cards: pointer position maps to rotation, the portrait inside
 * counter-translates for depth, and a `--mx/--my` spotlight follows. All
 * writes are transforms + CSS vars — no layout thrash.
 */
export function tiltCard(card: HTMLElement, max = 7) {
  if (REDUCED) return () => undefined;
  const inner = card.querySelector<HTMLElement>("[data-tilt-inner]");
  const rX = gsap.quickTo(card, "rotationX", { duration: 0.6, ease: "brush" });
  const rY = gsap.quickTo(card, "rotationY", { duration: 0.6, ease: "brush" });
  const onMove = (e: PointerEvent) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    rX((0.5 - py) * max * 2);
    rY((px - 0.5) * max * 2);
    card.style.setProperty("--mx", `${Math.round(px * 100)}%`);
    card.style.setProperty("--my", `${Math.round(py * 100)}%`);
    if (inner) gsap.to(inner, { x: (px - 0.5) * -14, y: (py - 0.5) * -10, duration: 0.6, ease: "brush", overwrite: "auto" });
  };
  const onLeave = () => {
    rX(0);
    rY(0);
    if (inner) gsap.to(inner, { x: 0, y: 0, duration: 0.9, ease: "brush", overwrite: "auto" });
  };
  card.addEventListener("pointermove", onMove, { passive: true });
  card.addEventListener("pointerleave", onLeave, { passive: true });
  return () => {
    card.removeEventListener("pointermove", onMove);
    card.removeEventListener("pointerleave", onLeave);
  };
}

/**
 * Hit-stop for combat feedback: the whole page freezes for a beat, then
 * resumes. Cheapest possible way to make impact feel physical.
 */
export function hitStop(frames = 3) {
  if (REDUCED) return;
  gsap.globalTimeline.pause();
  window.setTimeout(() => gsap.globalTimeline.resume(), frames * 16.7);
}

/** Screen shake that respects reduced motion and never leaves drift behind. */
export function shake(el: gsap.TweenTarget, intensity = 1) {
  if (REDUCED) return;
  return gsap
    .timeline({ onComplete: () => gsap.set(el, { x: 0, y: 0, rotate: 0 }) })
    .to(el, { x: 9 * intensity, y: -4 * intensity, rotate: 0.3 * intensity, duration: 0.05, ease: "none" })
    .to(el, { x: -7 * intensity, y: 5 * intensity, rotate: -0.25 * intensity, duration: 0.05, ease: "none" })
    .to(el, { x: 3 * intensity, y: -2 * intensity, duration: 0.04, ease: "none" })
    .to(el, { x: 0, y: 0, duration: 0.12, ease: "power2.out" });
}

export { gsap, ScrollTrigger, SplitText };
