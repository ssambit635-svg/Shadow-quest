/**
 * env.mjs — load a local `.env`, because nothing else in this project did.
 *
 * The repository ships a `.env.example` and every doc points at it, but the
 * server only ever read `process.env`: there is no dotenv dependency and
 * `scripts/dev.mjs` passes its own environment straight through. So an
 * operator who followed the instructions, created `.env`, pasted their
 * Google credentials and restarted got an API that still logged
 * "GOOGLE_CLIENT_ID … not configured" — with no hint why.
 *
 * Zero dependencies on purpose. Node's own `--env-file` flag would do, but it
 * has to be passed on every invocation (npm scripts, `npm start`, CI, the
 * platform's start command), and a loader that simply runs cannot be
 * forgotten.
 *
 * Rules that matter:
 *   · a variable that is ALREADY set wins. Hosting platforms inject real
 *     environment, and so do the smoke scripts; a stale local file must never
 *     override either.
 *   · never logs values. It prints the KEYS it picked up, which is enough to
 *     confirm the file was read without putting a secret in a log.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Candidates, in priority order: repo root first, then server/. */
const CANDIDATES = [
  path.resolve(HERE, "..", "..", ".env"),
  path.resolve(HERE, "..", ".env"),
  path.resolve(process.cwd(), ".env"),
];

/**
 * Parse one `.env` body. Deliberately small: KEY=VALUE per line, `#` comments,
 * optional surrounding quotes, `export ` prefix tolerated. No interpolation,
 * no multi-line values — the variables this project uses are all one-liners,
 * and a fuller parser is more surface than value.
 */
export function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq < 1) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1);
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** Load the first `.env` that exists. Existing environment always wins. */
export function loadEnv(files = CANDIDATES) {
  const file = files.find((f) => {
    try {
      return existsSync(f);
    } catch {
      return false;
    }
  });
  if (!file) return { file: null, applied: [] };

  let parsed;
  try {
    parsed = parseEnv(readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`[env] could not read ${file}: ${err.message}`);
    return { file, applied: [] };
  }

  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined) continue; // real environment wins
    process.env[key] = value;
    applied.push(key);
  }

  if (applied.length) {
    console.log(`[env] ${path.relative(process.cwd(), file) || file}: ${applied.join(", ")}`);
  } else {
    console.log(`[env] ${path.relative(process.cwd(), file) || file}: nothing new (environment already set)`);
  }
  return { file, applied };
}

loadEnv();
