# Shadow-quest — LifeRPG

LifeRPG is a productivity RPG: real-life tasks become **quests**. Completing them awards **XP** and **gold**, builds **streaks**, unlocks **achievements**, and lets players spend gold in a virtual **shop**.

This repository currently ships the **complete backend**. A separate frontend can be built against the documented REST API.

## Quick start

```bash
npm install
cd backend
cp .env.example .env
# start MongoDB (local or: cd backend && docker compose up -d)
npm run seed
npm run dev
```

From the repo root after `npm install`:

```bash
npm run dev    # API on http://localhost:5000
npm test
npm run seed
```

Full architecture, every endpoint, game rules, and anti-cheat notes:

**[backend/README.md](backend/README.md)**

## Stack

Node.js · Express · MongoDB / Mongoose · JWT · bcryptjs

## Gameplay loop

```
Register → Login → Dashboard → Create Quest → Complete Quest
  → XP + Gold + Streak + Level-up + Achievements
  → Shop → Inventory → History
```
