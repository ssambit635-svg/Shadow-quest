/**
 * Sigil.tsx — the site's mark, rebuilt as geometry instead of a sketch.
 *
 * A thin ring (the field), a vermilion blade cut, and a single tick for the
 * ford. No faces, no hats, no strokes pretending to be a person. Every path
 * keeps the `.mark__stroke` class so the existing DrawSVG choreography
 * (hero inking, outro draw, lobby assemble) keeps working untouched.
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
        viewBox="0 0 120 120"
        width={size}
        height={size}
        fill="none"
        style={style}
        aria-hidden="true"
      >
        {/* the field: a broken ring, open at the ford */}
        <path
          className="mark__stroke"
          d="M60 12 A48 48 0 1 1 26 26"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinecap="square"
        />
        {/* the cut: one vermilion diagonal through the ring */}
        <path
          className="mark__stroke"
          d="M28 88 L92 30"
          stroke="var(--vermilion)"
          strokeWidth={4}
          strokeLinecap="square"
        />
        {/* the ford tick */}
        <path
          className="mark__stroke"
          d="M60 96 L60 108 M52 102 L68 102"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="square"
        />
      </svg>
    );
  },
);

Sigil.displayName = "Sigil";
