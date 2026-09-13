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

| variable      | default              | meaning                                        |
| ------------- | -------------------- | ---------------------------------------------- |
| `PORT`        | `8788`               | listen port (the vite proxy expects this)       |
| `MONGODB_URI` | *(unset)*            | MongoDB connection string — Atlas or self-hosted |
| `MONGODB_DB`  | `shadowquest`        | database name                                   |
| `SQ_DATA_DIR` | `server/.data`       | where the file store persists when no Mongo     |

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

| method + path          | auth   | purpose                                             |
| ---------------------- | ------ | --------------------------------------------------- |
| `GET /v1/health`       | –      | liveness + which store is active                    |
| `POST /v1/auth/signin` | –      | upsert operator by email, returns a bearer token    |
| `GET /v1/ledger`       | bearer | the operator's stored profile + tasks + habits      |
| `PUT /v1/ledger`       | bearer | replace the stored ledger (validated, bounded)      |
| `GET /v1/stats`        | bearer | aggregates for the stats dashboard (see below)      |
| `GET /v1/leaderboard`  | –      | real operators ranked by total progress (top 25)    |
| `GET /v1/people`       | bearer | other registered operators, for the squad roster    |

Auth is a bearer token issued at sign-in (`Authorization: Bearer <token>`),
kept per-scope in the browser beside the ledger it belongs to.

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
  on the sign-in screen stay as they were, by request.
