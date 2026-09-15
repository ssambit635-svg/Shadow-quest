/**
 * Sigil.tsx — the ShadowQuest mark, "The Sheared Eclipse".
 *
 * A bone orbit around a vermilion sun, cut once and pulled apart along the
 * cut: the upper half stays, the lower half is the shadow — same geometry,
 * slipped, drawn in `currentColor` at a third of its weight with no colour of
 * its own. The sun is `--vermilion`, the only action colour tokens.css allows.
 *
 * Reading `currentColor` for everything but the sun is what makes one
 * component correct in the nav, on the boot curtain, on the login gate, in the
 * phone's bottom bar and on a paper section, with no theme prop to thread.
 *
 * THE GEOMETRY IS GENERATED. Do not hand-edit these numbers — change them in
 * `scripts/brand.mjs` and run `node scripts/brand.mjs`, which rewrites this
 * file along with public/brand/**, the favicon and the app tile.
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
        viewBox="0 0 512 512"
        width={size}
        height={size}
        fill="none"
        style={style}
        aria-hidden="true"
      >
        <g>
          <path className="mark__ring" d="M 83.7 300.07 A 180 180 0 0 1 421.46 177.13 L 389.45 188.79 A 146 146 0 0 0 115.71 288.42 Z" fill="currentColor" />
          <path className="mark__sun" d="M 127.01 284.31 A 134 134 0 0 1 378.15 192.9 Z" fill="var(--vermilion, #d43d31)" />
          <path className="mark__shadow" d="M 113.75 289.13 A 175.5 175.5 0 1 0 438.4 170.97 L 406.63 182.53 A 142.35 142.35 0 1 1 145.52 277.57 Z" fill="currentColor" fill-opacity=".3" />
          <path className="mark__shadow" d="M 156.81 273.46 A 130.65 130.65 0 1 0 395.34 186.64 Z" fill="currentColor" fill-opacity=".3" />
        </g>
      </svg>
    );
  },
);

Sigil.displayName = "Sigil";
