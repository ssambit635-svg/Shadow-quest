# Assumed API contract — reconcile this against `Api.md`

The spec never reached the sandbox, so the client was written against the
contract below. **Nothing outside `src/api/` knows HTTP exists**, so replacing
these assumptions is a two-file edit (`types.ts` for field names, `client.ts`
for paths + mappers).

## Selection

`src/api/index.ts` picks the transport:

| condition | transport |
| --- | --- |
| `VITE_API_BASE_URL` set, `VITE_API_MODE` unset or `http` | `httpTransport()` |
| anything else | `mockTransport()` — the in-page duel engine |

Copy `.env.example` → `.env`, set the base URL, and the whole app switches.
`IS_MOCK` is read by the nav and the ladder so mock numbers can never be
mistaken for the live ladder.

## Endpoints assumed

| method + path | used by | expected response |
| --- | --- | --- |
| `POST /v1/sessions` | nav handle chip | `{ handle, token, ranked }` |
| `GET /v1/shadows` | roster, lobby chips | `{ items: Shadow[] }` or a bare array |
| `GET /v1/leaderboard` | ladder section | `{ items: LeaderRow[] }` or a bare array |
| `POST /v1/quests` | "Open the field" | `QuestState` |
| `POST /v1/quests/by-code/{code}/join` | "answer a call" | `QuestState` |
| `GET /v1/quests/{id}` | polling fallback | `QuestState` |
| `POST /v1/quests/{id}/moves` | the four verbs | `QuestState` |
| `POST /v1/quests/{id}/forfeit` | concede | `QuestState` |
| `GET /v1/quests/{id}/events` | SSE (`text/event-stream`, one `QuestState` per `data:` frame) | stream |

## Shape the UI actually reads

```ts
QuestState {
  id, code, phase, round, you,
  turnClockMs, turnLimitMs,
  combatants: [{ seat, shadowId, displayName, hp, hpMax, ki, guard, active }],
  log: [{ id, turn, kind, text, fx?: { target, amount, type } }],
  winner?, note?
}
```

Required semantics, in priority order:

1. **`you`** — which seat is ours. The HUD cannot infer it from `active`
   (that flips each turn) and will not guess. Without it the panels can't be
   labelled.
2. **`phase`** — one of `lobby | awaiting | stance | resolving | victory |
   defeat`. Drives input locking and the result banner.
3. **`log[].fx`** — `{ target, amount, type: cut|block|miss }`. Purely
   optional: absent fx means the HUD still works, it just doesn't flinch. This
   is the only field the animation layer depends on.
4. **`log[].text`** — pre-written sentences. The UI deliberately does **not**
   assemble copy from numbers, so the server can change fight text without a
   client deploy.
5. **`turnClockMs`** — authoritative clock from the server. The client never
   runs its own countdown; it renders what it is told and re-renders as it
   changes.

## Mapping table already handled

Mappers in `client.ts` accept obvious naming variants so a small mismatch
degrades instead of white-screening:

| UI field | also accepts |
| --- | --- |
| `Shadow.id` | `shadow_id`, `slug` |
| `Shadow.kanji` | `sigil`, `emblem` |
| `stats.cut / guard / speed / ki` | `attack / defense / agility / magic` |
| `code` | `join_code` |
| `round` | `turn_number` |
| `turnClockMs` | `time_remaining_ms` |
| `you` | `local_seat`, `you_seat` |
| `log` | `events` |
| `log[].text` | `message` |

## To finish the wiring

1. Paste `Api.md` (inline, or drop it in the repo — uploads did not land).
2. Rewrite `ENDPOINTS` in `client.ts`, then the mappers.
3. If auth is a bearer token, add it in `req()`'s headers — one function.
4. If the API is a REST-only snapshot with no stream, delete the `EventSource`
   branch; the 1s poll fallback already renders correctly.
