# The ShadowQuest backend

A small Express API (`server/`) that stores **real operator data** — nothing
in it is seeded. Every row it serves was submitted by a person who signed
in. The frontend keeps working offline (device-local ledger), and syncs
through this API whenever it can reach it.

```
browser / APK
   │  same-origin /api (dev: vite proxy)  ·  VITE_API_BASE_URL (prod/APK)
   ▼
server/  — Express
   │
   ├── MongoDB  (MONGODB_URI set)      ← production
   └── file store (server/.data/db.json) ← dev fallback, same shape
```

## Running it

```bash
cd server
npm install
npm start            # or: npm run dev (watch mode)
```

Environment:

Copy `.env.example` to `.env` in the repository root and fill it in — the API
loads it on startup (`server/src/env.mjs`, zero dependencies) and logs the
**keys** it picked up, never the values. Anything already present in the real
environment wins, so a platform's injected variables and CI overrides are
never clobbered by a stale local file. Inline `VAR=… npm start` also works and
takes precedence.

| variable          | default       | meaning                                        |
| ----------------- | ------------- | ---------------------------------------------- |
| `PORT`            | `8788`        | listen port (the vite proxy expects this)       |
| `MONGODB_URI`     | *(unset)*     | MongoDB connection string — Atlas or self-hosted |
| `MONGODB_DB`      | `shadowquest` | database name                                   |
| `SQ_DATA_DIR`     | `server/.data` | where the file store persists when no Mongo     |
| `ADMIN_EMAILS`    | *(unset)*     | comma-separated owner addresses; enables admin   |
| `ADMIN_PIN`       | *(unset)*     | the control panel PIN (8+ chars); both required |
| `SQ_MAX_USERS`    | `1000`        | hard cap on registered operators                 |
| `SQ_CORS_ORIGIN`  | *(unset)*     | CORS allowlist, comma-separated origins          |
| `SQ_TRUST_PROXY`  | `0`           | set `1` behind a platform proxy for honest IPs   |
| `GOOGLE_CLIENT_ID` | *(unset)*    | OAuth 2.0 web client id from the Google console  |
| `GOOGLE_CLIENT_SECRET` | *(unset)* | its secret — server-side only, never bundled    |
| `GOOGLE_CALLBACK_URL` | *(unset)* | must match a registered redirect URI exactly     |
| `SQ_APP_ORIGIN`   | *(unset)*     | allowlist of origins the login may return to     |
| `SQ_NATIVE_ORIGIN` | `https://localhost,http://localhost` | the installed APK's own origins, allowed to receive a sign-in handoff and included in CORS. `off` disables both. |
| `SQ_SERVE_WEB`    | *(unset)*     | set `1` to also serve the built web app (`dist/`) — single-service production, see below |

## Production (single service)

The web build calls the relative `/api` prefix, which only works where
something answers it. In dev that is the vite proxy; in production it is this
process: with `SQ_SERVE_WEB=1` the API serves the built `dist/` bundle itself,
so **one host answers both `/` (the page) and the API**. A static-only host
answers `/api/*` with 404 — that is the *"no ShadowQuest API behind it"*
failure — and cannot proxy API traffic to a second service, which is why
production is one Web Service rather than static + API.

For this repository that service is **`https://shadowquest.onrender.com`**
(`render.yaml` → `shadowquest`), and the retired static site at
`https://shadow-quest.onrender.com` — which still deploys the same `dist/` and
therefore still looks correct while answering `/api/*` with its own 404 page —
is forwarded there by `public/sq-canonical.js` at boot. The forward carries
path, query and `#fragment`, because the OAuth handoff parks its one-time code
in the fragment. If the deployment ever moves to the old subdomain, swap the
two values at the top of that file.

`render.yaml` at the repo root is the whole deployment as a Render Blueprint
(Dashboard → New → Blueprint → this repo → Apply):

- build: `npm ci && npm run build && npm --prefix server ci`
- start: `node server/src/index.mjs` (Render injects `PORT`)
- liveness: `GET /v1/health`
- `SQ_SERVE_WEB=1` + `SQ_TRUST_PROXY=1` are set; `MONGODB_URI`,
  `GOOGLE_*` and `ADMIN_*` are `sync: false` — set them on the service in
  the Dashboard and redeploy.

Routing in serve-web mode:

- `/v1/*` and `/api/v1/*` → the same routes. Web clients use the relative
  `/api` form; APK builds (`VITE_API_BASE_URL=https://<host>`) and direct
  API users use the root form. Unknown paths under either prefix answer
  JSON `404 {"error":"unknown endpoint"}` — never the app shell.
- `/` and any extension-less non-API path → `index.html` (the app), with
  the `public/_headers` policy applied as real headers.
- `/assets/*` (content-hashed) caches for a year; HTML revalidates; a path
  that looks like a file but is missing stays a 404 instead of receiving
  HTML where it expects JavaScript.

Three production notes:

1. **Set `MONGODB_URI`.** Without it the file store lives on the
   platform's ephemeral disk — wiped on every restart and deploy.
2. **Google sign-in** needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
   `GOOGLE_CALLBACK_URL`, where the callback reads
   `https://<host>/api/v1/auth/google/callback` and matches a registered
   redirect URI exactly. The app's own origin is already an allowed return
   (the callback's origin is always permitted), so `SQ_APP_ORIGIN` is
   optional hardening.
3. **Free tiers sleep.** A cold Render service answers the first request
   slowly; the frontend treats that as "API away" and degrades to the
   device ledger rather than failing. For a link that strangers are about to
   click — a submission, a demo — `.github/workflows/keepalive.yml` pings
   `GET /v1/health` every ten minutes so the first click is never the one
   that pays for the boot. Delete that workflow when the evaluation is over,
   or point a free uptime monitor (UptimeRobot, cron-job.org) at the same
   URL, which also tells you when the service is genuinely down.

With `MONGODB_URI` set and reachable the API uses MongoDB (collection
`users`, one document per operator, ledger embedded). Without it, the API
logs one warning and persists to a JSON file instead — same data model, so
nothing upstream changes. **There is no mock mode**: neither store invents
operators, tasks, or leaderboard rows.

Example (MongoDB Atlas):

```bash
MONGODB_URI='mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net' npm start
```

## Endpoints

| method + path                    | auth        | purpose                                             |
| -------------------------------- | ----------- | --------------------------------------------------- |
| `GET /v1/health`                 | –           | liveness + which store is active                    |
| `POST /v1/auth/signin`           | –           | create / verify / seal the account with a password  |
| `GET /v1/auth/providers`         | –           | which sign-in methods this deployment has live      |
| `GET /v1/auth/google/start`      | –           | 302 to Google's consent screen (state + PKCE)       |
| `GET /v1/auth/google/callback`   | –           | Google's redirect; verifies and reconciles the user |
| `POST /v1/auth/google/exchange`  | –           | trade the one-time handoff code for a session token |
| `GET /v1/ledger`                 | bearer      | the operator's stored profile + tasks + habits      |
| `PUT /v1/ledger`                 | bearer      | replace the stored ledger (validated, bounded)      |
| `GET /v1/stats`                  | bearer      | aggregates for the stats dashboard (see below)      |
| `GET /v1/leaderboard`            | –           | real operators ranked by total progress (top 25)    |
| `GET /v1/people`                 | bearer      | other registered operators, for the squad roster    |
| `POST /v1/admin/elevate`         | bearer+role | present the PIN → mint a short-lived admin token    |
| `GET /v1/admin/overview`         | admin       | totals, activity, sign-ups, top operators           |
| `GET /v1/admin/users`            | admin       | operator directory (the only surface with emails)   |
| `DELETE /v1/admin/users/:email`  | admin       | remove an operator (admins cannot delete admins)    |
| `POST /v1/admin/sessions/revoke-all` | admin  | rotate every token — everyone signs in again        |

Auth is a bearer token issued at sign-in (`Authorization: Bearer <token>`),
kept per-scope in the browser beside the ledger it belongs to. Admin calls
carry **both** identities: the operator token in `x-sq-token` and the
PIN-minted admin token in `Authorization`; every admin route re-verifies the
email against `ADMIN_EMAILS` and the token against the in-memory vault.

### Sign-in has three branches

1. **New operator** — the password must pass the policy (min 12 chars,
   upper + lower + digit + symbol). A scrypt hash is stored; the password
   itself is never persisted. `mode: "created"`.
2. **Returning operator** — the password is verified in constant time.
   Wrong passwords are rate-limited (8 / 15 min / email). `mode: "verified"`.
3. **Legacy operator** (registered before passwords existed) — the first
   valid password presented seals the account. `mode: "sealed"`.

### Google sign-in

Real OAuth 2.0 / OpenID Connect, entirely server-side (`server/src/google.mjs`).
The browser never sees the client secret, an access token or an ID token — it
only ever carries opaque, single-use, server-minted values.

```
click → GET  /v1/auth/google/start      302 → accounts.google.com
                                              (state + nonce + PKCE S256)
      → Google authenticates the human
      → GET  /v1/auth/google/callback   state consumed (one-time, 10 min TTL)
                                        code + verifier + secret → token endpoint
                                        id_token: RS256 verified against Google's
                                        JWKS, then iss / aud / exp / iat / nonce
                                        / email_verified all checked
      → MongoDB reconciliation (below)
      → 302 back to the app with a one-time handoff code (2 min TTL)
      → POST /v1/auth/google/exchange   code → the ordinary bearer token
```

Reconciliation, in order:

1. **`googleId` already stored** → that account, always. An operator who
   changes their Gmail address keeps their ledger.
2. **email already registered** → **link**: the same document gains
   `googleId` / `picture` / `providers: ["password", "google"]`. Nothing else
   is touched, so tasks, habits, life factors, rewards, achievements and
   progress all stay put, and the existing password keeps working.
3. **neither** → a new operator with an empty ledger, subject to
   `SQ_MAX_USERS`.

The session token never travels in a URL — only the handoff code does, in the
hash fragment (which browsers do not send to servers), and redeeming it
deletes it. `SQ_APP_ORIGIN` is an allowlist, not a hint: an unlisted origin is
refused, so a handoff can never be bounced to a host someone else controls.
Unset, the three Google variables leave the whole surface inert — every route
answers 503, `/v1/auth/providers` reports `google: false`, the frontend does
not draw the button, and email + password is unaffected.

`npm run smoke:oauth` walks the whole thing against the real routes, stubbing
only Google's two HTTPS endpoints, and asserts the refusals: forged state,
replayed handoff, wrong audience, expired token, unverified email, open
redirect.

### Rate limits & caps

| limit                        | window     |
| ---------------------------- | ---------- |
| sign-in attempts per IP      | 12 / 10 min |
| wrong passwords per email    | 8 / 15 min  |
| ledger writes per token      | 120 / min   |
| admin calls per IP           | 30 / 5 min  |
| Google authorizations per IP | 20 / 10 min |
| JSON body                    | 512 kB      |
| registered operators         | `SQ_MAX_USERS` (default 1000) |

### What `/v1/stats` returns

Everything is derived from the operator's own stored ledger:

- `daily` — the last 84 days: goals sealed, habit seals, progress, points.
  This feeds the activity heatmap on the stats dashboard.
- `weekly` — progress sealed per week, last eight Mondays. The momentum bars.
- `factors` — life-factor points earned from completed goals.
- `categories` — reward points split by goal category. The donut.
- `profile` + headline counts (open/sealed goals, habits, weekly points).

The exact same aggregation exists client-side in `src/lib/statsCalc.ts`; when
the backend is away the dashboard falls back to it and labels itself
**device copy** instead of **live · backend**.

## How the frontend syncs

`src/lib/sync.ts` is the bridge:

- on load it pulls the stored ledger; when the server copy is **newer** than
  the device copy (`updatedAt` timestamps) the device adopts it;
- every mutation (add / complete / reopen / delete a goal, habit edits)
  schedules a debounced push of the whole ledger (last write wins);
- a `pagehide` / `visibilitychange` flush makes sure sealing a goal and
  closing the tab two seconds later still syncs.

The leaderboard (`#/app/ladder`) reads `GET /v1/leaderboard` directly and
shows its failure state when the API is unreachable instead of inventing
rows. The squad's "People on ShadowQuest" list is `GET /v1/people` — real
registrations only; when nobody else has registered it says exactly that.

## Notes

- The frontend never trusts wire data: tasks, habits and the profile pass
  through the same sanitizers used for localStorage (`sanitizeTasks`,
  `sanitizeHabits`, `repairProfile`), and the server validates again.
- The Deep Work duel engine (`src/api/mock.ts`) is intentionally untouched —
  it is a self-contained game, not operator data. The Google demo accounts
  on the sign-in screen remain a chooser; like every identity they now pass
  through the password gate, demo or not.
