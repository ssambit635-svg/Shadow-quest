# Mizu welcome guide

- `src/components/MizuGuide.tsx`: homepage-only welcome, opt-in audio, minimize/reopen, keyboard controls and simple local chat.
- `src/lib/mizu.ts`: keyword matching, replies and the matching spoken transcripts. No LLM, API calls, microphone, or message storage. Only welcome/mute preferences are saved in session storage (with a safe fallback when blocked).
- `public/images/mizu-guide.webp`: original AI-generated chibi samurai illustration, cropped and compressed for this project. Not artwork of an existing anime character.
- `public/audio/mizu-*.mp3`: synthetic speech generated for this project, with a feminine voice selected by the user. Not a recording from an anime, not a celebrity/character voice clone, and no music or third-party anime samples.

The assets are self-hosted; no runtime speech subscription or external voice service is needed. Generated media should **not** be represented as public domain or guaranteed “copyright-free”; any commercial reuse remains subject to the generation provider’s applicable terms. The UI discloses the synthetic voice and scripted behavior.

## Behavior

The first home visit in a tab shows a small welcome after the loader finishes. Audio starts only after **Hear my welcome** is clicked. Finishing the introduction docks Mizu automatically. A silent welcome docks after 30 seconds; users can minimize it immediately. Reopening the corner launcher opens basic chat. Topic buttons and keyword questions play the corresponding recording unless muted. Unknown questions receive a text-only fallback; no arbitrary answers are invented.

Minimizing, navigating away, muting, or hiding the tab stops playback. Intro and canned answers have visible text, including an expandable full welcome transcript. Escape minimizes the panel and returns focus to the launcher. Reduced-motion users get no entrance or speaking animations.

The guide is scoped to the landing page so it does not obstruct the mobile app dock, authentication forms, or Deep Work sessions.

## Checks

```sh
npm run build
npm run smoke
npm run smoke:mobile
```

Optional real-browser regression test (install Playwright locally; it is not an app dependency):

```sh
npm install --no-save --package-lock=false playwright
npx playwright install --with-deps chromium
# Start npm run dev separately, or point HOME_TEST_URL at a production preview.
node scripts/smoke-home.mjs
```

`CHROMIUM_PATH` can point to an existing Chromium executable. `HOME_TEST_SCREENSHOTS` optionally specifies a directory for review screenshots. Tests cover the persistent headline, idle/scroll/resize/reload/route-return behavior, welcome playback/docking, local replies, mute/error handling, narrow layouts, reduced motion, and blocked session storage.
