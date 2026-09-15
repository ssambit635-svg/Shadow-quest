# Site Loader — Check, Fix, Proof

## 1. Check: is the current loader YOUR loader?

**How the check was done:** searched the entire repo (`index.html`,
`public/loader-preview.html`, `src/components/Boot.tsx`, `src/styles/loader.css`).

**Verdict: NO — and here is the proof of why the old loader kept coming back:**

1. **React killed the HTML loader on sight.** The old `Boot.tsx` ran
   `initial.style.display = "none"` + `initial.remove()` on mount and then
   played its OWN GSAP animation. So whatever loader `index.html` contained
   never showed on screen — the old React copy always won. This is exactly
   the "baar baar wahi purana loader" bug.
2. **Production CSP blocked the loader script.** `vite.config.ts` injects
   `script-src 'self'` (no `'unsafe-inline'`) into built `index.html`, so the
   inline `<script>` driving the HTML loader could never run in the built
   site — frozen at `000` / stuck curtain in production, working only in dev.

Both are fixed below. There is now exactly ONE loader, and it is impossible
for a second/old one to appear — React renders no loader markup at all.

> Note: no user-supplied HTML loader file was found anywhere in the repo or
> workspace. If you have one, follow section 4 — it becomes the site loader
> verbatim, in one step, with no competing copy left to override it.

## 2. The fix: single-loader architecture

```
index.html                 #sq-initial-loader markup + #sq-critical-loader CSS (instant paint)
public/sq-loader.js        its ONLY driver (counter, stages, skip, session, exit)
src/components/Boot.tsx    renders NOTHING — waits for `sq:initial-loader-done`, then reveals chrome
src/styles/loader.css      mirror of the critical CSS in the bundle (keep in sync)
public/loader-preview.html standalone visual preview (not used by the site)
```

Rules (enforced by code review, not convention):

- Only ONE `#sq-initial-loader` may exist, only in `index.html`.
- Only ONE driver may exist: `/sq-loader.js` (external file — CSP-safe).
- `Boot.tsx` must never contain loader markup, loader CSS, GSAP timelines,
  or any call that hides/removes the loader before it finishes itself.
- Session key: `sq.boot.seen.v4` (bumped so the fixed loader shows fresh).
- `?loader` forces the loader, `?noloader` skips it, reduced-motion removes it.
- Every exit path dispatches `sq:initial-loader-done` + sets
  `window.__SQ_LOADER_STATE = "done"`; React also polls + has a 6s safety
  timer. The curtain can never trap the page.

## 3. Proof (re-run after any loader change)

```bash
npm run build
# 1. exactly one loader in the built page:
grep -c 'id="sq-initial-loader"' dist/index.html        # -> 1
# 2. no inline scripts (CSP-safe), driver is external:
grep -c '<script src="/sq-loader.js">' dist/index.html  # -> 1
grep -c '<script>' dist/index.html                      # -> 0
# 3. driver shipped:
ls -la dist/sq-loader.js
# 4. React renders no competing loader:
grep -rn "boot__\|gsap" src/components/Boot.tsx         # -> no matches
```

Then serve and check visually (first visit in the tab, or `?loader`):

```bash
npx vite preview --host 0.0.0.0 --port 4173
# open /?loader -> curtain 000→100 with stages -> blade + 5 panels exit
```

Session reset for testing:

```js
sessionStorage.removeItem("sq.boot.seen.v4");
location.reload();
```

## 4. Installing YOUR html file as the site loader (one step)

Paste your loader's HTML **inside** `#sq-initial-loader` in `index.html`,
its CSS **inside** `#sq-critical-loader` in `index.html`, and its JS **into**
`public/sq-loader.js` (never inline — production CSP blocks inline scripts).

Keep this contract so React knows when you finish:

- Keep the element id `sq-initial-loader`.
- When your animation ends: remove the element (or add your own exit class
  then remove it), release `document.documentElement.style.overflow`, and call:

```js
window.__SQ_LOADER_STATE = "done";
window.dispatchEvent(new CustomEvent("sq:initial-loader-done"));
```

- Keep honoring `sq.boot.seen.v4` (once per tab), `?loader` / `?noloader`,
  reduced-motion removal, skip-on-interaction, and a ≤4.5s safety timeout —
  all already implemented in `public/sq-loader.js`; reuse them.
- Mirror any CSS selector changes into `src/styles/loader.css`.

That is the whole integration. There is no second copy to update and no
React animation left to override yours.
