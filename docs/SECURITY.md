# ShadowQuest — Security Audit & Personal Data Flow

This document is the security audit for ShadowQuest: what personal data
exists, where it lives, who can read it, and which controls defend each
part. It also maps every item on the owner's security checklist to the code
that implements it.

Security is treated as a feature, not a finish line. Each control below
names the file(s) that enforce it.

---

## 1. Data inventory — what exists and where it lives

| # | Data | Where it lives | Who can read it |
|---|------|----------------|-----------------|
| 1 | Display name (handle) | browser `localStorage` (`sq.user.v1`) · server operator document | the operator; other operators see it on the public leaderboard and the people roster (by design — it is the gamertag) |
| 2 | Email address | browser `localStorage` · server operator document | the operator; **admins only** in the control panel; never in any public/authed roster endpoint |
| 3 | Password | **never stored anywhere** — only a scrypt hash (server) and a PBKDF2 verifier (device) | nobody — hashes only, compared in constant time |
| 4 | Bearer token (server session) | browser `localStorage` (`sq.token.<scope>`) · server document | the operator; the server uses it to scope ledger reads/writes |
| 5 | Admin token (control panel) | browser **`sessionStorage` only** (`sq.admin.token`) · server memory only, 6 h TTL | the operator's tab; dies with the tab and with a server restart |
| 6 | Ledger: tasks, habits, profile (levels, streaks, factors, points) | browser `localStorage` (per-scope keys) · server operator document | the operator; aggregates (level, streak, points, focus area) appear on the leaderboard / people roster |
| 7 | Habits (titles, mark, time, history) | same as ledger | the operator only — habits never leave an authed endpoint |
| 8 | Device prefs (theme, boot-seen, reminders) | browser `localStorage` / `sessionStorage` | the operator |

**What is NOT collected:** no analytics, no third-party scripts, no
trackers, no cookies, no IP logging, no device fingerprinting. The bundle
loads fonts and nothing else from outside the origin (see the CSP in
`public/_headers` and the build-injected `<meta>` in `vite.config.ts`).

---

## 2. Data flows

### 2.1 Sign-in / sign-up (`POST /v1/auth/signin`)

```
browser ── email + handle + password ──▶ server
                                        ├─ validates email shape
                                        ├─ enforces the password policy (min 12,
                                        │  upper + lower + digit + symbol)
                                        ├─ new operator: scrypt hash stored, count
                                        │  checked against SQ_MAX_USERS
                                        ├─ returning: constant-time verify
                                        └─ legacy (pre-password) account: first
                                           valid password presented seals it
browser ◀── token + public user (role) ──┘
```

- The plaintext password is never persisted, never logged, never echoed.
- Rate limits: **12 sign-in attempts / 10 min / IP**; **8 wrong passwords /
  15 min / email**; **SQ_MAX_USERS** hard cap (default 1000) → 503.
- Offline path (backend unreachable): the device's own **PBKDF2-SHA-256
  verifier** (210 000 iterations, per-user salt) gates the ledger. The same
  passphrase the server accepted is also sealed locally, so one password
  opens both gates. First-set-wins for devices that predate passwords.

### 2.1b Google sign-in (`/v1/auth/google/*`)

```
browser ── click ──▶ GET /v1/auth/google/start
                     ├─ mints state (CSRF) + nonce + PKCE verifier, in-process,
                     │  single-use, 10 min TTL
                     └─ 302 ▶ accounts.google.com   (the human authenticates
                                                     on GOOGLE's page, not ours)
Google  ── code ──▶ GET /v1/auth/google/callback
                     ├─ state must match one we minted (else: refused)
                     ├─ code + code_verifier + client_secret ──▶ token endpoint
                     │  (server-to-server, over TLS)
                     ├─ id_token verified: RS256 against Google's JWKS, then
                     │  iss ∈ {accounts.google.com}, aud == GOOGLE_CLIENT_ID
                     │  (constant-time), exp, iat, nonce, email_verified
                     ├─ MongoDB: googleId → link by email → create
                     └─ 302 ▶ app#/login?sq_auth=ok&code=<one-time handoff>
browser ── code ──▶ POST /v1/auth/google/exchange
browser ◀── the same bearer token a password sign-in issues ──┘
```

- **Nothing about the operator is taken from the frontend.** The identity
  comes from claims in a token this process verified against Google's
  published keys. A client that POSTs an email gets nowhere — there is no
  route that accepts one.
- `GOOGLE_CLIENT_SECRET` is used only in the token exchange, is never
  referenced from `src/`, and carries no `VITE_` prefix, so it cannot be
  bundled. No Google password ever reaches this system.
- **The session token never travels in a URL.** The redirect carries a
  one-time handoff code in the *hash fragment* (never sent to a server, so it
  stays out of access logs and `Referer`); redeeming it deletes it, and a
  replay answers 401.
- **Open redirect closed.** `SQ_APP_ORIGIN` is an allowlist; an unlisted
  origin falls back to the first allowed one. Unset, only localhost is
  accepted, so a misconfigured production deploy cannot leak a session.
- `googleId` is stripped by `publicUser` and never reaches the browser. The
  avatar URL is accepted only over `https:` from Google's own hosts, and the
  CSP's `img-src` is widened to exactly those.
- Rate limit: **20 authorizations / 10 min / IP**; the exchange shares the
  sign-in limiter.
- Unconfigured → the entire surface answers 503 and `/v1/auth/providers`
  reports `google: false`. It fails closed; it never invents an identity.

### 2.2 Ledger sync (`GET/PUT /v1/ledger`, `GET /v1/stats`)

- Every call carries the bearer token; the server scopes by the token's
  operator. `PUT` is limited to **120 writes / min / token** and a 512 kB
  body; `server/src/engine.mjs` sanitizes every field (lengths, enums,
  numeric bounds) before anything is stored.
- The client treats the backend as one of two copies and validates every
  read (`lib/todo.ts`, `lib/habits.ts`, `lib/auth.ts` treat all storage as
  untrusted).

### 2.3 Public surfaces (`GET /v1/leaderboard`, `GET /v1/people`)

- Leaderboard rows expose handle, level, streak, points, focus area —
  **never email, never token, never password material** (`publicUser`
  strips `token`, `_id` and `passwordHash` before anything leaves).
- `/v1/people` is token-gated and likewise email-free.

### 2.4 Admin control panel (`/v1/admin/*`)

```
browser ── operator token + admin token ──▶ server
                                           ├─ email ∈ ADMIN_EMAILS ?
                                           ├─ admin token ∈ in-memory vault ?
                                           └─ both, on every single call
```

- **ADMIN_EMAILS + ADMIN_PIN** both required; unset → every admin route is
  403. The PIN is compared in constant time and never leaves the process.
- Admin token: random 32 bytes, memory-only, 6 h TTL, per-IP rate limit
  (30 calls / 5 min). The panel can read overview numbers, list users (the
  only surface that shows emails), delete an operator (admins can't delete
  admins) and revoke every session at once.
- The client's `role` is **cosmetic only**: a hand-edited local record can
  at most render a tab; the server re-decides on every request.

### 2.5 CORS & headers

- `SQ_CORS_ORIGIN` locks CORS to an allowlist in production.
- `public/_headers` ships CSP (`script-src 'self'`, no unsafe-inline/eval),
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `Permissions-Policy` and a strict referrer policy. The same policy ships
  as a `<meta>` for the APK WebView where no headers exist.

---

## 3. The checklist, item by item

### 3.1 ✅ Exposed API keys
- The one third-party credential is the **Google OAuth client**.
  `GOOGLE_CLIENT_SECRET` is read only by `server/src/google.mjs`, used only in
  the server-to-server token exchange, and has no `VITE_` prefix — Vite can
  only bundle `VITE_*`, so it is structurally impossible to ship it to the
  browser. `GOOGLE_CLIENT_ID` is public by design (Google puts it in the
  consent URL) but is still served from the backend, never hardcoded.
- `VITE_API_BASE_URL` is a deployment address, not a secret.
- `.env` is gitignored; only `.env.example` is committed. The build is
  greppable: no `sk-`, `AIza`, or key-shaped literals in `src/` or `server/`
  (verify with the grep below).
- Secrets the owner does set (Mongo URI, ADMIN_PIN) live only in the
  backend environment and are never referenced from client code or bundled.

### 3.2 ✅ Personal data flow audit
- This document (sections 1–2) is the audit. The design rule: **the only
  personal identifier is the email, and it is admin-only; everything else
  is the gamertag and the game data the operator chose to enter.**
- Server responses are stripped by `publicUser` / `personOf` / `leaderRow`;
  the admin list is the single place emails can be read, and it is
  double-gated.

### 3.3 ✅ Sign-up limits
- `server/src/security.mjs` (fixed-window limiter) +
  `server/src/index.mjs`:
  - 12 sign-ins / 10 min / IP
  - 8 wrong passwords / 15 min / email
  - `SQ_MAX_USERS` cap (503 `registration is closed`)
  - 120 ledger writes / min / token
  - 30 admin calls / 5 min / IP
  - 512 kB JSON body limit

### 3.4 ✅ If the app crashes, show no information
- `src/components/FaultLine.tsx` is the React error boundary around the
  whole app: a sealed, in-world recovery screen with a reload action and
  **zero technical detail**. Error text goes to the console only.
- The API answers every unexpected error with a generic
  `{ error: "internal error" }` and logs internally; the Vite proxy
  replaces backend failures with an honest JSON 503 (and hides internals in
  production builds).
- `scripts/audit.mjs` boots the real bundle with hostile/corrupt storage
  and asserts the app survives (probes: `auth`, `ledger`, `squad`, `circle`).

### 3.5 ✅ Admin check on the admin side — owner-only control panel
- `#/app/admin` — PIN-gated console (desktop + reachable from the phone
  profile). Overview numbers, sign-up chart, top operators, full directory
  with search, operator removal, revoke-all-sessions.
- Server side: `server/src/admin.mjs` + the `/v1/admin/*` routes; every call
  re-verified. Nothing admin-related exists unless `ADMIN_EMAILS` and
  `ADMIN_PIN` are set.

### 3.6 ✅ Real hard password
- Policy: **min 12 characters, must contain upper + lower + digit +
  symbol** (max 128). Enforced in the form (`src/lib/password.ts`), in the
  mobile gate, and on the server (`server/src/security.mjs`) — a weak
  password cannot create or seal an account anywhere.
- Server: scrypt (N=16384, r=8, p=1), per-user salt, `timingSafeEqual`.
- Device: PBKDF2-SHA-256, 210 000 iterations, per-user salt, constant-time
  compare — the offline gate.
- Wrong-password attempts are rate-limited and never reveal whether the
  address exists beyond what a sign-in must.

### 3.7 ✅ Loader — heavily animated (21st.dev-inspired)
- `src/components/Boot.tsx` + the `.boot` block in `src/styles/home.css`:
  ink aurora orbs, drifting grid, stray kanji, rising ink particles,
  counter-rotating rings, ensō draw, the app mark slamming in on a vermilion flash,
  scrambling 000→100 counter, shimmer bar, blade-line exit through five
  panels. Skippable, reduced-motion-safe, and every loop is CSS so it dies
  with the curtain (verified by the `motion` audit probes).

### 3.8 ✅ Streaks feature
- `src/lib/streaks.ts` computes the chain from evidence (sealed tasks,
  habit marks, last-active record): live streak, best, today's state, an
  84-day heat grid, a week strip and a milestone track (7/30/60/100/180/365
  days). Milestones pay one-time reward points in the engine
  (`src/lib/todo.ts`).
- Desktop: `src/sections/StreakBoard.tsx` on the dashboard (the Consistency
  stat now reads the same computed chain). Mobile: `src/mobile/StreakCard.tsx`
  on the profile screen.

---

## 4. Residual risks (honest about the edges)

- **Local-first storage is not encrypted at rest.** A hard password gates
  the app, but it does not encrypt the localStorage ledger — that is a
  deliberate scope decision for a local-first app. Data that must be
  encrypted belongs in the backend (and production deployments should run
  Mongo with the platform's encryption at rest).
- **The file store is a dev fallback**, not production storage. Deployments
  with `MONGODB_URI` use Mongo; the file store exists so a preview never
  half-boots.
- **Legacy accounts without a password** are sealed by the first valid
  password presented (first-set-wins). This is a one-time migration path
  for operators who signed up before passwords existed.
- **Rate limits are in-memory** (per-process). Horizontally scaled
  deployments should front the API with a platform rate limiter.

## 5. Verify it yourself

```bash
# no secrets in the tree
grep -rInE "(sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-)" src server --include="*.ts" --include="*.tsx" --include="*.mjs" || echo "clean"

# build + full probe suite (crash, hostile storage, corruption, bundle weight)
npm run build
node scripts/audit.mjs

# smoke: the real bundle, desktop + mobile
npm run smoke
npm run smoke:mobile
```
