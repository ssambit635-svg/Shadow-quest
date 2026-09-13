# The phone face

ShadowQuest has two faces. The desktop one is unchanged. This documents the
second: a mobile-native shell built for the Android APK and for phone-width
browsers.

It is **not** the desktop UI scaled down. It is a separate component tree with
its own chrome, its own navigation and its own design system.

## When it shows

`src/mobile/device.ts` decides, and it is the only place that does:

- the viewport matches `(max-width: 860px)` — the same cut the existing
  `styles/mobile.css` is written against, or
- `Capacitor.isNativePlatform()` is true, i.e. we are inside the APK.

Everything else renders exactly as before. The landing page, the desktop gate
and the desktop dashboard are never touched by this code.

## What is replaced, and what is not

| Route | On a phone |
| --- | --- |
| `#/` | desktop landing page (already responsive) |
| `#/login` | **mobile gate** (`mobile/screens/MobileLogin.tsx`) |
| `#/app` | **mobile shell** (`mobile/MobileApp.tsx`) |
| `#/app/field` | the existing Deep Work room, unchanged |
| `#/app/ladder` | the existing ladder, unchanged |

The phone face adds its own destinations *under* `#/app/…` — `tasks`,
`progress`, `rewards`, `profile`, `squad`. `App.tsx`'s `readHash()` maps all of
them to the `app` route and stays out of the way; `mobile/nav.ts` reads the
full hash itself. On a laptop those URLs show the dashboard, which is the
honest fallback.

## Layout

Bottom dock, five tabs: **Home · Tasks · Progress · Rewards · Profile**.
Squad is reached from Home and Profile rather than given a sixth tab.

- **Home** — Life Level, Growth Rank, the bar to the next level, Reward
  Points, streak, today's most important tasks, and all seven Life Factors.
- **Tasks** — the full to-do: the same five filters, the same task row, add,
  delete, reopen.
- **Progress** — the personal character sheet: a heptagon of the seven Life
  Factors, a Power Index, an archetype, the rank ladder, attribute tiers,
  discipline and condition.
- **Rewards** — the real Reward Points total, where they came from, marks
  earned, and the goals that produced them. No shop: there is no spend
  mechanic in the engine, so none is implied here.
- **Profile** — identity, the Google connection, squad, skills, the APK link,
  sign out.

## Data

Nothing new is stored except the squad, and nothing calls a backend.

| Concern | Source |
| --- | --- |
| Tasks, profile, factors, streaks | `lib/todo` — unchanged, same storage keys |
| Identity | `lib/auth` — unchanged |
| Character sheet numbers | `mobile/stats.ts`, derived from `Profile` |
| Squad and friends | `mobile/squad.ts`, `localStorage` `sq.squad.<scope>` |
| Which provider signed you in | `sq.auth.provider.v1` |

The character sheet is derived, never stored, so it cannot disagree with the
ledger.

## Sign-in

Sign-in is local-first, so a Google sign-in needs no client id and no server:
it is the same `login(handle, email)` call with the name and address an
account chooser would have handed over. The three demo identities live in
`mobile/demoAccounts.ts`, and whichever you do not pick is still in the pool
the squad draws from. The provider is remembered separately so Profile can
show it and offer to detach — detaching clears the marker only and never
deletes a ledger.

## Design system

`styles/mobile-ui.css`. Every selector is scoped under `.m-app` or `.m-login`
and it references no desktop token, so it cannot reach the other face. It is a
separate *layout* language, not a separate palette: warm sumi ink, bone light,
vermilion as the one action colour and aged brass as the one data colour, with
gold reserved for reward — the same four colours the desktop uses. Hairline
borders, glow as punctuation. Reduced motion is honoured throughout.

`--m-vio` keeps its historical name so the tone attributes already in the
markup (`data-tone="violet"`, `.fx__line--factor`) do not have to move; the
value it holds is brass.

## Hardening

Everything this face reads out of `localStorage` is treated as untrusted.
Storage is shared with any script on the origin and outlives every release, so
a record can be stale, half-written or hand-edited — and one bad field used to
be enough to white-screen the app with no way back to the gate. Each reader
(`lib/auth`, `mobile/squad`, `lib/todo`, `hooks/useFocusSession`,
`mobile/demoAccounts`) validates and repairs instead of casting.

Sign-in additionally caps and strips what it accepts: an address is capped at
RFC 5321's 254 octets and lowercased *before* the data scope is derived from
it, and a display name has control characters, bidi overrides and angle
brackets removed. A browser that refuses storage still signs the operator in
for the session instead of throwing.

## Verifying it

```
npm run smoke          # the desktop face, unchanged
npm run smoke:mobile   # the phone face, end to end
node scripts/audit.mjs # crash + hardening probes against the built bundle
```

`smoke-mobile.mjs` boots the built bundle at 420×860 in happy-dom and walks
the real thing: the demo Google gate, the ledger, a task completion and the
reward beat it produces, the character sheet, rewards, the squad formation,
and the dock. It asserts against `localStorage`, so a number that fails to
persist fails the test.

`audit.mjs` is the adversarial half. It boots the same bundle in a fresh
window per scenario, seeds `localStorage` with hostile or corrupt state, and
reports whether the app survived: a 20k-character address, markup in a display
name, a hand-edited identity record, `A@B.com` against `a@b.com`, a browser
that refuses storage, four shapes of broken squad data, a broken persisted
Deep Work session under the ensō, and a zeroed profile under the character
sheet's radar. It also measures what idle actually costs — rAF callbacks per
frame, in an isolated process so GSAP's shared ticker is not credited with
tweens from earlier boots. Run one group with `node scripts/audit.mjs circle`.
