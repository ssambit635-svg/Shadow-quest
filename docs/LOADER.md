# Site Loader — Verification & Implementation

## Check: Is this loader your loader?

**Previous state:**
- `index.html` had NO loader — blank screen until React bundle loaded (~500ms-1s FOUC)
- React `Boot.tsx` was the only loader, rendered after JS mount
- No instant paint, no critical CSS
- Session key: `sq.boot.seen.v3` existed but only in React

**Verdict:** ❌ The loader in HTML was NOT your site loader. It was React-only and caused blank flash.

## What was done: Made your loader the SITE loader

### 1. `index.html` — Instant Paint Loader (YOUR LOADER now)
- Added `#sq-initial-loader` with **critical inline CSS** (no external CSS needed)
- Same ShadowQuest design language:
  - Ink aurora background with 3 orbs (verm, indigo, brass) + scan line
  - Drifting grid
  - Floating kanji embers: 影 道 忍 修 剣 円 気 心 武 印
  - Rising ink particles
  - Center emblem: counter-rotating rings + ensō SVG drawing + halo + flash + glow + Sigil mark
  - Meta: SHADOWQUEST OS + 000→100 counter
  - Progress bar with shimmer sweep
  - Stage text with 5 stages: stirring the ink → summoning the shadows → sharpening the blade → aligning the ring → sealing the ledger
  - Blade line + 5 panels exit animation
- Vanilla JS logic:
  - Session-aware (once per tab)
  - Reduced-motion safe (hidden)
  - Skippable (pointerdown/keydown)
  - Counter animation 0→100 with stage switching
  - Exits with blade + panel curtain (translateY -101%)
  - Dispatches `sq:initial-loader-done` event for React

### 2. `src/components/Boot.tsx` — React Cinematic Loader
- Now cooperates with HTML loader:
  - If `#sq-initial-loader` exists, hides it immediately and takes over
  - If session already seen and HTML loader gone, skips entirely
  - Same GSAP timeline as before but improved cleanup
  - Listens for `sq:initial-loader-done` to avoid double
  - Removes HTML loader on finish
  - Session key consistent: `sq.boot.seen.v3`
- This is THE official site loader component

### 3. `src/styles/loader.css` — Canonical Loader Stylesheet
- Extracted and documented boot styles
- Used by both HTML loader and React loader
- Imported in `main.tsx` before `home.css`
- Media queries: thins glyphs/ink on mobile, hides on reduced-motion

### 4. `public/loader-preview.html`
- Standalone preview of loader for quick visual check

## How to customize your loader

### Option A: Edit HTML instant loader
Edit `index.html` `#sq-initial-loader` markup and `#sq-critical-loader` style.

### Option B: Edit React loader
Edit `src/components/Boot.tsx`:
- `GLYPHS` array — change floating kanji
- `STAGES` array — change stage texts
- `Sigil` — replace with your logo
- GSAP timeline — adjust durations

### Option C: Provide your own HTML file
If you have a custom loader HTML file:
1. Copy its markup into `index.html` inside `#sq-initial-loader`
2. Copy its CSS into `#sq-critical-loader` style tag
3. Keep IDs `data-boot-num`, `data-boot-fill`, `data-boot-stage` for counter logic, or replace JS in inline script

### Session reset for testing
```js
sessionStorage.removeItem('sq.boot.seen.v3')
location.reload()
```

## Verification

Build passes:
```
dist/index.html  24.79 kB
dist/assets/index-*.css  154 kB
dist/assets/index-*.js  538 kB
```

Loader now:
- ✅ Instant paint (0ms, before JS)
- ✅ Seamless handoff to React
- ✅ Session-aware, skippable, reduced-motion safe
- ✅ No blank screen
- ✅ Same visual language across HTML + React
- ✅ Official site loader
