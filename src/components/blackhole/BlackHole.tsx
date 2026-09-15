/**
 * BlackHole.tsx — the plate on the right of the hero.
 *
 * A live render, not a picture: the canvas below is a WebGL2 fragment shader
 * integrating null geodesics of the Schwarzschild metric, with the accretion
 * disk crossed analytically and the sky lensed by the same equations that bend
 * the disk. Drag it and you move a camera around the singularity; scroll and
 * you fall in or pull back; leave it alone and it drifts, slowly, on its own.
 *
 * Three things this component is careful about:
 *
 *  · WEIGHT — `renderer.ts` (and three.js with it) is imported *after* the
 *    hero has painted, so the landing page's first frame is never waiting on
 *    a 3D engine. Everything below is either CSS or a fallback.
 *  · FAILURE — no WebGL2, a lost context, or a phone that refuses the frame:
 *    the plate shows a drawn singularity instead, and the hero is otherwise
 *    unchanged. The art must never be an empty box.
 *  · MOTION — prefers-reduced-motion gets the same image, rendered once, and
 *    repainted only when the reader asks for a different angle.
 */
import { useEffect, useRef, useState } from "react";
import { CAN_HOVER, REDUCED } from "../../lib/motion";
import type { BlackHoleHandle, BlackHoleTelemetry } from "./renderer";

type Status = "loading" | "live" | "failed";

/** WebGL2 is the floor. A throwaway context, so the real one is never spent. */
function supportsWebGL2(): boolean {
  try {
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (!ctx) return false;
    ctx.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function BlackHole() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const incRef = useRef<HTMLSpanElement>(null);
  const radRef = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!supportsWebGL2()) {
      setStatus("failed");
      return;
    }

    let handle: BlackHoleHandle | null = null;
    let dead = false;

    const boot = async () => {
      try {
        const { createBlackHole } = await import("./renderer");
        if (dead || !canvasRef.current) return;
        handle = createBlackHole({
          canvas,
          reduced: REDUCED,
          onReady: () => {
            if (!dead) setStatus("live");
          },
          onError: () => {
            if (!dead) setStatus("failed");
          },
          onTelemetry: (t: BlackHoleTelemetry) => {
            // Written straight to the DOM: telemetry ticks ten times a second
            // and has no business re-rendering the hero around it.
            if (incRef.current) incRef.current.textContent = t.inclination.toFixed(1);
            if (radRef.current) radRef.current.textContent = t.distance.toFixed(1);
          },
        });
      } catch {
        if (!dead) setStatus("failed");
      }
    };

    // One idle beat, so the hero's entrance timeline gets the main thread.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void boot(), { timeout: 1200 })
      : window.setTimeout(() => void boot(), 350);

    return () => {
      dead = true;
      if (window.cancelIdleCallback && typeof idle === "number") window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      handle?.dispose();
      handle = null;
    };
  }, []);

  return (
    <div className="bh" data-bh-state={status} ref={hostRef}>
      {/* The drawn singularity. Visible until the first rendered frame, and
          the whole picture if WebGL2 never arrives. */}
      <div className="bh__still" aria-hidden="true">
        <span className="bh__still-halo" />
        <span className="bh__still-disk" />
        <span className="bh__still-shadow" />
        <span className="bh__still-ring" />
      </div>

      <canvas
        className="bh__canvas"
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="Real-time render of a black hole: a lensed accretion disk and starfield orbiting a dark shadow. Drag to orbit, scroll or pinch to change distance, double-click to reset the view."
      />

      <div className="bh__hud" aria-hidden="true">
        <p className="bh__hud-title label">
          <span className="bh__hud-dot" />
          Sgr&nbsp;A*-class · geodesic render
        </p>
        <p className="bh__read">
          <span className="bh__read-k">Inclination</span>
          <span className="bh__read-v num">
            <span ref={incRef}>76.0</span>°
          </span>
        </p>
        <p className="bh__read">
          <span className="bh__read-k">Radius</span>
          <span className="bh__read-v num">
            <span ref={radRef}>26.0</span>&nbsp;r<sub>s</sub>
          </span>
        </p>
        <p className="bh__read">
          <span className="bh__read-k">Disk</span>
          <span className="bh__read-v num">3.0–13.5&nbsp;r<sub>s</sub></span>
        </p>
      </div>

      <p className="bh__hint label" aria-hidden="true">
        {CAN_HOVER ? "drag · orbit — scroll · zoom" : "drag · orbit — pinch · zoom"}
      </p>
    </div>
  );
}
