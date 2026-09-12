/**
 * api/index.ts — one import site for the whole app.
 *
 * Mode selection lives here and nowhere else:
 *   VITE_API_BASE_URL set → http transport
 *   unset (or VITE_API_MODE=mock) → in-page duel engine
 */
import { hasHttpApi, httpTransport } from "./client";
import { mockTransport } from "./mock";
import type { ShadowTransport } from "./transport";

const forced = (import.meta.env.VITE_API_MODE as string | undefined) ?? "";

export const api: ShadowTransport =
  forced === "mock" || !hasHttpApi ? mockTransport() : httpTransport();

/** True when the HUD is running against the in-page engine; the nav shows a
 *  small marker so nobody mistakes mock numbers for a live ladder. */
export const IS_MOCK = api.kind === "mock";

export * from "./types";
export type { ShadowTransport } from "./transport";
