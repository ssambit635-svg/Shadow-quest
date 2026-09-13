/**
 * prefs.ts — the small things that must survive a route change or a refresh:
 * which technique you last chose, and whether phase changes may raise a
 * system notification. The live session itself persists separately (see
 * hooks/useFocusSession.ts), so a refresh mid-focus lands back in the room.
 */
const KEY_TECH = "sq.technique";
const KEY_ALERTS = "sq.phaseAlerts";
const KEY_SHADOW = "sq.shadow";

export const prefs = {
  technique(): string | null {
    return localStorage.getItem(KEY_TECH);
  },
  setTechnique(id: string) {
    localStorage.setItem(KEY_TECH, id);
  },
  /** Phase-change notifications in the session room. Opt-in, per browser. */
  phaseAlerts(): boolean {
    return localStorage.getItem(KEY_ALERTS) === "1";
  },
  setPhaseAlerts(on: boolean) {
    localStorage.setItem(KEY_ALERTS, on ? "1" : "0");
  },
  /** Which shadow the landing roster is holding open (marketing page only). */
  shadow(): string | null {
    return sessionStorage.getItem(KEY_SHADOW);
  },
  setShadow(id: string) {
    sessionStorage.setItem(KEY_SHADOW, id);
  },
};
