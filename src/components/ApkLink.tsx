/**
 * ApkLink.tsx — the "get the Android app" control.
 *
 * One button, three honest states:
 *   · idle     → "Download APK"
 *   · looking  → asks the Releases API for the newest `.apk` asset
 *   · found    → navigates straight at the asset's download URL
 *   · none yet → navigates to the Releases page instead, where the build
 *                notes live and a run can be triggered
 *
 * It never pretends: if there is no published APK the button says so and
 * takes you to the page where one gets made, rather than dead-ending.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { humanBytes, latestApk, RELEASES_URL, type ApkRef } from "../lib/release";

type State = "idle" | "looking" | "ready" | "none";

export function ApkLink({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("idle");
  const [apk, setApk] = useState<ApkRef | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Warm the answer in the background so the click is instant when a build
  // exists; a slow or absent API simply leaves us in `idle`.
  useEffect(() => {
    let cancelled = false;
    latestApk().then((ref) => {
      if (cancelled || !alive.current) return;
      if (ref) {
        setApk(ref);
        setState("ready");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = useCallback(async () => {
    if (state === "looking") return;
    if (state === "ready" && apk) {
      window.location.assign(apk.url);
      return;
    }
    setState("looking");
    const ref = await latestApk();
    if (!alive.current) return;
    if (ref) {
      setApk(ref);
      setState("ready");
      window.location.assign(ref.url);
    } else {
      setState("none");
      window.location.assign(RELEASES_URL);
    }
  }, [state, apk]);

  const label =
    state === "looking"
      ? "locating build…"
      : state === "ready" && apk
        ? `Download APK · ${apk.tag}${humanBytes(apk.size) ? ` · ${humanBytes(apk.size)}` : ""}`
        : state === "none"
          ? "Open Releases page"
          : "Download APK";

  return (
    <button
      type="button"
      className={`btn btn--apk ${compact ? "btn--apk-compact" : ""}`}
      onClick={() => void onClick()}
      data-state={state}
      title="the Android build, from the GitHub Releases page"
    >
      <span className="btn__slash" aria-hidden="true" />
      <span className="btn__apk-label">{label}</span>
      <span className="btn__apk-mark" lang="ja" aria-hidden="true">
        携
      </span>
    </button>
  );
}
