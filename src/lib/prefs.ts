/**
 * prefs.ts — the two things that must survive a route change: which shadow you
 * chose, and the code you were given. Persisted to sessionStorage, which is
 * also what makes a refresh mid-duel land you back on the same field.
 */
const KEY_SHADOW = "sq.shadow";
const KEY_CODE = "sq.code";

export const prefs = {
  shadow(): string | null {
    return sessionStorage.getItem(KEY_SHADOW);
  },
  setShadow(id: string) {
    sessionStorage.setItem(KEY_SHADOW, id);
  },
  code(): string | null {
    return sessionStorage.getItem(KEY_CODE);
  },
  setCode(code: string) {
    if (code) sessionStorage.setItem(KEY_CODE, code);
    else sessionStorage.removeItem(KEY_CODE);
  },
};
