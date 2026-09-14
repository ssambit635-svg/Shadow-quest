/**
 * Sigil.tsx — the ShadowQuest mark.
 *
 * This is the app logo: a vermilion sun over a single brush hill, with a
 * quiet ground line under it. The same geometry ships as `public/icons/icon.svg`
 * (PWA, APK, GitHub README). Here the black field is omitted so the mark
 * sits on whatever ground it is placed — nav, boot curtain, login, phone bar.
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
        {/* the sun */}
        <circle cx="272" cy="216" r="104" fill="var(--vermilion, #c1362b)" />
        {/* the hill — one loaded brush stroke */}
        <path
          className="mark__stroke"
          d="M96 352c64-72 160-104 240-88 48 8 72 32 80 64"
          stroke="currentColor"
          strokeWidth={27}
          strokeLinecap="round"
        />
        {/* the ground line */}
        <path
          className="mark__stroke"
          d="M144 416h240"
          stroke="currentColor"
          strokeWidth={18}
          strokeLinecap="round"
          opacity={0.55}
        />
      </svg>
    );
  },
);

Sigil.displayName = "Sigil";
