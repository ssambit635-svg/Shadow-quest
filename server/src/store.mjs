/**
 * store.mjs — one storage interface, two honest implementations.
 *
 *   MongoStore — the real thing. Connects to MONGODB_URI with the official
 *                driver; one document per operator in `users`, ledger embedded.
 *   FileStore  — the fallback when no MongoDB is configured/reachable. The
 *                same documents, persisted to a JSON file on disk. This is a
 *                persistence fallback for dev previews, NOT mock data: it only
 *                ever stores what real operators submit.
 *
 * Everything upstream of this module is storage-agnostic.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const TOKEN_BYTES = 24;

export const newToken = () => randomBytes(TOKEN_BYTES).toString("base64url");
export const newId = () => `u_${randomBytes(9).toString("base64url")}`;

/** Strip private fields before a document leaves the server. */
export function publicUser(u) {
  const { token, _id, ...rest } = u;
  return rest;
}

/* ------------------------------------------------------------------ *
 * Mongo
 * ------------------------------------------------------------------ */

async function mongoStore(uri, dbName) {
  // Imported lazily so a broken/missing driver never kills the file fallback.
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    appName: "shadowquest",
  });
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ token: 1 });

  return {
    kind: "mongo",

    async byEmail(email) {
      return await users.findOne({ email });
    },

    async byToken(token) {
      if (!token) return null;
      return await users.findOne({ token });
    },

    async upsertSignIn(email, handle) {
      const now = Date.now();
      const token = newToken();
      const filter = { email };
      const update = {
        $set: { handle, token, lastSeenAt: now },
        $setOnInsert: { id: newId(), email, createdAt: now, profile: null, tasks: [], habits: [], updatedAt: 0 },
      };
      await users.updateOne(filter, update, { upsert: true });
      return await users.findOne({ email });
    },

    async touch(email) {
      await users.updateOne({ email }, { $set: { lastSeenAt: Date.now() } });
    },

    async saveLedger(email, { profile, tasks, habits }) {
      const updatedAt = Date.now();
      await users.updateOne(
        { email },
        { $set: { profile, tasks, habits, updatedAt } },
      );
      return updatedAt;
    },

    async all() {
      return await users
        .find({})
        .project({ token: 0 })
        .sort({ updatedAt: -1 })
        .limit(500)
        .toArray();
    },

    async close() {
      await client.close();
    },
  };
}

/* ------------------------------------------------------------------ *
 * File (dev fallback)
 * ------------------------------------------------------------------ */

async function fileStore(filePath) {
  let data = { users: [] };
  try {
    data = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(data.users)) data = { users: [] };
  } catch {
    /* first boot — nothing on disk yet */
  }

  let flushTimer = null;
  const flush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.tmp`;
        await writeFile(tmp, JSON.stringify(data), "utf8");
        await rename(tmp, filePath);
      } catch (err) {
        console.error("[store] file flush failed:", err.message);
      }
    }, 250);
  };

  const find = (pred) => data.users.find(pred) ?? null;

  return {
    kind: "file",

    async byEmail(email) {
      return find((u) => u.email === email);
    },

    async byToken(token) {
      return token ? find((u) => u.token === token) : null;
    },

    async upsertSignIn(email, handle) {
      let u = find((x) => x.email === email);
      const now = Date.now();
      if (!u) {
        u = {
          id: newId(),
          email,
          handle,
          token: newToken(),
          createdAt: now,
          lastSeenAt: now,
          profile: null,
          tasks: [],
          habits: [],
          updatedAt: 0,
        };
        data.users.push(u);
      } else {
        u.handle = handle;
        u.token = newToken();
        u.lastSeenAt = now;
      }
      flush();
      return u;
    },

    async touch(email) {
      const u = find((x) => x.email === email);
      if (u) {
        u.lastSeenAt = Date.now();
        flush();
      }
    },

    async saveLedger(email, { profile, tasks, habits }) {
      const u = find((x) => x.email === email);
      if (!u) throw new Error("unknown operator");
      u.profile = profile;
      u.tasks = tasks;
      u.habits = habits;
      u.updatedAt = Date.now();
      flush();
      return u.updatedAt;
    },

    async all() {
      return data.users.map((u) => {
        const { token, ...rest } = u;
        return rest;
      });
    },

    async close() {
      /* nothing to close */
    },
  };
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/**
 * Pick the store. MONGODB_URI set and reachable → Mongo. Anything else logs
 * the reason and degrades to the file store so the API keeps serving real
 * data instead of refusing to boot.
 */
export async function createStore() {
  const uri = (process.env.MONGODB_URI ?? "").trim();
  const db = (process.env.MONGODB_DB ?? "shadowquest").trim() || "shadowquest";
  if (uri) {
    try {
      const store = await mongoStore(uri, db);
      console.log(`[store] connected to MongoDB (db: ${db})`);
      return store;
    } catch (err) {
      console.warn(
        `[store] MongoDB unreachable (${err.message}) — falling back to the file store`,
      );
    }
  } else {
    console.warn("[store] MONGODB_URI not set — using the file store (set MONGODB_URI for production)");
  }
  const dataDir = process.env.SQ_DATA_DIR ?? path.join(process.cwd(), ".data");
  return await fileStore(path.join(dataDir, "db.json"));
}
