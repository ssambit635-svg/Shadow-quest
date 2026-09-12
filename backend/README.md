# LifeRPG Backend

LifeRPG turns real-life productivity into an RPG. This repository folder is the **complete authoritative backend**: authentication, MongoDB models, quest gameplay, XP/levels, gold, streaks, shop, inventory, achievements, history, and anti-cheat.

A separate frontend should consume these REST APIs. **Do not trust the client** with XP, gold, level, prices, or achievement unlocks — the server is the source of truth.

```
REAL-LIFE ACTIVITY → QUEST → COMPLETE QUEST → XP + GOLD
        → LEVEL UP → ACHIEVEMENTS → SHOP → INVENTORY → REPEAT
```

---

## 1. Project overview

Players create real-world tasks as **Quests** (study, gym, reading, coding, meditation). Completing a quest awards **XP** and **Gold**, updates a **daily streak**, may **level up** the player, and may **unlock achievements**. Gold is spent in a virtual **Shop**. Purchased items land in **Inventory**.

This backend is designed so a frontend developer can build the entire UI from this document alone.

---

## 2. Architecture

```
backend/
├── src/
│   ├── config/          # MongoDB connection + game constants (rewards, XP curve)
│   ├── controllers/     # Thin HTTP adapters
│   ├── models/          # Mongoose schemas
│   ├── routes/          # REST route definitions
│   ├── middleware/      # JWT auth, validation, errors
│   ├── services/        # Authoritative game logic (XP, level, quest, reward, streak, shop, achievements)
│   ├── utils/           # JWT, dates, pagination, responses
│   ├── seed/            # Idempotent catalog seed (shop + achievements)
│   ├── app.js           # Express app (exported for tests)
│   └── server.js        # Process entry: connect DB + listen
├── tests/               # Jest + Supertest + mongodb-memory-server
├── .env.example
├── package.json
└── README.md
```

Gameplay logic lives in `src/services`, not in route files. Controllers never accept client-supplied XP, gold, level, prices, or unlock flags.

---

## 3. Technology stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 18+ |
| HTTP | Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT (`Authorization: Bearer <token>`) |
| Passwords | bcryptjs (12 salt rounds) |
| Validation | express-validator |
| Security | helmet, CORS, rate limiting on auth, ownership checks |
| Tests | Jest, Supertest, mongodb-memory-server |

---

## 4. Installation

```bash
cd backend
cp .env.example .env
# edit .env — set JWT_SECRET and MONGODB_URI
npm install
```

From the repository root (npm workspaces):

```bash
npm install
npm run dev
```

---

## 5. MongoDB setup

**Option A — local MongoDB** listening on `27017`.

**Option B — Docker** (from `backend/`):

```bash
docker compose up -d
```

Default URI:

```
mongodb://127.0.0.1:27017/liferpg
```

Then seed the shop and achievement catalog:

```bash
npm run seed
```

The seed is **idempotent**. Re-running it upserts catalog documents and does **not** delete users, quests, inventory, or progression.

---

## 6. Environment variables

Copy `.env.example` to `.env`.

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | no (default `5000`) | HTTP port |
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `MONGODB_URI` | **yes** | MongoDB connection string |
| `JWT_SECRET` | **yes** | Long random secret used to sign tokens |
| `JWT_EXPIRES_IN` | no (default `7d`) | Token lifetime (`7d`, `12h`, …) |
| `FRONTEND_URL` | recommended | CORS origin, e.g. `http://localhost:3000`. Comma-separated list allowed. |

Never commit real secrets. Never hardcode MongoDB credentials or JWT secrets in source.

---

## 7. Database models

### User (player)

Persistent RPG account.

| Field | Type | Notes |
| --- | --- | --- |
| name | String | 2–50 chars |
| email | String | unique, lowercase, indexed |
| password | String | hashed, never selected by default, never returned |
| level | Number | starts at 1; derived from XP |
| xp | Number | **cumulative** lifetime XP |
| gold | Number | current spendable balance |
| streak | Number | current daily streak |
| longestStreak | Number | best streak ever |
| lastActiveDate | Date | UTC day of last quest completion |
| totalQuestsCompleted | Number | lifetime completions |
| totalGoldEarned | Number | lifetime gold earned (not current balance) |
| createdAt / updatedAt | Date | timestamps |

### Quest

| Field | Type | Notes |
| --- | --- | --- |
| userId | ObjectId | owner (indexed) |
| title, description | String | |
| difficulty | `easy` \| `medium` \| `hard` | |
| category | see categories below | |
| xpReward, goldReward | Number | **set by server from difficulty** |
| status | `active` \| `completed` \| `cancelled` | |
| recurrence | `none` \| `daily` \| `weekly` | |
| dueDate | Date \| null | |
| completedAt | Date \| null | set for one-time quests |
| lastCompletedAt | Date \| null | last successful completion |

Categories: `study`, `fitness`, `work`, `health`, `mindfulness`, `creative`, `social`, `chores`, `other`.

### QuestCompletion

Historical snapshot. Unique index on `{ userId, questId, periodKey }` prevents duplicate rewards.

`periodKey`:

- one-time → `once`
- daily → `YYYY-MM-DD` (UTC)
- weekly → `YYYY-Www` (ISO week, UTC)

### Item

Shop catalog: `name`, `description`, `price`, `rarity`, `type`, `icon`, `active`.

### Inventory

`{ userId, itemId, quantity, acquiredAt }` with unique `{ userId, itemId }`.

### Achievement + UserAchievement

Catalog definitions (`key`, `name`, `description`, `requirement`, `type`, `threshold`, `icon`) and per-user unlock rows (`unlockedAt`).

---

## 8. Authentication

### JWT strategy

- Register and login return `{ token, user }`.
- Send `Authorization: Bearer <token>` on every protected route.
- Player identity is **always** taken from the token (`req.user`). A `userId` in the body is ignored/stripped.
- Logout inserts the token into a blacklist (MongoDB TTL on `expiresAt`) so it cannot be reused.
- Passwords are hashed with bcryptjs. Plain-text passwords are never stored or returned.

### Auth rate limit

`POST /api/auth/register` and `POST /api/auth/login` are rate-limited (50 / 15 minutes / IP). Disabled in `NODE_ENV=test`.

---

## 9. API conventions

Base URL (local): `http://localhost:5000`

**Success**

```json
{
  "success": true,
  "message": "Quest completed successfully",
  "data": {}
}
```

**Error**

```json
{
  "success": false,
  "message": "Quest has already been completed"
}
```

Validation errors may include `details: [{ field, message }]`.

| Status | Meaning |
| --- | --- |
| 200 | OK |
| 201 | Created |
| 400 | Bad request / validation / insufficient gold |
| 401 | Missing, invalid, expired, or blacklisted token |
| 403 | Authenticated but not the resource owner |
| 404 | Not found |
| 409 | Duplicate (email, quest already completed) |
| 500 | Unexpected server error (no stack traces in production) |

All dates are ISO-8601. Streaks and daily recurrence use **UTC days**.

---

## 10. API endpoints

### Health

#### `GET /api/health`

Auth: none

Response `200`:

```json
{
  "success": true,
  "message": "LifeRPG API is running",
  "data": { "status": "ok", "timestamp": "2026-09-12T12:00:00.000Z" }
}
```

---

### Auth

#### `POST /api/auth/register`

Auth: none

Body:

```json
{
  "name": "User",
  "email": "user@example.com",
  "password": "password123"
}
```

Rules: name 2–50, valid email, password 8–128. Duplicate email → `409`.

Response `201`:

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "...",
      "name": "User",
      "email": "user@example.com",
      "level": 1,
      "xp": 0,
      "gold": 0,
      "streak": 0,
      "longestStreak": 0,
      "totalQuestsCompleted": 0,
      "totalGoldEarned": 0,
      "xpProgress": {
        "level": 1,
        "currentXp": 0,
        "xpForCurrentLevel": 0,
        "xpForNextLevel": 1000,
        "xpIntoLevel": 0,
        "xpToNextLevel": 1000,
        "progressPercent": 0
      }
    }
  }
}
```

Example:

```bash
curl -s -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"User","email":"user@example.com","password":"password123"}'
```

---

#### `POST /api/auth/login`

Auth: none

Body: `{ "email": "user@example.com", "password": "password123" }`

Invalid credentials → `401` `"Invalid email or password"` (does not reveal whether the email exists).

Response `200`: `{ token, user }` (same shape as register).

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password123"}'
```

---

#### `GET /api/auth/me`

Auth: **required**

Returns the authenticated player, including XP progress, streak, gold, and totals. Password is never included.

Errors: `401` missing/invalid/blacklisted token.

---

#### `POST /api/auth/logout`

Auth: **required**

Blacklists the current access token. Subsequent requests with that token return `401`.

The frontend should also discard the token from storage.

---

### Player / dashboard

#### `GET /api/user/dashboard`

Auth: **required**

Single round-trip for the home screen.

`data` includes:

- `player` — public player document + `xpProgress`
- `stats` — level, xp, gold, streaks, totals, active/completed counts, `completionsToday`
- `xpProgress`
- `todaysQuests` — active quests with `completedInCurrentPeriod`
- `dueToday` — subset with `dueDate` today (UTC)
- `recentlyCompletedQuests` — last 8 history rows
- `unlockedAchievements`
- `inventorySummary` — unique count, total quantity, recent items

Use this after login instead of firing many list endpoints.

---

#### `GET /api/user/profile`

Auth: **required** — `{ user }`

#### `PUT /api/user/profile`

Auth: **required**

Body (all optional): `{ "name": "New Name", "email": "new@example.com" }`

`xp`, `gold`, `level`, `streak`, and similar fields are **stripped** and cannot be changed here.

#### `PUT /api/user/password`

Auth: **required**

Body: `{ "currentPassword": "...", "newPassword": "atleast8" }`

Wrong current password → `401`.

---

### Quests

#### `POST /api/quests`

Auth: **required**

Body:

```json
{
  "title": "Study for 1 hour",
  "description": "Deep work on algorithms",
  "difficulty": "medium",
  "category": "study",
  "recurrence": "none",
  "dueDate": "2026-09-12T18:00:00.000Z"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| title | yes | 1–120 chars |
| description | no | max 2000 |
| difficulty | yes | `easy` \| `medium` \| `hard` |
| category | no | default `other` |
| recurrence | no | default `none` |
| dueDate | no | ISO-8601 |

**Ignored if sent:** `xpReward`, `goldReward`, `userId`, `status`, `xp`, `gold`, `level`.

Server-assigned rewards:

| Difficulty | XP | Gold |
| --- | --- | --- |
| easy | 50 | 25 |
| medium | 100 | 50 |
| hard | 200 | 100 |

Response `201`: `{ quest }`

---

#### `GET /api/quests`

Auth: **required** — only the caller's quests.

Query: `status`, `category`, `difficulty`, `recurrence`, `page` (default 1), `limit` (default 20, max 100).

Each quest includes `completedInCurrentPeriod` (useful for daily/weekly).

Response: `{ quests, pagination: { page, limit, total, totalPages } }`

---

#### `GET /api/quests/:id`

Auth: **required**. Owner only (`403` if another user's quest, `404` if missing, `400` if invalid id).

---

#### `PUT /api/quests/:id`

Auth: **required**. Owner only. Partial update.

You **cannot** set `status` to completed here — use the complete endpoint.

Changing `difficulty` recalculates `xpReward` / `goldReward` from server constants (blocked for completed one-time quests).

---

#### `DELETE /api/quests/:id`

Auth: **required**. Owner only. History rows are kept (they store a title snapshot).

---

#### `POST /api/quests/:id/complete`

Auth: **required**. **Critical gameplay endpoint.**

Process (all server-side):

1. Authenticate via JWT
2. Load quest, verify ownership
3. Reject cancelled / already completed one-time quests
4. Insert `QuestCompletion` with unique `{ userId, questId, periodKey }`
5. Award stored `xpReward` + `goldReward` (not client values)
6. Increment `totalQuestsCompleted` and `totalGoldEarned`
7. Update daily streak / longest streak
8. Recompute level from cumulative XP
9. Evaluate achievements
10. Return the full updated player state

Duplicate completion → `409`.

Response `200` (fields the frontend needs for animations):

```json
{
  "success": true,
  "message": "Quest completed successfully",
  "data": {
    "quest": { "...": "..." },
    "completion": { "...": "..." },
    "rewards": { "xp": 50, "gold": 25 },
    "player": { "level": 1, "xp": 50, "gold": 25, "streak": 1, "xpProgress": {} },
    "levelUp": false,
    "oldLevel": 1,
    "newLevel": 1,
    "currentXp": 50,
    "currentGold": 25,
    "currentLevel": 1,
    "streak": {
      "current": 1,
      "longest": 1,
      "lastActiveDate": "2026-09-12T00:00:00.000Z",
      "increased": true
    },
    "achievementsUnlocked": [
      {
        "key": "FIRST_QUEST",
        "name": "First Quest",
        "unlocked": true,
        "unlockedAt": "2026-09-12T12:00:00.000Z"
      }
    ]
  }
}
```

If `levelUp` is `true`, show a level-up animation using `oldLevel` / `newLevel`.

If `achievementsUnlocked` is non-empty, show unlock toasts.

**Recurring quests**

- `none` — completable once; status becomes `completed`
- `daily` — completable once per UTC day; status stays `active`; second call the same day → `409`
- `weekly` — completable once per ISO week (UTC); same anti-duplicate rule

Example:

```bash
TOKEN=...
curl -s -X POST http://localhost:5000/api/quests/<id>/complete \
  -H "Authorization: Bearer $TOKEN"
```

---

### History

#### `GET /api/history`

Auth: **required** — only the caller's completions.

Query:

| Param | Description |
| --- | --- |
| `date` | Single UTC day (`YYYY-MM-DD` or ISO) |
| `from` / `to` | Inclusive UTC day range |
| `category` | Quest category |
| `difficulty` | `easy` \| `medium` \| `hard` |
| `page` / `limit` | Pagination |

Response: `{ history, pagination }`

Each row: `userId`, `questId`, `questTitle`, `difficulty`, `category`, `xpEarned`, `goldEarned`, `periodKey`, `completedAt`.

---

### Shop

#### `GET /api/shop/items`

Auth: **required**

Query: `rarity` (`common` \| `uncommon` \| `rare` \| `epic` \| `legendary`), `type` (`weapon` \| `potion` \| `accessory` \| `badge` \| `booster` \| `cosmetic`)

Only `active: true` items are returned.

Seeded catalog:

| Item | Price | Rarity | Type |
| --- | --- | --- | --- |
| Iron Sword | 200 | common | weapon |
| Magic Potion | 500 | uncommon | potion |
| XP Booster | 750 | epic | booster |
| Golden Crown | 1000 | rare | accessory |
| Legendary Badge | 2000 | legendary | badge |

These are virtual cosmetic/trophy items. `icon` is a frontend asset key (e.g. `iron-sword`).

---

#### `POST /api/shop/items/:id/buy`

Auth: **required**

Body (optional): `{ "quantity": 1 }` — integer 1–50, default 1.

**Price is read from the Item document.** A `price` field in the body is stripped.

Flow:

1. Load item (must be active)
2. Atomically deduct `price * quantity` only if `user.gold >= total`
3. Upsert inventory row and increment quantity
4. If inventory write fails, gold is refunded

Insufficient gold → `400` `"Insufficient gold"` with `details: { required, balance }`.

Response `200`:

```json
{
  "success": true,
  "message": "Item purchased successfully",
  "data": {
    "goldSpent": 200,
    "quantityPurchased": 1,
    "unitPrice": 200,
    "gold": 50,
    "player": { "...": "..." },
    "inventoryItem": {
      "quantity": 1,
      "acquiredAt": "...",
      "item": { "name": "Iron Sword", "price": 200 }
    }
  }
}
```

---

### Inventory

#### `GET /api/inventory`

Auth: **required** — caller's items with populated catalog data.

#### `GET /api/inventory/:itemId`

Auth: **required**. `:itemId` is the **shop item id**. Returns `404` if the player does not own it (also hides other players' inventory).

---

### Achievements

#### `GET /api/achievements`

Auth: **required**

Returns every catalog achievement with `unlocked` and `unlockedAt` for the current player.

The client **cannot** unlock achievements. Evaluation runs after quest completion.

Initial catalog:

| Key | Name | Requirement |
| --- | --- | --- |
| FIRST_QUEST | First Quest | Complete 1 quest |
| QUEST_MASTER | Quest Master | Complete 10 quests |
| QUEST_LEGEND | Quest Legend | Complete 50 quests |
| LEVEL_5 | Level 5 | Reach level 5 |
| LEVEL_10 | Level 10 | Reach level 10 |
| WEEK_WARRIOR | Week Warrior | Reach a 7-day streak (current or longest) |
| GOLD_COLLECTOR | Gold Collector | Earn 1000 **total** gold (lifetime, not current balance) |

---

## 11. Quest system

Players create quests representing real activities. Difficulty is chosen by the player; **rewards are not**. Status `completed` is only set by `POST /api/quests/:id/complete` for `recurrence: none`.

---

## 12. XP system

XP is **cumulative lifetime XP** stored on the user.

```
Level 1 → 0 XP
Level 2 → 1000 XP
Level 3 → 2500 XP
Level 4 → 4500 XP
Level 5 → 7000 XP
```

Formula (level `n` ≥ 2):

```
xpRequired(n) = 500 * (n * (n + 1) / 2 - 1)
```

XP to go from `n` → `n+1` = `500 * (n + 1)`.

`xpProgress` on player payloads:

- `progressPercent` — 0–100 inside the current level (for XP bars)
- `xpToNextLevel` — remaining XP
- `xpForNextLevel` — cumulative threshold of the next level

Implemented in `src/services/xpService.js`.

---

## 13. Level system

After XP is added, `levelService` sets `user.level = levelFromXp(user.xp)`.

Quest-complete payload always includes:

```json
{ "levelUp": true, "oldLevel": 3, "newLevel": 4, "currentXp": 4700 }
```

A player can theoretically gain more than one level from a single completion; `newLevel - oldLevel` is the number of levels gained. With the default reward table, one quest will not skip levels.

---

## 14. Gold system

- Earned only by completing quests (`goldReward` on the quest document).
- Spent only by buying shop items (atomic `gold >= price` update).
- `totalGoldEarned` increases on earn and **does not** decrease on spend (used by Gold Collector).
- Client-supplied gold values are ignored.

---

## 15. Streak system

UTC-day based.

- Completing at least one quest on a UTC day counts as activity.
- Multiple completions the same day do **not** increment again.
- Completing on the next UTC day increments `streak`.
- Missing a **full** UTC day resets current streak. Completing after a gap starts a new streak at 1.
- `longestStreak` never decreases.
- If the player is idle for ≥ 2 UTC days, reads (`/me`, dashboard) persist `streak = 0` so the UI stays honest without a new completion.

Returned as `current`, `longest`, `lastActiveDate`.

---

## 16. Shop

Virtual cosmetic items. Prices live on `Item` documents. Seed with `npm run seed`.

---

## 17. Inventory

One row per `(user, item)` with `quantity`. Buying an owned item increments quantity.

---

## 18. Achievements

Evaluated in `achievementService.evaluateAchievements(user)` after a successful quest completion. Unique `{ userId, achievementId }` prevents double-unlock. Newly unlocked achievements are returned on the complete payload so the UI can celebrate immediately.

---

## 19. Anti-cheat architecture

| Threat | Control |
| --- | --- |
| Fake XP / gold / level | Fields stripped from all bodies; only services mutate them |
| Fake quest rewards | Rewards written from `REWARDS_BY_DIFFICULTY` at create/update |
| Fake item price | Price loaded from Item collection; body `price` deleted |
| Double-complete farming | Unique index on completion `periodKey` + status checks |
| Unlock achievements via API | No such endpoint |
| Access another player's data | Every query scoped by `req.user._id`; mismatch → `403` |
| Stolen password | bcrypt 12 rounds; password `select: false` |
| Reuse after logout | JWT blacklist |
| Auth brute force | Rate limiter on `/api/auth` |
| IDOR via ObjectId | Ownership checks + invalid id → `400` |

The frontend must treat all numeric rewards in **responses** as display values, never as inputs.

---

## 20. Testing

```bash
cd backend
npm test
```

Coverage of the required critical paths:

- Register / login / invalid login / logout
- Create / complete / duplicate complete
- XP reward + level-up
- Gold reward / purchase / insufficient gold
- Access another user's quest
- Manipulate XP, gold, item price from the client
- Daily quest same-day duplicate
- Achievements + dashboard

Automated tests cover the full HTTP API and game services. They run **without a live MongoDB** (an in-memory double is installed in Jest). No `mongod` process is required for `npm test`.

---

## 21. Running the project

```bash
npm install
cp .env.example .env
# start MongoDB
npm run seed
npm run dev     # nodemon, development
npm start       # node src/server.js
npm test
```

API default: `http://localhost:5000`

Listen address is `0.0.0.0` so the server works in containers.

---

## 22. How a frontend developer should connect

1. `POST /api/auth/register` or `/login` → store `data.token` (memory + `localStorage` / httpOnly cookie of your choice).
2. Attach `Authorization: Bearer <token>` to every later request.
3. After login, call `GET /api/user/dashboard` and render the home screen from that payload.
4. Create quests with **title, difficulty, category, recurrence only** — never send XP/gold.
5. On complete, drive UI from `data.rewards`, `data.levelUp`, `data.streak`, `data.achievementsUnlocked`, and `data.player`.
6. Shop: list items → buy by **item `_id` only** → refresh gold from `data.gold` / `data.player`.
7. On `401`, clear the token and route to login.
8. CORS: set `FRONTEND_URL` to the frontend origin (Vite/Next default `http://localhost:3000` or `http://localhost:5173`).

Suggested TypeScript-friendly player type:

```ts
type XpProgress = {
  level: number;
  currentXp: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
};

type Player = {
  id: string;
  name: string;
  email: string;
  level: number;
  xp: number;
  gold: number;
  streak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  totalQuestsCompleted: number;
  totalGoldEarned: number;
  xpProgress: XpProgress;
};
```

---

## Scripts

| Script | Command |
| --- | --- |
| Development | `npm run dev` |
| Production | `npm start` |
| Seed catalog | `npm run seed` |
| Tests | `npm test` |
