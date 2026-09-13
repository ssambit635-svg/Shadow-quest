/**
 * release.ts — where the Android APK lives, and how the app finds it.
 *
 * The APK is built by `.github/workflows/android.yml` and attached to a
 * GitHub Release, so "download the app" is never a hardcoded blob URL that
 * rots: we ask the Releases API for the newest release and pick its `.apk`
 * asset. No asset yet → we hand over the Releases page itself, which is
 * where a human can read the build notes and trigger a run.
 */

/** `owner/repo`. Override at build time with VITE_GITHUB_REPO. */
export const REPO: string =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined) ?? "ssambit635-svg/Shadow-quest";

export const RELEASES_URL = `https://github.com/${REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ApkRef {
  /** Direct download URL for the asset (redirects through S3). */
  url: string;
  /** Release tag, e.g. `v1.1.0`. */
  tag: string;
  /** Human title of the release. */
  title: string;
  /** Bytes, for a "12.4 MB" hint. */
  size: number;
}

interface GhAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}
interface GhRelease {
  tag_name?: string;
  name?: string;
  assets?: GhAsset[];
}

/**
 * Resolve the newest published APK, or null when there is none (no release
 * yet, rate-limited, offline — all of which mean "show the releases page").
 */
export async function latestApk(): Promise<ApkRef | null> {
  try {
    const res = await fetch(LATEST_API, {
      headers: { accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const rel = (await res.json()) as GhRelease;
    const asset = (rel.assets ?? []).find(
      (a) => typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk"),
    );
    if (!asset?.browser_download_url) return null;
    return {
      url: asset.browser_download_url,
      tag: rel.tag_name ?? "latest",
      title: rel.name || rel.tag_name || "latest",
      size: asset.size ?? 0,
    };
  } catch {
    return null;
  }
}

export function humanBytes(n: number): string {
  if (!n) return "";
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
