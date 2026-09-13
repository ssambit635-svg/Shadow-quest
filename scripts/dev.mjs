#!/usr/bin/env node
/**
 * dev.mjs — one command, both halves of ShadowQuest.
 *
 *   npm run dev
 *
 * starts the data API (server/, :8788) and the site (vite, :5173) together.
 *
 * Why this exists: `npm run dev` used to start vite alone, and vite only
 * *proxies* /api to :8788. Open the site without a second terminal running
 * the API and every proxied call fails — which is exactly how the Milestones
 * screen ended up painting "milestones unreachable" over a perfectly good
 * page. Now the two processes are one, so a preview is never half-started.
 *
 * Details worth knowing:
 *   · the API is only started when :8788 is not already answering, so running
 *     this twice (or beside a manually started API) does not fight for a port
 *   · server/node_modules is installed on demand the first time
 *   · Ctrl-C tears both processes down; if one dies, the other follows
 *   · SQ_SKIP_API=1 starts vite alone (API hosted somewhere else)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "server");
const API_PORT = Number(process.env.PORT ?? 8788);
const SKIP_API = process.env.SQ_SKIP_API === "1";

const tag = (label, color) => (line) => {
  if (!line.trim()) return;
  process.stdout.write(`\x1b[${color}m[${label}]\x1b[0m ${line}\n`);
};
const apiLog = tag("api", "36");
const webLog = tag("web", "35");
const devLog = tag("dev", "90");

/** True when something already answers on the API port. */
function portBusy(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (busy) => {
      sock.destroy();
      resolve(busy);
    };
    sock.setTimeout(700);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  // Give them a beat to exit cleanly, then stop holding the terminal open.
  setTimeout(() => process.exit(code), 300).unref?.();
}

/** Pipe a child's output through a labelled line prefix. */
function pipe(child, log) {
  const split = (buf, carry) => {
    const lines = (carry + buf.toString()).split("\n");
    const rest = lines.pop() ?? "";
    for (const line of lines) log(line.replace(/\r$/, ""));
    return rest;
  };
  let out = "";
  let err = "";
  child.stdout?.on("data", (b) => {
    out = split(b, out);
  });
  child.stderr?.on("data", (b) => {
    err = split(b, err);
  });
  child.on("exit", () => {
    if (out) log(out);
    if (err) log(err);
  });
}

function run(label, command, args, opts, log) {
  const child = spawn(command, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  pipe(child, log);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    devLog(`${label} stopped (${signal ?? `exit ${code}`}) — taking the rest down`);
    shutdown(code ?? 1);
  });
  return child;
}

process.on("SIGINT", () => {
  devLog("interrupted");
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));

/* ---------------------------------------------------------- the API */

if (!SKIP_API) {
  if (await portBusy(API_PORT)) {
    devLog(`:8788 already answering — reusing the running API`);
  } else {
    if (!existsSync(path.join(SERVER, "node_modules"))) {
      devLog("installing server dependencies (first run)…");
      const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: SERVER,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (install.status !== 0) {
        console.error("[dev] could not install server dependencies");
        process.exit(install.status ?? 1);
      }
    }
    run(
      "api",
      process.execPath,
      ["src/index.mjs"],
      { cwd: SERVER, env: { ...process.env, PORT: String(API_PORT) } },
      apiLog,
    );
  }
} else {
  devLog("SQ_SKIP_API=1 — starting the site alone");
}

/* ---------------------------------------------------------- the site */

const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteBin)) {
  console.error("[dev] vite is not installed — run `npm install` first");
  process.exit(1);
}

run(
  "web",
  process.execPath,
  [viteBin, "--host", "0.0.0.0"],
  { cwd: ROOT, env: { ...process.env, SQ_BACKEND_URL: process.env.SQ_BACKEND_URL ?? `http://127.0.0.1:${API_PORT}` } },
  webLog,
);
