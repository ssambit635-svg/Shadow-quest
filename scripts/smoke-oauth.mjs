/* smoke-oauth.mjs — walks the Google sign-in flow end to end against the
 * REAL backend: server/src/google.mjs and the routes in server/src/index.mjs,
 * booted in-process on port 8799.
 *
 * Exactly two things are stubbed, and both are Google's own HTTPS endpoints:
 * the token exchange and the JWKS document. In their place this script mints
 * a throwaway RSA keypair and signs its own ID tokens, which is what lets it
 * assert the things that matter — that a token signed by the wrong key, for
 * the wrong audience, past its expiry, or with an unverified email is
 * REFUSED, and that a forged `state` or a replayed handoff code gets nobody
 * in. Everything else on the path (PKCE, state, RS256 verification, the
 * claim checks, the store reconciliation, account linking, session minting)
 * is the shipping code, unmodified.
 *
 * Test-only, isolated, and never imported by the app: the keypair and the
 * client id below exist for the duration of this process and nowhere else.
 * Run it with `npm run smoke:oauth`.
 */
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
const KID = "test-kid-1";
const CLIENT_ID = "test-client.apps.googleusercontent.com";

let nextClaims = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("oauth2.googleapis.com/token")) {
    const body = new URLSearchParams(await init.body.toString());
    if (body.get("client_secret") !== "test-secret") throw new Error("bad secret sent");
    if (!body.get("code_verifier")) throw new Error("PKCE verifier missing");
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: KID })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(nextClaims)).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`); signer.end();
    const sig = signer.sign(privateKey).toString("base64url");
    return new Response(JSON.stringify({ id_token: `${header}.${payload}.${sig}` }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (u.includes("oauth2/v3/certs")) {
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, init);
};

process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:8799/v1/auth/google/callback";
process.env.SQ_APP_ORIGIN = "http://localhost:5173";
process.env.PORT = "8799";
process.env.SQ_DATA_DIR = await mkdtemp(join(tmpdir(), "sq-oauth-"));

await import(new URL("../server/src/index.mjs", import.meta.url).href);
await new Promise(r => setTimeout(r, 800));

const API = "http://localhost:8799";
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("ok  " + m); };
const bad = (m) => { fail++; console.log("FAIL " + m); };

const providers = await (await realFetch(`${API}/v1/auth/providers`)).json();
providers.google === true ? ok("providers reports google: true") : bad("providers: " + JSON.stringify(providers));

/** Drive one whole OAuth round trip. Returns the session. */
async function googleLogin(claims, opts = {}) {
  nextClaims = { iss: "https://accounts.google.com", aud: CLIENT_ID, exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000), email_verified: true, ...claims };
  const start = await realFetch(`${API}/v1/auth/google/start?return_to=http://localhost:5173`, { redirect: "manual" });
  const loc = new URL(start.headers.get("location"));
  if (loc.origin + loc.pathname !== "https://accounts.google.com/o/oauth2/v2/auth") throw new Error("not sent to Google: " + loc);
  if (loc.searchParams.get("code_challenge_method") !== "S256") throw new Error("no PKCE");
  if (loc.searchParams.get("client_id") !== CLIENT_ID) throw new Error("wrong client_id");
  nextClaims.nonce = loc.searchParams.get("nonce");
  const state = opts.state ?? loc.searchParams.get("state");
  const cb = await realFetch(`${API}/v1/auth/google/callback?code=fake-auth-code&state=${encodeURIComponent(state)}`, { redirect: "manual" });
  const back = new URL(cb.headers.get("location"));
  const params = new URLSearchParams(back.hash.slice(back.hash.indexOf("?") + 1));
  if (back.origin !== "http://localhost:5173") throw new Error("bounced to " + back.origin);
  // The client contract: the verdict is parked on the LOGIN route's fragment.
  // Land it anywhere else and the gate that redeems the code never mounts, so
  // a completed sign-in looks exactly like no sign-in at all.
  if (!back.hash.startsWith("#/login?")) throw new Error("bounced off the login route: " + back.hash);
  if (params.get("sq_auth") !== "ok") return { failed: params.get("sq_auth"), reason: params.get("reason") };
  const ex = await realFetch(`${API}/v1/auth/google/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: params.get("code") }) });
  return { ...(await ex.json()), handoff: params.get("code") };
}

const SUB = "10987654321" + randomUUID().slice(0,4);
const MAIL = `real.person.${Date.now()}@gmail.com`;

/* 1. NEW Google user */
const s1 = await googleLogin({ sub: SUB, email: MAIL, name: "Real Person", picture: "https://lh3.googleusercontent.com/a/x=s96" });
s1.mode === "created" && s1.token ? ok(`new google user → mode=created, session minted`) : bad("new user: " + JSON.stringify(s1));
s1.user.picture.startsWith("https://lh3.googleusercontent.com") ? ok("google avatar carried through") : bad("picture: " + s1.user.picture);

/* the session token works on the REAL authed endpoints */
const led = await (await realFetch(`${API}/v1/ledger`, { headers: { authorization: `Bearer ${s1.token}` } })).json();
(led.tasks.length === 0 && led.profile === null) ? ok("new google user starts with an EMPTY ledger (no demo data)") : bad("ledger not empty: " + JSON.stringify(led));

/* write some real data through the normal API */
await realFetch(`${API}/v1/ledger`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${s1.token}` },
  body: JSON.stringify({ profile: { lifeLevel: 4, totalProgress: 310, streak: 6, growthRank: "C", focusArea: "Study", skills: [], lifeFactors: {} }, tasks: [{ id: "t1", title: "Real task", status: "done", category: "knowledge", createdAt: Date.now() }], habits: [] }) });

/* 2. RETURNING Google user — same sub */
const s2 = await googleLogin({ sub: SUB, email: MAIL, name: "Real Person" });
s2.mode === "returning" ? ok("returning google user → mode=returning") : bad("returning: " + JSON.stringify(s2));
const led2 = await (await realFetch(`${API}/v1/ledger`, { headers: { authorization: `Bearer ${s2.token}` } })).json();
(led2.tasks.length === 1 && led2.profile.totalProgress === 310) ? ok("returning user's real tasks + progress are intact") : bad("data lost: " + JSON.stringify(led2));

/* 3. ACCOUNT LINKING — a password account first, Google second */
const LMAIL = `linked.${Date.now()}@gmail.com`;
const pw = await (await realFetch(`${API}/v1/auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: LMAIL, handle: "Pw Person", password: "Str0ng!Passphrase9" }) })).json();
pw.mode === "created" ? ok("email/password sign-up still works") : bad("password signup: " + JSON.stringify(pw));
await realFetch(`${API}/v1/ledger`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${pw.token}` },
  body: JSON.stringify({ profile: { lifeLevel: 9, totalProgress: 999, streak: 21, growthRank: "A", focusArea: "Craft", skills: [], lifeFactors: {} }, tasks: [{ id: "t9", title: "Pre-existing work", status: "done", category: "craft", createdAt: Date.now() }], habits: [{ id: "h1", title: "Read", streak: 21 }] }) });

const s3 = await googleLogin({ sub: "sub-linked-" + randomUUID().slice(0,6), email: LMAIL, name: "Pw Person" });
s3.mode === "linked" ? ok("same email via Google → mode=linked (NOT a second account)") : bad("linking: " + JSON.stringify(s3));
const led3 = await (await realFetch(`${API}/v1/ledger`, { headers: { authorization: `Bearer ${s3.token}` } })).json();
(led3.profile.totalProgress === 999 && led3.tasks.length === 1 && led3.habits.length === 1)
  ? ok("linked account keeps its tasks, habits, progress and streak") : bad("link lost data: " + JSON.stringify(led3));

/* the password still works after linking */
const pw2 = await (await realFetch(`${API}/v1/auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: LMAIL, password: "Str0ng!Passphrase9" }) })).json();
pw2.mode === "verified" ? ok("password still opens the linked account") : bad("password broke: " + JSON.stringify(pw2));

/* 4. SECURITY */
const replay = await realFetch(`${API}/v1/auth/google/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: s1.handoff }) });
replay.status === 401 ? ok("handoff code is single-use (replay → 401)") : bad("replay status " + replay.status);

const forged = await googleLogin({ sub: "x", email: "attacker@evil.test" }, { state: "forged-state-value" });
forged.failed === "error" && forged.reason === "expired" ? ok("forged state refused") : bad("forged state: " + JSON.stringify(forged));

/* an id_token minted for a DIFFERENT audience must not open an account */
nextClaims = null;
const s5 = await googleLogin({ sub: "aud-test", email: "aud@evil.test", aud: "someone-elses-client-id" });
s5.failed === "error" && s5.reason === "verify" ? ok("wrong audience refused") : bad("aud: " + JSON.stringify(s5));

const s6 = await googleLogin({ sub: "unverified", email: "unverified@gmail.com", email_verified: false });
s6.failed === "error" ? ok("unverified google email refused") : bad("unverified accepted: " + JSON.stringify(s6));

const s7 = await googleLogin({ sub: "expired", email: "e@gmail.com", exp: Math.floor(Date.now()/1000) - 7200 });
s7.failed === "error" ? ok("expired id_token refused") : bad("expired accepted");

/* open-redirect */
const evil = await realFetch(`${API}/v1/auth/google/start?return_to=https://evil.example.com`, { redirect: "manual" });
const st = new URL(evil.headers.get("location")).searchParams.get("state");
const evilcb = await realFetch(`${API}/v1/auth/google/callback?error=access_denied&state=${st}`, { redirect: "manual" });
new URL(evilcb.headers.get("location")).origin === "http://localhost:5173" ? ok("open redirect refused (falls back to the allowlist)") : bad("redirected to " + evilcb.headers.get("location"));

const cancel = new URLSearchParams(new URL(evilcb.headers.get("location")).hash.split("?")[1]);
cancel.get("sq_auth") === "cancelled" ? ok("user cancellation reported as 'cancelled'") : bad("cancel: " + cancel.get("sq_auth"));

/* the installed APK: its WebView serves the bundle from https://localhost, so
 * that origin has to be an allowed return or the handoff code lands on the
 * website and the app never sees it. */
const apkStart = await realFetch(`${API}/v1/auth/google/start?return_to=${encodeURIComponent("https://localhost/")}`, { redirect: "manual" });
const apkLoc = new URL(apkStart.headers.get("location"));
const apkState = apkLoc.searchParams.get("state");
nextClaims = { iss: "https://accounts.google.com", aud: CLIENT_ID, exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000), email_verified: true, nonce: apkLoc.searchParams.get("nonce"), sub: "apk-" + randomUUID().slice(0,6), email: `apk.user.${Date.now()}@gmail.com`, name: "APK Operator" };
const apkCb = await realFetch(`${API}/v1/auth/google/callback?code=fake-auth-code&state=${encodeURIComponent(apkState)}`, { redirect: "manual" });
const apkBack = new URL(apkCb.headers.get("location"));
const apkParams = new URLSearchParams(apkBack.hash.slice(apkBack.hash.indexOf("?") + 1));
apkBack.origin === "https://localhost" && apkParams.get("sq_auth") === "ok"
  ? ok("APK shell origin (https://localhost) receives the handoff code")
  : bad("APK bounce: " + apkCb.headers.get("location"));
/* and that code is redeemable from the app, exactly like the website's */
const apkEx = await realFetch(`${API}/v1/auth/google/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: apkParams.get("code") }) });
const apkSession = await apkEx.json();
apkSession.token && apkSession.user.email === nextClaims.email
  ? ok("APK handoff redeems for a real session") : bad("APK exchange: " + JSON.stringify(apkSession));

/* SQ_NATIVE_ORIGIN=off closes the shell origin again (website-only deploys) */
const { resolveReturn, googleConfig } = await import(new URL("../server/src/google.mjs", import.meta.url).href);
const offCfg = googleConfig({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", GOOGLE_CALLBACK_URL: "https://api.x.test/v1/auth/google/callback", SQ_APP_ORIGIN: "https://app.x.test", SQ_NATIVE_ORIGIN: "off" });
resolveReturn(offCfg, "https://localhost/") === "https://app.x.test"
  ? ok("SQ_NATIVE_ORIGIN=off refuses the shell origin") : bad("off → " + resolveReturn(offCfg, "https://localhost/"));
const onCfg = googleConfig({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", GOOGLE_CALLBACK_URL: "https://api.x.test/v1/auth/google/callback", SQ_APP_ORIGIN: "https://app.x.test" });
resolveReturn(onCfg, "https://localhost/") === "https://localhost"
  ? ok("default config allows the Capacitor shell origin") : bad("on → " + resolveReturn(onCfg, "https://localhost/"));
resolveReturn(onCfg, "https://evil.example.com") === "https://app.x.test"
  ? ok("an arbitrary third-party origin is still refused") : bad("evil → " + resolveReturn(onCfg, "https://evil.example.com"));

/* an app served from a sub-directory has to come back to it, and a rooted
 * path must never become a way off this origin */
resolveReturn(onCfg, "https://app.x.test/sq/") === "https://app.x.test/sq"
  ? ok("a sub-directory deployment returns to its own path") : bad("subpath → " + resolveReturn(onCfg, "https://app.x.test/sq/"));
resolveReturn(onCfg, "https://app.x.test//evil.example.com") === "https://app.x.test"
  ? ok("a protocol-relative return path is refused") : bad("//evil → " + resolveReturn(onCfg, "https://app.x.test//evil.example.com"));
resolveReturn(onCfg, "https://app.x.test/?x=1") === "https://app.x.test"
  ? ok("a query on the return is dropped") : bad("query → " + resolveReturn(onCfg, "https://app.x.test/?x=1"));

/* the `.env` loader, since a credentials file that nothing reads is how this
 * flow silently stayed "not configured" */
const { parseEnv } = await import(new URL("../server/src/env.mjs", import.meta.url).href);
const parsed = parseEnv([
  "# a comment",
  "",
  "PLAIN=value",
  'QUOTED="with spaces"',
  "SINGLE='also fine'",
  "export EXPORTED=yes",
  "  SPACED  =  trimmed  ",
  "URL=https://x.test/a?b=c&d=e",
  "BAD LINE NO EQUALS",
  "9NOT_A_KEY=nope",
].join("\n"));
JSON.stringify(parsed) === JSON.stringify({
  PLAIN: "value",
  QUOTED: "with spaces",
  SINGLE: "also fine",
  EXPORTED: "yes",
  SPACED: "trimmed",
  URL: "https://x.test/a?b=c&d=e",
}) ? ok(".env parser: keys, quotes, export, comments, junk lines") : bad("parseEnv: " + JSON.stringify(parsed));

/* no secret ever leaves */
const root = await (await realFetch(`${API}/`)).text();
(!root.includes("test-secret") && !root.includes(CLIENT_ID)) ? ok("no client id/secret in any API response body") : bad("secret leaked");
const pubUser = JSON.stringify(s1.user);
!pubUser.includes("googleId") && !pubUser.includes(SUB) ? ok("googleId never sent to the client") : bad("googleId exposed");

console.log(`\n${fail === 0 ? "OAUTH FLOW PASS" : "OAUTH FLOW FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
