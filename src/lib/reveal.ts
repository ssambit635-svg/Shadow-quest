/**
 * reveal.ts — the scroll vocabulary, in one place.
 *
 * Sections declare intent with a `data-rv` attribute and this hook turns it
 * into a ScrollTrigger. The reason it's centralised: five different reveal
 * styles on one site reads as indecision, so everything is forced through the
 * same four verbs (rise / wipe / draw / brush / bleed) and the same two curves.
 *
 * Usage:
 *   <p data-rv="rise">                      → single element
 *   <article data-rv="rise" data-rv-group="cards"> → siblings sweep in order
 */
import { useEffect, type RefObject } from "react";
import { brushReveal, gsap, REDUCED, ScrollTrigger, splitTo } from "./motion";

export type RevealKind = "rise" | "wipe" | "draw" | "brush" | "bleed";

/**
 * `bleed` = an image arriving the way ink arrives on wet paper: the mask opens
 * downward while the picture settles out of a slight overscale.
 */
function build(el: HTMLElement): gsap.core.Tween | gsap.core.Timeline {
  const kind = (el.dataset.rv as RevealKind) || "rise";

  switch (kind) {
    case "wipe":
      return gsap.fromTo(
        el,
        { clipPath: "inset(0 100% 0 0)" },
        { clipPath: "inset(0 0% 0 0)", duration: 1.05, ease: "snap" },
      );

    case "draw": {
      const paths =
        el.querySelectorAll<SVGPathElement>("[data-draw]").length > 0
          ? el.querySelectorAll("[data-draw]")
          : el.querySelectorAll("path, line, circle");
      return gsap.fromTo(
        paths,
        { drawSVG: "0% 0%" },
        { drawSVG: "100% 0%", duration: 1.5, stagger: 0.07, ease: "steel" },
      );
    }

    case "brush": {
      // Text is split once per mount and reverted on unmount, below.
      const split = splitTo(el);
      splits.push(split);
      return brushReveal(split, { duration: 1.05, stagger: 0.026 });
    }

    case "bleed":
      return gsap.fromTo(
        el,
        { clipPath: "inset(0 0 100% 0)", scale: 1.14 },
        {
          clipPath: "inset(0 0 0% 0)",
          scale: 1,
          duration: 1.6,
          ease: "brush",
        },
      );

    case "rise":
    default:
      return gsap.fromTo(
        el,
        { yPercent: 106 },
        { yPercent: 0, duration: 1.1, ease: "brush" },
      );
  }
}

/** SplitText instances created during this pass, reverted on cleanup. */
let splits: ReturnType<typeof splitTo>[] = [];

export function useReveals(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    splits = [];

    const ctx = gsap.context(() => {
      const items = gsap
        .utils.toArray<HTMLElement>("[data-rv]")
        .filter((el) => root.contains(el));

      if (REDUCED) {
        // Inline opacity wins over the `[data-rv] { opacity: 0 }` guard in
        // base.css; clearing it here is what makes reduced-motion content.
        gsap.set(items, { opacity: 1, clearProps: "transform,clipPath" });
        return;
      }

      gsap.set(items, { autoAlpha: 0 });

      const singles: HTMLElement[] = [];
      const groups = new Map<string, HTMLElement[]>();
      items.forEach((el) => {
        const g = el.dataset.rvGroup;
        if (g) groups.set(g, [...(groups.get(g) ?? []), el]);
        else singles.push(el);
      });

      const wire = (els: HTMLElement[], trigger: HTMLElement, offset = 0) => {
        const tweens = els.map((el) => build(el).pause());
        ScrollTrigger.create({
          trigger,
          start: `top ${84 - offset}%`,
          once: true,
          onEnter: () => {
            gsap.set(els, { autoAlpha: 1 });
            tweens.forEach((t, i) => t.delay(i * 0.085).play());
          },
        });
      };

      singles.forEach((el) => wire([el], el));
      groups.forEach((els) => wire(els, els[0]));
    }, root);

    return () => {
      ctx.revert();
      splits.forEach((s) => s?.revert());
      splits = [];
    };
  }, deps);
}
