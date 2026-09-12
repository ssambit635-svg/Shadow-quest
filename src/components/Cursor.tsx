import type { RefObject } from "react";

/**
 * Cursor.tsx — blade tip: a vermilion point that tracks exactly, and a ring
 * that lags. The lag is the whole idea; the ring's easing IS the site's
 * physics. Swaps to a diamond over anything actionable (see base.css).
 */
export function Cursor({
  ringRef,
  dotRef,
}: {
  ringRef: RefObject<HTMLDivElement | null>;
  dotRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="cursor" aria-hidden="true">
      <div className="cursor__ring" ref={ringRef} />
      <div className="cursor__dot" ref={dotRef} />
    </div>
  );
}
