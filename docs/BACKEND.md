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

### Rate limits & caps

| limit                        | window     |
| ---------------------------- | ---------- |
| sign-in attempts per IP      | 12 / 10 min |
| wrong passwords per email    | 8 / 15 min  |
| ledger writes per token      | 120 / min   |
| admin calls per IP           | 30 / 5 min  |
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
