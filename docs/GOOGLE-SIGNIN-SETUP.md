# Google Sign-In for ShadowQuest — the whole thing, click by click

You do **Part 1** in the Google Cloud console (10 minutes of clicking). You hand
me three strings. I do **Part 2** (every file and env var). You watch it work.

---

## The 3 things you need to end up with

| value | looks like | who handles it |
| --- | --- | --- |
| Client ID | `1234567890-abc123….apps.googleusercontent.com` | you copy it → me (safe to paste) |
| Client secret | `GOCSPX-…` | you copy it → **only** into a `.env` / host dashboard, never chat or git |
| Your two URLs | `https://your-site.com` and the API host | you tell me |

That's it. Everything below is just how to get those.

---

## Part 1 — Google Cloud console

### 1 · Sign in
`console.cloud.google.com` with the Google account you want to sign in with.
The "$300 free credits" banner is a sales offer — **you can ignore it.** A
project and an OAuth client are free. Only if the console *forces* billing to
create a project do you click **Start free** (asks for a card, won't charge).

### 2 · Create a project
Paste in the address bar:
```
https://console.cloud.google.com/projectcreate
```
Project name: `shadowquest`. Leave organization as-is. Click **CREATE**.
A notification pops when it's ready (a few seconds).

### 3 · Open the Auth Platform
Paste:
```
https://console.cloud.google.com/auth/overview
```
Make sure the top-left project selector shows **shadowquest**.
Click **Get started** if a wizard button appears.

You'll get a 4-step wizard:

| step | what to put |
| --- | --- |
| App information | App name `ShadowQuest`; a support email (your own) |
| Audience | **External** ← the one real decision. *Internal* only works for a Workspace org |
| Contact information | your email |
| Finish | click **Create** |

### 4 · Add yourself as a test user (do NOT skip)
While the app is in *Testing* mode, **only listed emails can sign in** — anyone
else gets `Error 403: access_denied`, which looks like a broken login.

- Left menu **Audience** tab → **Test users** → **+ Add users**
- Type your Gmail address, **Save**.

### 5 · Add the scopes
- **Data access** tab → **Add or remove scopes**
- Tick `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile` (all
  *non-sensitive* → no Google review) → **Update** → **Save**.

### 6 · Create the OAuth client
- **Clients** tab → **+ Create Client**
- Application type: **Web application**
- Name: `shadowquest-web`

**Authorized JavaScript origins** (one per line):
```
https://YOUR-SITE-HERE
https://5173-iax6tiuvi3trwuencu3h3.e2b.app
```

**Authorized redirect URIs** (one per line):
```
https://5173-iax6tiuvi3trwuencu3h3.e2b.app/api/v1/auth/google/callback
https://YOUR-API-HOST/v1/auth/google/callback
```
The second line is your production API — same string you'll put in
`GOOGLE_CALLBACK_URL`, character for character. The first line is this sandbox
so you can test live before touching production.

Click **CREATE**.

### 7 · Copy the two values
A dialog shows the **Client ID** and **Client secret**. The secret is shown
**once** — copy both somewhere safe now (or **Download JSON**).

---

## Part 2 — I wire it up (you just hand me the strings)

**Sandbox (this preview):** give me the Client ID and put the secret in a `.env`
here (I'll create it; it's gitignored). I set `GOOGLE_CALLBACK_URL` to the
sandbox redirect URI above and `SQ_APP_ORIGIN` to the preview origin, restart,
and run a real sign-in so you can watch it.

**Website:** on the host that runs `server/`, set:
```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
GOOGLE_CALLBACK_URL=https://YOUR-API-HOST/v1/auth/google/callback
SQ_APP_ORIGIN=https://YOUR-SITE-HERE
```
The server now reads these from a root `.env` too (`server/src/env.mjs`).

**APK:** set the repository *variable* `VITE_API_BASE_URL=https://YOUR-API-HOST`
(Settings → Secrets and variables → Actions → Variables) and rebuild. Without it
the app honestly says "This app build has no API address…".

---

## Part 3 — verify

```bash
curl -s https://YOUR-API-HOST/v1/auth/providers   # want: {"password":true,"google":true}
```
Startup log should show `[env] …` then `[google] OAuth enabled — callback …`.

---

## When it still says no — read the Google error, not ours

| Google says | what it actually means | fix |
| --- | --- | --- |
| `redirect_uri_mismatch` | callback URL ≠ an authorized redirect URI, by even one character | make `GOOGLE_CALLBACK_URL` exactly equal a listed redirect URI (protocol, host, port, path) |
| `Error 403: access_denied` / `access_blocked` | app is in Testing and the Gmail isn't a test user | add that email under Audience → Test users |
| `Error 401: invalid_client` | secret is wrong / revoked | re-copy the secret, or issue a new one (Clients → client → rotate) |
| our app: "not configured" | env didn't reach the server | check the `[env]` line in the log; confirm the four vars are set where the process actually runs |
| our app: "no API address" (APK) | built without `VITE_API_BASE_URL` | set the variable and rebuild |
| **nothing** — you chose your account, pressed Continue, and the app shows the sign-in screen again | the return URL was not read as the **login route**, so the gate that redeems the one-time code never mounted and the code expired unread | this is fixed in `src/lib/route.ts`; prove it with `npm run smoke:return` |

---

## The return contract (why "Google worked but I'm still signed out" happened)

The backend's last step is a redirect to

```
https://YOUR-SITE/#/login?sq_auth=ok&code=<one-time handoff>
```

Two things have to be true for that to sign anybody in:

1. **The fragment's query is routing metadata, not part of the destination.**
   `#/login?sq_auth=ok&code=…` is the `login` route. The shell used to match
   fragments by exact string, read this as the *landing page*, and the gate —
   the only component that calls `readGoogleReturn()` — never mounted. Google
   had done its job, the backend had verified the ID token and minted a
   session, and the operator was shown the sign-in screen again with no error
   anywhere to explain it. `lib/route.ts` now drops the query before matching,
   and `App.tsx` sends any URL carrying `sq_auth` to the gate whatever else the
   fragment says (`hasGoogleReturn()`).
2. **Nothing may rewrite the URL before the gate reads it.** The handoff code
   is single-use and lives only in the address bar, so the APK's boot redirect
   (`go(…, { replace: true })`) skipped it and `go()` refuses to run at all
   while a return is parked.

`npm run smoke:return` renders the real `App.tsx` at that exact bounce address
and asserts the operator ends up inside `#/app`, signed in as the identity the
server verified — website and APK, plus the spent-code and no-return cases.
