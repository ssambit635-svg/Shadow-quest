/**
 * demoAccounts.ts — the demo Google identities.
 *
 * Sign-in in ShadowQuest is local-first: `lib/auth.login(handle, email)`
 * writes an identity to this device and every ledger key hangs off the
 * normalised email. A Google sign-in therefore needs no server, no client id
 * and no change to auth behaviour — it is the same call with the handle and
 * email a Google account chooser would have handed over.
 *
 * These three are the accounts the chooser offers. They are ordinary people
 * with ordinary gmail addresses, and the one you do *not* pick is still in
 * the pool the squad draws from, so a fresh sign-in lands in a populated
 * world rather than an empty one.
 */
export interface GoogleAccount {
  id: string;
  name: string;
  email: string;
  /** First letter pair used for the avatar tile. */
  initials: string;
  /** Hue for the avatar tile, 0-360. Kept muted by the stylesheet. */
  hue: number;
  /** What Google would show as the account hint line. */
  hint: string;
}

export const GOOGLE_ACCOUNTS: GoogleAccount[] = [
  {
    id: "g_aarav",
    name: "Aarav Sharma",
    email: "aarav.sharma1998@gmail.com",
    initials: "AS",
    hue: 222,
    hint: "aarav.sharma1998@gmail.com",
  },
  {
    id: "g_mei",
    name: "Mei Tanaka",
    email: "mei.tanaka.dev@gmail.com",
    initials: "MT",
    hue: 268,
    hint: "mei.tanaka.dev@gmail.com",
  },
  {
    id: "g_rohan",
    name: "Rohan Mehta",
    email: "rohan.mehta.rm@gmail.com",
    initials: "RM",
    hue: 196,
    hint: "rohan.mehta.rm@gmail.com",
  },
];

/** Which account is signed in with Google on this device, if any. */
const PROVIDER_KEY = "sq.auth.provider.v1";
const ACCOUNT_KEY = "sq.auth.google.v1";

export interface AuthProvider {
  kind: "google" | "local";
  /** Google account id when kind is google. */
  accountId?: string;
  /** Epoch ms of the sign-in. */
  at: number;
}

export function readProvider(): AuthProvider | null {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<AuthProvider> | null;
    if (!p || typeof p !== "object") return null;
    if (p.kind !== "google" && p.kind !== "local") return null;
    // Only the fields this app wrote, and only in the shapes it expects. A
    // marker written by an older build or edited by hand must not smuggle
    // anything into Profile, which renders `at` as a date.
    return {
      kind: p.kind,
      accountId: typeof p.accountId === "string" ? p.accountId.slice(0, 64) : undefined,
      at:
        typeof p.at === "number" && Number.isFinite(p.at) && p.at > 0 ? p.at : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeProvider(p: AuthProvider | null): void {
  try {
    if (!p) localStorage.removeItem(PROVIDER_KEY);
    else localStorage.setItem(PROVIDER_KEY, JSON.stringify(p));
  } catch {
    /* private mode: the identity itself still lives in lib/auth */
  }
}

export function accountById(id: string | undefined): GoogleAccount | null {
  if (!id) return null;
  return GOOGLE_ACCOUNTS.find((a) => a.id === id) ?? null;
}

/** The signed-in Google account, when the current identity came from one. */
export function signedInAccount(): GoogleAccount | null {
  const p = readProvider();
  if (!p || p.kind !== "google") return null;
  return accountById(p.accountId);
}

export function forgetProvider(): void {
  writeProvider(null);
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}
