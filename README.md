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
| **Type** | Shippori Mincho (display, a Japanese mincho serif) · Barlow (body) · Barlow Condensed (labels, readouts) |
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

## Stack

Vite · React 19 · TypeScript (strict) · GSAP 3.15 with the now-free
`SplitText`, `DrawSVGPlugin`, `ScrambleTextPlugin`, `CustomEase` · no UI kit, no
CSS framework, no animation library besides GSAP.

```
src/
  api/          transport, mappers, mock duel engine, assumed-contract notes
  components/   Boot, Nav, Cursor, SamuraiMark, hud/*
  hooks/        useResource, useQuest, useSession, useReducedMotion
  lib/          motion.ts (eases/reveals/cursor/fx), reveal.ts, prefs.ts, ready.ts
  pages/        Home (landing), Field (the game HUD)
  sections/     Hero, Ticker, Way, Roster, Form, Ladder, Outro
  styles/       tokens, base, home, arena
```

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## Backend

`src/api/index.ts` chooses the transport: set `VITE_API_BASE_URL` (see
`.env.example`) and the app talks HTTP; leave it unset and it runs
`mockTransport`, a real in-page duel engine — ki economy, guard soak, an
opponent that reads you, and the same `fx` payload the server contract promises,
so every animation is driven by genuine state change rather than a demo timer.

**`Api.md` never arrived in the sandbox** (no `uploads/`, nothing in the repo),
so endpoints and field names are *assumed*. They are all listed in
[`src/api/contract.md`](src/api/contract.md), together with the naming variants
the mappers already tolerate. Reconciling the real doc is a two-file edit:
`types.ts` for field names, `client.ts` for paths — nothing else in the app
knows HTTP exists.

## Assets

`public/img-src/` holds the painted masters; `node scripts/sharp-assets.mjs`
derives the web set (progressive JPEG for paper plates, plus the brush and wash
**alpha masks** in `public/img/` — one asset each, paintable and animatable in
any token colour instead of a second export per theme).
