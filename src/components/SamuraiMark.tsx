/**
 * SamuraiMark.tsx — the site's signature: a ronin reduced to brush strokes.
 *
 * Everything here is a stroke, never a fill, so the mark can be literally
 * *inked* by DrawSVG as you scroll or as a screen enters. The feTurbulence
 * displacement gives the lines a wet, bleeding edge — that single filter is
 * what stops it reading like vector clip-art.
 */
import { forwardRef, useId } from "react";

export interface MarkProps {
  className?: string;
  /** Scales the drawn area without touching stroke weight (true brush feel). */
  size?: number | string;
  /** Render strokes fully instead of un-inked; motion code flips this. */
  inked?: boolean;
  /** Adds the vermilion blade line. */
  blade?: boolean;
  style?: React.CSSProperties;
}

/**
 * Coordinates live in a 240×300 box. Kept hand-authored (not exported from a
 * design tool) so every point is reviewable in the diff and the strokes can be
 * re-timed without touching a binary asset.
 */
const STROKES = [
  // straw hat: crown, then the underside shadow line
  "M46 96 C 78 44, 162 44, 194 96",
  "M56 98 C 86 74, 154 74, 184 98",
  // head and jaw, one breath
  "M120 96 L118 128",
  // shoulder yoke
  "M64 136 C 96 120, 144 120, 176 136",
  // left sleeve falling, right arm extended to the blade
  "M66 138 C 52 172, 50 200, 58 226",
  "M174 138 C 190 152, 200 158, 212 152",
  // obi / sash
  "M70 196 C 104 186, 138 186, 170 196",
  // hakama, two falls of cloth
  "M70 200 C 58 240, 52 264, 44 288",
  "M170 200 C 182 240, 188 264, 196 288",
  // the cloth between them, weighted at the hem
  "M96 202 C 92 244, 88 266, 84 288",
  "M144 202 C 150 244, 156 266, 162 288",
  "M52 286 C 100 274, 148 274, 190 286",
  // scabbard at the hip
  "M64 202 C 44 210, 30 216, 16 222",
];

export const SamuraiMark = forwardRef<SVGSVGElement, MarkProps>(
  ({ className, size = "100%", inked = true, blade = true, style }, ref) => {
    const uid = useId().replace(/[:]/g, "");
    const bleed = `bleed-${uid}`;
    return (
      <svg
        ref={ref}
        className={className}
        viewBox="0 0 240 300"
        width={size}
        fill="none"
        style={style}
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id={bleed} x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.035"
              numOctaves={2}
              seed={7}
              result="n"
            />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        <g
          className="mark__ink"
          stroke="currentColor"
          strokeWidth={5.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${bleed})`}
          opacity={inked ? 1 : 0.0001}
        >
          {STROKES.map((d, i) => (
            <path
              key={d}
              className="mark__stroke"
              data-i={i}
              d={d}
              // Tapering weight across the body is what makes it read as a
              // loaded brush rather than a uniform outline.
              strokeWidth={i === 0 || i === 3 ? 7 : i > 6 ? 4.5 : 5.5}
            />
          ))}
        </g>

        {blade && (
          <g
            className="mark__blade"
            strokeLinecap="round"
            filter={`url(#${bleed})`}
            // Same gate as .mark__ink: an un-inked mark shows nothing at all,
            // otherwise the blade line pops in before the figure is drawn.
            opacity={inked ? 1 : 0.0001}
          >
            {/* the cut itself: a thin, long, brighter line than any stroke */}
            <path
              className="mark__stroke"
              d="M214 150 C 226 138, 236 122, 244 104"
              stroke="var(--vermilion)"
              strokeWidth={2.6}
            />
            <path
              className="mark__stroke"
              d="M198 158 L216 144"
              stroke="currentColor"
              strokeWidth={3}
            />
          </g>
        )}
      </svg>
    );
  },
);

SamuraiMark.displayName = "SamuraiMark";
