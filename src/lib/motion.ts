/**
 * motion.ts — motion signature: Eurostile headings, ink bloom, no horizontal cursor trails.
 * Simplified per request: cursor is minimal dot, no magnetic, no tilt.
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

  CustomEase.create("brush", "M0,0 C0.16,0.84 0.24,1 1,1");
  CustomEase.create("snap", "M0,0 C0.2,0.9 0.05,1 1,1");
  CustomEase.create("steel", "M0,0 C0.65,0 0.35,1 1,1");
  CustomEase.create("breath", "M0,0 C0.4,0 0.2,1 0.6,1 0.8,1 1,0.6 1,1");
  CustomEase.create("slash", "M0,0 C0.8,0 0.15,1 1,1");
  CustomEase.create("ink", "M0,0 C0.13,0.82 0.17,1 1,1");

  gsap.defaults({ ease: "brush", duration: 1 });
  if (REDUCED) gsap.globalTimeline.timeScale(100);
}

export function splitTo(el: HTMLElement | null) {
  if (!el) return null;
  return new SplitText(el, {
    type: "lines,chars",
    spanLines: true,
    linesClass: "st-line",
    charsClass: "st-char",
    reduceWhiteSpace: false,
    aria: "hidden",
  });
}

export function brushReveal(
  split: SplitText | null,
  opts: { delay?: number; duration?: number; stagger?: number } = {},
) {
  const chars = split?.chars ?? [];
  if (!chars.length) return gsap.timeline();
  gsap.set(chars, { yPercent: 118, opacity: 1 });
  return gsap.to(chars, {
    yPercent: 0,
    duration: opts.duration ?? 1.05,
    ease: "brush",
    delay: opts.delay ?? 0,
    stagger: { each: opts.stagger ?? 0.022, from: "start" },
  });
}

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
  });
}

/**
 * Minimal cursor — exact follow, no lag, no horizontal trail.
 */
export function attachCursorRing(_ring: HTMLElement, dot: HTMLElement) {
  const xTo = gsap.quickTo(dot, "x", { duration: 0.12, ease: "power3.out" });
  const yTo = gsap.quickTo(dot, "y", { duration: 0.12, ease: "power3.out" });

  const onMove = (e: PointerEvent) => {
    xTo(e.clientX);
    yTo(e.clientY);
  };

  const set = (state: string) => () => {
    document.body.dataset.cursor = state;
  };
  const down = set("press");
  const up = set("idle");
  const over = (e: PointerEvent) => {
    const interactive = (e.target as HTMLElement)?.closest("a,button,input,textarea,[role='button']");
    document.body.dataset.cursor = interactive ? "hot" : "idle";
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", down, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
  window.addEventListener("pointerover", over, { passive: true });

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", down);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointerover", over);
  };
}

/**
 * Disabled per request — no horizontal magnetic pull.
 */
export function magnetic(_el: HTMLElement, _strength = 0.28, _radius = 140) {
  return () => undefined;
}

/**
 * Disabled per request — no horizontal tilt.
 */
export function tiltCard(_card: HTMLElement, _max = 7) {
  return () => undefined;
}

export function hitStop(frames = 3) {
  if (REDUCED) return;
  gsap.globalTimeline.pause();
  window.setTimeout(() => gsap.globalTimeline.resume(), frames * 16.7);
}

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
