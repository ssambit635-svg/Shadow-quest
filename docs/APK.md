# ShadowQuest on Android — the APK, end to end

The Android build is a **Capacitor WebView shell** around the exact bundle the
site ships. There is no second codebase and no second backend: `npm run build`
produces `dist`, `npx cap sync android` copies it into the native project, and
Gradle wraps it. Whatever `VITE_API_BASE_URL` was set at build time is the
backend the APK talks to; unset, it runs the same in-page engine the
un-configured site runs.

```
npm run build ──▶ dist ──▶ npx cap sync android ──▶ android/app/…/assets/public
                                                          │
                                              ./gradlew assembleDebug
                                                          │
                                                          ▼
                                              app-debug.apk  (installable)
```

---

## 1 · The fast path — take the APK from a GitHub Release

The workflow [`.github/workflows/android.yml`](../.github/workflows/android.yml)
builds, signs and publishes the APK to a **GitHub Release** for you.

1. Open the repo → **Actions** tab → **“Build Android APK”** → *Run workflow*.
   (Or push a tag: `git tag v1.1.0 && git push origin v1.1.0` — same run.)
2. Wait ~5–8 minutes for the run to go green.
3. Open **Releases** — there is now a release named `ShadowQuest v1.1.0 —
   Android` with the APK attached, plus the APK as a run artefact under
   **Actions → the run → Artifacts**.
4. In the app itself, the **Download APK** button (landing footer and the
   ledger header) resolves that newest `.apk` asset from the Releases API and
   downloads it directly; if no build exists yet it takes you to the Releases
   page instead of dead-ending.

Install on a device: copy the APK across (or download it on-device from the
release), open it, and allow *“install unknown apps”* for the source when
Android asks. That is the whole install — it is a debug-signed build, which
Android accepts for sideloading.

## 2 · Build it on your own machine

You need, once:

| tool | version | why |
| --- | --- | --- |
| JDK | 21 | AGP 8.13 requires 17+, Capacitor 8 targets 21 |
| Android SDK | platform 36, build-tools | via Android Studio or `sdkmanager` |
| Node | ≥ 18 | the web bundle |
| `ANDROID_HOME` | set | so Gradle finds the SDK |

```bash
npm ci
npm run build                 # web bundle → dist
npx cap sync android          # dist → android native project

cd android
./gradlew assembleDebug       # → android/app/build/outputs/apk/debug/app-debug.apk
```

Install straight to a connected device instead:

```bash
./gradlew installDebug        # or: adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Open the native project in Android Studio any time with
`android/` as the root — it is a normal Gradle project.

### Iterate on the web side without rebuilding the APK

```bash
npx cap run android           # builds + launches
npx cap copy android          # push only web changes into the running shell
npx cap open android          # Android Studio
```

### Live mode (APK loads the hosted site instead of a bundled copy)

```bash
CAPACITOR_SERVER_URL=https://your-host.example npx cap sync android
```

`capacitor.config.ts` reads that variable and switches the shell from
*bundled* to *live*, so the APK is always the deployed build. Clear it and
re-sync to go back to bundling.

## 3 · Point the APK at the real backend

The transport is chosen at **build** time, exactly like the web app:

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
npx cap sync android
```

In CI the same value comes from the repository **variable**
`VITE_API_BASE_URL` (Settings → Secrets and variables → Actions → Variables).
Leave it unset and the APK ships the in-page engine — identical behaviour to
the site with no `.env`.

For this deployment the value is `https://shadowquest.onrender.com` — the
single Web Service that answers `/` **and** `/api/*`. Anything else fails
loudly: the retired static site at `shadow-quest.onrender.com` has no API
behind it, so an APK pointed there reports *"This build points at an address
with no ShadowQuest API behind it"* on every Google tap.

**This is not optional if you want sign-in.** Inside the shell the bundle is
served from `https://localhost` (Capacitor's defaults: hostname `localhost`,
scheme `https`), so a relative `/api` resolves to the app's own origin, where
nothing is listening. The login gate detects that and says so — *"This app
build has no API address…"* — rather than sending the tap into a dead end.
`capacitor.config.ts` prints the same warning at sync time.

## 3b · "Continue with Google" inside the APK

Google sign-in is the same server-side OAuth the website uses; the APK only
has to survive the round trip. It does, because of two settings:

| piece | where | what it does |
| --- | --- | --- |
| `server.allowNavigation` | `capacitor.config.ts` | keeps the trip **inside** the WebView. Capacitor's `Bridge.launchIntent` hands any navigation to an unlisted host to the system browser, which used to throw the sign-in out of the app: Chrome got the handoff code, `https://localhost` had nothing listening, and the app never saw it. The list is `accounts.google.com` plus the host of `VITE_API_BASE_URL`. |
| `SQ_NATIVE_ORIGIN` | backend env | lets the backend bounce back to `https://localhost`. Defaults to the Capacitor origins; set `SQ_NATIVE_ORIGIN=off` for a website-only deployment. The same origins are added to the CORS allowlist, so the exchange POST is not refused when `SQ_CORS_ORIGIN` is set. |

The trip: tap → `{api}/v1/auth/google/start?return_to=https://localhost/` →
Google's consent screen → `{api}/v1/auth/google/callback` → back to
`https://localhost/#/login?sq_auth=ok&code=…`, where the shell serves the
bundle again, `readGoogleReturn` erases the code from the address bar, and
`POST /v1/auth/google/exchange` trades it for the session. Nothing about the
identity is ever decided in the app.

So a working APK needs `VITE_API_BASE_URL` at build time **and**
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` on the
backend — the same three the website needs.

## 4 · Release signing (only when you want a store build)

With no secrets, the workflow emits a **debug-signed** APK — perfect for
sideloading and testing. For a distributable release build, add four secrets
(Settings → Secrets and variables → Actions → Secrets):

| secret | value |
| --- | --- |
| `KEYSTORE_B64` | `base64 -w0 release.keystore` |
| `KEYSTORE_PASSWORD` | store password |
| `KEY_ALIAS` | key alias |
| `KEY_PASSWORD` | key password |

With those present the same workflow runs `assembleRelease` and injects the
signing material via `-Pandroid.injected.signing.*` — **the keystore never
touches the repository** (`.gitignore` blocks `*.keystore` / `*.jks`). The
release then publishes the release-signed APK under the same release.

Generate a keystore once, and back it up somewhere that is not Git:

```bash
keytool -genkey -v -keystore release.keystore -alias shadowquest \
  -keyalg RSA -keysize 2048 -validity 10000
```

## 5 · What is inside the shell

- **App id** `app.arena.shadowquest`, label *ShadowQuest* — `capacitor.config.ts`
  and `android/app/build.gradle`.
- **Edge-to-edge** — `MainActivity` calls
  `WindowCompat.setDecorFitsSystemWindows(window, false)`, so the ink runs
  under the status and navigation bars and the CSS `env(safe-area-inset-*)`
  the mobile stylesheet keys off resolves to real values (the docked tab bar
  pads itself above the home gesture because of this).
- **No white flash** — `backgroundColor: #0c0b0a` in the Capacitor config,
  `android:windowBackground` = ink in `styles.xml`, and an ink splash.
- **Icons + splash are generated**, never hand-edited:
  `node scripts/pwa-icons.mjs` (web/PWA set) and
  `node scripts/android-assets.mjs` (launcher, adaptive layers, splash at all
  five densities) both render from `public/icons/icon.svg`.
- **Keyboard** — `windowSoftInputMode="adjustResize"` so the layout reflows
  instead of hiding behind the soft keyboard.
- **No landing page** — a cold boot inside the shell (`App.tsx`, native-boot
  effect) lands straight in the ledger for a signed-in operator, or at the
  gate for a stranger. Sign-out returns to the gate, not the pitch page.
- **Back button behaves like an app** — the WebView maps BACK to history, so
  BACK walks tabs backwards; the bottom sheet pushes one history entry and
  closes on BACK instead of leaving its screen; and every redirect (the
  auth gate, the native boot, sign-out) *replaces* its history entry, so
  BACK can never trap itself in a login↔app loop.

## 6 · Regenerating the copied web bundle

`android/app/src/main/assets/public` is a build artefact and is **gitignored**;
`npx cap sync android` (or CI) recreates it from `dist`. Never edit files in
there by hand — edit the web app and re-sync.

## 7 · Troubleshooting

| symptom | cause / fix |
| --- | --- |
| `SDK location not found` | set `ANDROID_HOME`, or write `sdk.dir=…` to `android/local.properties` (gitignored) |
| Gradle wrapper download stalls | first run fetches Gradle ~150 MB; it caches afterwards |
| APK installs but shows a white page | `dist` was empty — run `npm run build` before `cap sync` |
| App talks to mock data in CI | `VITE_API_BASE_URL` variable not set on the repo |
| `env(safe-area-inset-*)` reads 0 | the edge-to-edge call in `MainActivity` was removed |
| APK installs, taps work, page will not scroll | WebView nested-scroll / GSAP pin. Rebuild after the native-scroll fix (`MainActivity` enables nested scrolling; `html.sq-native` keeps the viewport as the scroller; the growth-loop pin is off inside the shell). Chrome on the same phone is unaffected. |
| Release APK won’t install over debug one | different signature — uninstall the debug build first |
| "Could not reach ShadowQuest. Check your connection" on Google sign-in | the app could not reach the API. Read the reason it now prints instead: *"no API address"* → the APK was built without `VITE_API_BASE_URL`; *"no ShadowQuest API behind it"* (404) → the address has no API behind it (the retired `shadow-quest.onrender.com` static site, or any static host without a rewrite) — point the build at `https://shadowquest.onrender.com`; *"the API did not answer"* → the backend is down or `SQ_CORS_ORIGIN` blocks the shell origin |
| Google sign-in works on the website but not in the APK | `server.allowNavigation` missing the API host — the trip was handed to the system browser. Re-sync after setting `VITE_API_BASE_URL` |
| Google sign-in lands on the website instead of back in the app | the backend refused the shell origin — `SQ_NATIVE_ORIGIN` is set to something that excludes `https://localhost` (or `off`) |
