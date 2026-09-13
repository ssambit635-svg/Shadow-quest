/**
 * device.ts — the one place that decides whether the phone face is shown.
 *
 * The phone face is a *separate component tree*, not a reskinned desktop. It
 * is mounted when the viewport is phone-shaped (the same 860px cut the rest
 * of the app uses for its phone rules) or when we are inside the Capacitor
 * APK, where the device is a phone by definition regardless of CSS width.
 *
 * Desktop never evaluates true here, so the desktop bundle, the landing page
 * and every desktop screen are rendered exactly as before.
 */
import { useEffect, useState } from "react";
import { isNativeApp } from "../lib/native";

/** Matches the breakpoint the existing phone stylesheet is written against. */
export const PHONE_QUERY = "(max-width: 860px)";

export function phoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  try {
    return window.matchMedia(PHONE_QUERY).matches;
  } catch {
    // Very old WebViews: fall back to a width test rather than guessing.
    return window.innerWidth <= 860;
  }
}

/** Reactive form, so a rotation or a resized window swaps faces cleanly. */
export function usePhoneViewport(): boolean {
  const [phone, setPhone] = useState(phoneViewport);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(phoneViewport());
    mq.addEventListener("change", on);
    window.addEventListener("resize", on);
    return () => {
      mq.removeEventListener("change", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return phone;
}
