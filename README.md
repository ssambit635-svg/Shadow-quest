# Shadow Quest — 影の道

Front-end for a turn-based duel game. Deliberately not a SaaS landing page with
a game logo on it, and deliberately not the purple-blue-neon look every
AI-generated "game site" ships with.

## The look

| | |
| --- | --- |
| **Ground** | warm sumi black `#0c0b0a` — never pure `#000` |
| **Light** | bone paper `#f4efe6` → `#7e766a` |
| **Accent** | vermilion `#c1362b`, used for exactly three things: the blade line, the active state, one dot per screen |
| **Support** | aged brass `#a98a55` for ki/guard readouts only |
| **Type** | Cinzel (display, epic game serif) · Manrope (body) · Oswald (labels, readouts) · Shippori Mincho kept for header Japanese accents only |

Every Focus Area carries its name in **both scripts** — the English name the
product speaks in, the Japanese name in mincho beneath it, and the romaji
reading as furigana (`Shadow.nameJa` / `readingJa` / `schoolJa`, all optional
on the wire so a backend that never sent them still renders a card).
| **Corners** | 2px. No soft card radii, no glass, no aurora gradients, no glow |

Light sections are **paper plates mounted on the ink page** — the sumi-e painting
is shown on the paper it was painted on instead of being cut out and given a
drop shadow. Roster cards are paper too. That inversion is the whole art
direction: the site is ink, the artwork is paper.

## The motion

Everything routes through `src/lib/motion.ts`, which owns one idea: **the site
moves like a loaded brush.**

- Three named eases registered once — `brush`, `snap`, `steel` — plus a `breath`
  curve. No component invents its own easing.
- Four reveal verbs only (`rise / wipe / draw / brush / bleed`), declared as
  `data-rv` attributes and wired by `src/lib/reveal.ts`. Five competing reveal
  styles on one page reads as indecision.
- SVG is genuinely *inked*: `DrawSVG` pulls the ronin mark and the ensō stroke
  by stroke, and the ink-bleed `feTurbulence` + `feDisplacementMap` filter keeps
  those lines wet instead of vector-crisp.
- `SplitText` breaks headlines into chars that ride inside line masks, so type
  arrives as a stroke rather than a typewriter.
- Combat feedback: `hitStop()` freezes the global timeline for ~3 frames and
  `shake()` offsets the struck panel — impact that costs nothing to render.
- Scroll velocity drives the marquee's `timeScale`, so motion responds to input
  instead of looping at you.
- **One** idle loop exists site-wide (`[data-fx-bleed]`, the ink under the
  field), paused via IntersectionObserver when off-screen. Everything else is
  tied to a trigger or a user action.
- `prefers-reduced-motion` is handled at the registration layer (`REDUCED` +
  a global `timeScale`), so no component can opt out of it, and reveals become
  plain content.
- The boot curtain (`src/components/Boot.tsx`) is the one place allowed to go
  loud: ink aurora, drifting grid, kanji embers, rising ink, counter-rotating
  rings, the 影 slam and a blade-line exit. Every loop in it is **CSS**, so it
  dies with the curtain — the boot leaves no rAF chains behind (measured by
  the `motion` probes in the audit).

## The session

The Deep Work room (`#/app/field`) is not a duel. You pick a **technique** —
a cycle shape, each with a kanji seal: Pomodoro 間 (25/5 ×4), Ultradian 波
(90/20 ×2), 52/17 律, Flowmodoro 流 (count-up focus, earned rest), Zazen 座
(20′ of stillness), Kaizen 改 (15/3 ×6) — and the room keeps the count:

- The clock is an **ensō**: one open brushed circle (turbulence-displaced, so
  the edge stays wet) that *fills* while focus is held and *drains* while rest
  is taken. Cycle seals stamp themselves vermilion as rounds complete.
- The clock is **wall-clock**: `phaseEndsAt` plus a persisted session record
  mean a backgrounded tab, a closed lid or a full refresh never loses a
  minute — the next tick settles whatever actually passed, and settling early
  banks only elapsed minutes.
- The rail keeps the **real ledger** in reach: today's open goals can be
  linked as the current target, sealed from the seat (paying Progress and
  Reward Points through the same `completeTask` path as the dashboard), or
  quick-added without leaving the room.
- Phase changes stamp ink on the ring and — opted in, permission granted —
  raise one system notification each. The tab title carries the countdown.

## The loop, honestly

The growth loop (`04 — the loop`) and the ensō clock are driven by **one
number each**, so nothing on screen can disagree about where you are:

- the ring turns exactly one full circle across the section; the brush gap
  meets station *i*'s marker at `p = i / N`;
- the active station is `floor(p * N)` and its copy is at full opacity for
  the whole of its own band — the first and last stations read as clearly as
  the middle ones;
- every write is a `gsap.set`. A tween started from inside a scrub's
  `onUpdate` restarts each frame and never arrives; that lag was what made
  the numerals trail the ring.
- a technique card states its true shape — `25′ focus · 5′ rest ×3 · 4 rounds
  · 1h 55m` — because the engine runs `cycles − 1` rests (none after the
  final round) and the card used to promise `cycles` of them.
- the ensō's arc is a CSS transition exactly one clock tick long
  (`TICK_MS`), so the stroke is a continuous ramp that lands on the numerals
  instead of chasing them.

## The phone face

Below `860px` this stops being a squeezed website and becomes an app: a
**docked bottom tab bar** (thumb reach, safe from the scroll-hide transform,
padded above the home-gesture inset), the side rails gone, gutters in, every
tap target ≥ 44px, hover-only motion unattached on touch, and the two
full-screen blend-mode overlays (grain, vignette) dropped because a phone
compositor pays for them every frame. Above the breakpoint none of it applies
— the laptop keeps the HUD exactly as authored. `src/styles/mobile.css` is
loaded last and is entirely breakpoint-scoped; `isNarrow()` in `lib/motion.ts`
uses the same test so the JS and the CSS never disagree.

It is also installable: `public/manifest.webmanifest` + a generated icon set
(`node scripts/pwa-icons.mjs`) make it a standalone PWA on iOS and Android.

## Android APK

The same bundle ships as an APK through a Capacitor shell — see
[`docs/APK.md`](docs/APK.md) for the build, the CI release pipeline, signing,
and device install. The in-app **Download APK** button resolves the newest
`.apk` from the GitHub Releases page; with no build published yet it takes
you to the Releases page instead of dead-ending.

## The ritual

The dashboard grows a **Habits** panel: one row per daily habit, a kanji seal
per date, the streak as the only currency (no XP — habits are showing up,
not work), and a seven-day dot row. Each habit carries a time of day; with
the reminder armed, a habit still open past its time raises exactly one
system notification per day from any open tab, and glows brass in the panel
whether or not the browser allows notifications.

## Stack

Vite · React 19 · TypeScript (strict) · GSAP 3.15 with the now-free
`SplitText`, `DrawSVGPlugin`, `ScrambleTextPlugin`, `CustomEase` · no UI kit, no
CSS framework, no animation library besides GSAP.

```
src/
  api/          transport, mappers, mock duel engine, assumed-contract notes
  components/   Boot, Nav, Cursor, SamuraiMark, hud/*, ApkLink
  hooks/        useResource, useQuest, useSession, useReducedMotion
  lib/          motion.ts (eases/reveals/cursor/fx), reveal.ts, prefs.ts, ready.ts
  pages/        Home (landing), Field (the Deep Work room)
  sections/     Hero, Ticker, Way, Roster, Form, Ladder, Outro
  components/   session/ (ensō ring), habits/ (daily ritual panel)
  hooks/        useFocusSession (wall-clock session engine), useApi
  styles/       tokens, base, home, arena, dashboard, login, app, mobile
android/        Capacitor native shell (web bundle under assets/public is
                gitignored; `npx cap sync` regenerates it)
docs/APK.md     the Android build / release / signing / install guide
```

## Run

```bash
npm install
npm run dev        # BOTH halves: the data API (:8788) + the site (:5173)

npm run dev:api    # just the API        (cd server && npm install, once)
npm run dev:web    # just the site       (proxies /api → :8788)
# with MongoDB:  MONGODB_URI='mongodb+srv://…' npm run dev:api

npm run build
node scripts/audit.mjs      # security/crash probe suite (23 probes)
npm run smoke         # desktop: session + habits flow, ledger persists
npm run smoke:mobile  # phone face: gate → ledger → stats → squad → profile
npm run smoke:ladder  # milestones: renders live AND with the API down

# owner's control panel (both must be set for #/app/admin to exist):
#   ADMIN_EMAILS='you@your-domain.com' ADMIN_PIN='a-long-pin' npm run dev

node scripts/pwa-icons.mjs      # regenerate the PWA / install icon set
node scripts/android-assets.mjs # regenerate Android launcher + splash art
npx cap sync android            # push dist into the native shell
```

## Your Signal — the stats dashboard

A dedicated read-out of the operator's own recorded work — on the site
(`#/app/stats`, tab **Stats**) and on the phone face (`#/app/stats`, reached
from Home and Profile). Same palette discipline as everything else; the
motion is the point:

- **Life-level ring** — one brushed arc drawn to the exact level progress.
- **Counters** that roll to their values (progress, goals sealed, streak,
  power index, open goals, marks).
- **Life-factor radar** — seven axes on one shape, drawn in from the centre,
  hoverable vertex by vertex.
- **Activity field** — the last 84 days as a heatmap, one cell a day, inking
  itself in column by column; hover/tap reads the day.
- **Weekly momentum bars** — progress sealed per week, last eight Mondays.
- **Factor growth + reward donut** — where the points came from, by category.
- **Marks** — the achievement ledger, earned vs. in-progress.

Data prefers the backend (`GET /v1/stats`) and falls back to the device
ledger; the badge in the header says **live · backend** or **device copy**,
so nobody mistakes one for the other.

## Theme — ink and paper

The site carries a **dark / light toggle** in the nav: *ink* (the sumi
ground, default) and *paper* (the same palette inverted, as if the ledger
were printed). The swap is one token move — the two raw scales exchange
roles — so every surface follows. The choice persists per browser. The
phone face and the APK keep their own tokens and stay in ink on purpose;
the toggle exists on the site face only.

## Real data, no seeds

Since the backend landed, nothing on the data surfaces is invented:

- **Tasks** — a fresh ledger is empty. Goals appear when a person adds them.
- **Habits** — same: the ritual starts blank.
- **Leaderboard** (`#/app/ladder`, tab **Milestones**) — reads
  `GET /v1/leaderboard`: real operators ranked by recorded progress, with the
  signed-in operator's own row marked **you**. Unreachable backend → an honest
  *device copy*: the operator's own milestones from this device's ledger and a
  badge saying where they came from. Never fake rows, never a red error for
  "the API isn't running" — that is a deployment state, not a data failure.
- **Squad** — no seeded pool. The "People on ShadowQuest" list is the live
  roster of registered operators (`GET /v1/people`); when nobody else has
  registered, it says so.
- **Kept, on purpose**: the Google *demo accounts* on the sign-in screen
  (local-first sign-in needs identities to choose from), and the Deep Work
  duel/focus engine, which is a self-contained game rather than operator data.

## The gate — a real hard password

Sign-in now requires a **hard passphrase** — min 12 characters, at least one
uppercase, one lowercase, one digit and one symbol. The form (desktop and
phone) shows a live strength meter and refuses a weak one before it leaves
the device.

- **Online**: the backend stores only a scrypt hash and verifies in constant
  time. Wrong passwords are rate-limited; new sign-ups are rate-limited and
  capped (`SQ_MAX_USERS`).
- **Offline**: this device's own PBKDF2-SHA-256 record (210k iterations,
  per-user salt) gates the ledger, so the same key opens both worlds.
- Accounts that predate passwords are **sealed** by the first valid
  password presented — a one-time migration, first-set-wins.

Full details, the personal data flow audit and every control:
[`docs/SECURITY.md`](docs/SECURITY.md).

## The chain — streaks

The Consistency stat, a heat-map panel on the desktop dashboard and a card
on the phone profile are all driven by one honest computation
(`src/lib/streaks.ts`): every sealed task, every habit mark and the engine's
last-active record become the live chain, an 84-day heat grid, a week strip
and a milestone track — **7 / 30 / 60 / 100 / 180 / 365 days**, each paying
a one-time reward-point bonus when the chain reaches it.

## The control panel — owner only

`#/app/admin` is the owner's console. It exists only for emails listed in
`ADMIN_EMAILS`, opens only with `ADMIN_PIN`, and every call is re-verified
by the backend (a locally edited role is cosmetic). From it the owner sees
the real numbers — operators, activity, sign-ups — can search the directory
(the only surface that shows emails), remove an operator, and revoke every
session at once. See `docs/BACKEND.md` for the endpoints.

## If the app ever crashes

`src/components/FaultLine.tsx` is the error boundary around the whole app:
a sealed, in-world recovery screen with a reload — never a stack trace,
never an error message. The API answers every unexpected failure with a
generic body, and the audit suite (`node scripts/audit.mjs`) boots the real
bundle with hostile and corrupt storage to prove the app survives it.

## Backend

`server/` is a small Express API in front of **MongoDB** (`MONGODB_URI`) —
see [`docs/BACKEND.md`](docs/BACKEND.md). Operators sign in, the frontend
pushes their ledger (profile + tasks + habits) and reads it back on any
device; the leaderboard, stats and people roster are aggregated from what
was actually stored. When no MongoDB is configured the API persists to a
local JSON file with the same shape — a dev fallback, still real data.

In dev, the browser calls same-origin `/api` and Vite proxies it to the API
on `:8788`; APK / production builds point `VITE_API_BASE_URL` at the
deployed URL instead. `src/lib/sync.ts` is the bridge: pull-on-load (server
copy wins when newer), debounced write-through on every mutation, flush on
tab close. The in-page duel engine in `src/api/mock.ts` remains the
transport for the Deep Work game itself — the assumed-contract notes for it
live in [`src/api/contract.md`](src/api/contract.md).

## Assets

`public/img-src/` holds the painted masters; `node scripts/sharp-assets.mjs`
derives the web set (progressive JPEG for paper plates, plus the brush and wash
**alpha masks** in `public/img/` — one asset each, paintable and animatable in
any token colour instead of a second export per theme).

## ⚠️ Copyright & License

**© 2026 ssambit635-svg — All Rights Reserved.**

This repository is public for **review and evaluation purposes only**.

| | |
|---|---|
| ✅ You **MAY** | Read, review, and evaluate this code |
| ❌ You **MAY NOT** | Copy, clone, fork, redistribute, or use in your own projects |

Unauthorized copying or use of this code will result in a **DMCA takedown
notice** filed with the hosting platform. See [`LICENSE`](LICENSE) for the
full terms.

To request a license for use in your own project, contact the author.
