/**
 * native.ts — are we inside the Capacitor Android (or iOS) shell?
 *
 * The hosted site never sets `window.Capacitor`. The APK's WebView bridge
 * injects it before the bundle runs. Keep the check tiny and side-effect
 * free so CSS, GSAP and the boot curtain can all ask the same question.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (!cap) return false;
  try {
    return typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : true;
  } catch {
    return true;
  }
}
