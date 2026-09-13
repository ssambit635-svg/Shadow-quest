/**
 * Admin.tsx — the control panel. For the owner of the app, and no one else.
 *
 * Access is decided twice, on purpose:
 *
 *   1. the shell only mounts this screen for a signed-in operator whose
 *      role the *backend* granted at sign-in (a hand-edited local record
 *      can at most render the "sealed" notice — see below), and
 *   2. every call from here carries a PIN-minted admin token, held in
 *      sessionStorage so it dies with the tab. The backend re-checks the
 *      email against ADMIN_EMAILS and the token against its in-memory
 *      vault on every single request.
 *
 * What the owner can do from here: read the real numbers (users, activity,
 * sign-ups), see the operator directory — emails included, admin eyes only —
 * remove an operator, and revoke every active session at once.
 */
import { useEffect, useRef, useState } from "react";
import type { User } from "../lib/auth";
import { Sigil } from "../components/Sigil";
import {
  adminDeleteUser,
  adminRevokeAllSessions,
  clearAdminToken,
  elevateAdmin,
  fetchAdminOverview,
  fetchAdminUsers,
  storedAdminToken,
  type AdminOverview,
  type AdminUserRow,
} from "../api/ledger";
import { gsap, REDUCED } from "../lib/motion";

const fmtDate = (ms: number) =>
  ms > 0
    ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "—";

const fmtAgo = (ms: number) => {
  if (!ms) return "never";
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export function Admin({ user, scope }: { user: User; scope: string }) {
  const rootRef = useRef<HTMLElement>(null);

  if (user.role !== "admin") {
    return (
      <section className="admin section" ref={rootRef}>
        <div className="admin__seal">
          <Sigil size={40} />
          <h2 className="admin__seal-t">This gate is sealed.</h2>
          <p className="admin__seal-s">
            The control panel belongs to the owner of this ShadowQuest — the
            admin role is granted by the backend, not by this device.
          </p>
        </div>
      </section>
    );
  }

  return <Console scope={scope} />;
}

function Console({ scope }: { scope: string }) {
  const [elevated, setElevated] = useState<boolean>(() => Boolean(storedAdminToken()));
  const [pin, setPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [rows, setRows] = useState<{ items: AdminUserRow[]; total: number } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const qTimer = useRef<number | undefined>(undefined);

  const load = async (search = q) => {
    setBusy(true);
    setOffline(false);
    const [o, u] = await Promise.all([fetchAdminOverview(scope), fetchAdminUsers(scope, search)]);
    setBusy(false);
    if (!o || !u) {
      setOffline(true);
      return;
    }
    setOv(o);
    setRows(u);
  };

  useEffect(() => {
    if (!elevated) return;
    void load("");
    return () => window.clearTimeout(qTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevated]);

  useEffect(() => {
    if (!elevated) return;
    window.clearTimeout(qTimer.current);
    qTimer.current = window.setTimeout(() => void load(q), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Entry animation for the whole console, one small sweep.
  useEffect(() => {
    if (!elevated || REDUCED) return;
    gsap.fromTo(
      ".admin > *",
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.05, ease: "power2.out", overwrite: "auto" },
    );
  }, [elevated, rows !== null]);

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinBusy || pin.length < 8) return;
    setPinBusy(true);
    setPinError(null);
    const result = await elevateAdmin(scope, pin);
    setPinBusy(false);
    if (result.ok) {
      setPin("");
      setElevated(true);
    } else {
      setPinError(
        result.reason === "wrong-pin"
          ? "wrong PIN — try again"
          : result.reason === "throttled"
            ? "too many attempts — wait a moment"
            : result.reason === "offline"
              ? "backend unreachable — the panel cannot open"
              : "control panel refused access",
      );
    }
  };

  const drop = async (email: string) => {
    setNote(null);
    const ok = await adminDeleteUser(scope, email);
    if (ok) {
      setNote(`removed ${email}`);
      setConfirmEmail(null);
      await load(q);
    } else {
      setNote("could not remove that operator");
    }
  };

  const revokeAll = async () => {
    setNote(null);
    const n = await adminRevokeAllSessions(scope);
    if (n === null) setNote("could not revoke sessions — is the backend up?");
    else setNote(`every session revoked — ${n} operator(s) must sign in again`);
    setConfirmRevoke(false);
  };

  /* — the PIN gate — */
  if (!elevated) {
    return (
      <section className="admin section">
        <div className="admin__pin card">
          <span className="label admin__pin-tag">◆ control panel · owner only</span>
          <h2 className="admin__pin-t">Present the PIN</h2>
          <p className="admin__pin-s">
            The PIN is set in the backend's environment (ADMIN_PIN). It is
            checked in constant time, and the admin token it mints lives only
            in this tab's session.
          </p>
          <form className="admin__pin-form" onSubmit={submitPin}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 32))}
              placeholder="8+ characters"
              disabled={pinBusy}
              aria-label="Admin PIN"
            />
            <button type="submit" className="btn btn--primary" disabled={pinBusy || pin.length < 8}>
              <span className="btn__slash" />
              {pinBusy ? "Checking" : "Open the panel"}
            </button>
          </form>
          {pinError && (
            <p className="admin__pin-err" role="alert">
              {pinError}
            </p>
          )}
          <p className="label admin__pin-foot">the PIN never leaves the process</p>
        </div>
      </section>
    );
  }

  /* — the console — */
  const maxSignups = Math.max(1, ...(ov?.signups ?? []).map((s) => s.count));

  return (
    <section className="admin section">
      <header className="admin__head">
        <div>
          <p className="label">
            <span className="login__tag-k">◆</span> · shadowquest control panel
          </p>
          <h2 className="admin__title">The Ledger, whole.</h2>
        </div>
        <div className="admin__head-end">
          <span className="label admin__chip">{ov?.store ?? "…"} store</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearAdminToken();
              setElevated(false);
            }}
          >
            <span className="btn__slash" />
            lock panel
          </button>
        </div>
      </header>

      {offline && (
        <p className="admin__offline" role="alert">
          backend unreachable — showing the last numbers this tab fetched. Retry with refresh.
        </p>
      )}

      <div className="admin__grid">
        <div className="admin__stat card">
          <span className="label">operators</span>
          <span className="admin__stat-v num">{ov?.totalUsers ?? "…"}</span>
          <span className="admin__stat-s">cap {ov?.userCap ?? "…"}</span>
        </div>
        <div className="admin__stat card">
          <span className="label">active · 24h</span>
          <span className="admin__stat-v num">{ov?.active24h ?? "…"}</span>
        </div>
        <div className="admin__stat card">
          <span className="label">active · 7d</span>
          <span className="admin__stat-v num">{ov?.active7d ?? "…"}</span>
        </div>
        <div className="admin__stat card">
          <span className="label">sign-ups · 7d</span>
          <span className="admin__stat-v num">
            {(ov?.signups ?? []).reduce((a, s) => a + s.count, 0)}
          </span>
        </div>
      </div>

      <div className="admin__cols">
        <div className="admin__panel card">
          <span className="label">sign-ups · last 7 days</span>
          <div className="admin__bars" aria-hidden="true">
            {(ov?.signups ?? []).map((s) => (
              <div className="admin__bar" key={s.date}>
                <i style={{ height: `${Math.round((s.count / maxSignups) * 100)}%` }} />
                <em className="num">{s.count}</em>
                <span>{s.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <span className="label admin__panel-sub">top operators by progress</span>
          <ol className="admin__top">
            {(ov?.top ?? []).map((t) => (
              <li key={t.handle}>
                <b>{t.handle}</b>
                <span className="num">
                  Lv.{t.level} · {t.streak} day streak
                </span>
                <em className="num">{t.progress}</em>
              </li>
            ))}
          </ol>
        </div>

        <div className="admin__panel admin__panel--users card">
          <div className="admin__users-head">
            <span className="label">
              operators · {rows?.total ?? "…"} registered
            </span>
            <div className="admin__search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value.slice(0, 64))}
                placeholder="search email / handle"
                spellCheck={false}
                aria-label="Search operators"
              />
              <button
                type="button"
                className="label"
                onClick={() => void load(q)}
                disabled={busy}
              >
                {busy ? "…" : "refresh"}
              </button>
            </div>
          </div>

          <ul className="admin__users">
            {(rows?.items ?? []).map((u) => (
              <li className="admin__user" key={u.id}>
                <div className="admin__user-main">
                  <b>
                    {u.handle}
                    {u.role === "admin" && <em className="admin__admin">◆ admin</em>}
                  </b>
                  <span className="admin__user-email">{u.email}</span>
                </div>
                <span className="admin__user-meta num">
                  Lv.{u.level} · {u.streak}d · {u.tasks} tasks
                </span>
                <span className="admin__user-meta">
                  joined {fmtDate(u.createdAt)} · seen {fmtAgo(u.lastSeenAt)}
                </span>
                <span className="admin__user-meta">
                  {u.hasPassword ? "key sealed" : "no key yet"}
                </span>
                <button
                  type="button"
                  className={`admin__drop ${confirmEmail === u.email ? "is-armed" : ""}`}
                  onClick={() => {
                    if (confirmEmail === u.email) void drop(u.email);
                    else setConfirmEmail(u.email);
                  }}
                  onBlur={() => setConfirmEmail(null)}
                  disabled={u.role === "admin"}
                  title={u.role === "admin" ? "admins cannot be removed" : "remove operator"}
                >
                  {u.role === "admin" ? "admin" : confirmEmail === u.email ? "sure?" : "remove"}
                </button>
              </li>
            ))}
            {rows && rows.items.length === 0 && (
              <li className="admin__none">no operators match</li>
            )}
          </ul>
        </div>
      </div>

      <div className="admin__danger card">
        <div>
          <span className="label">danger zone</span>
          <p className="admin__danger-s">
            Rotate every stored token: all operators are signed out everywhere
            and must present their passphrase again.
          </p>
        </div>
        <button
          type="button"
          className={`btn ${confirmRevoke ? "btn--danger" : ""}`}
          onClick={() => {
            if (confirmRevoke) void revokeAll();
            else setConfirmRevoke(true);
          }}
          onBlur={() => setConfirmRevoke(false)}
        >
          <span className="btn__slash" />
          {confirmRevoke ? "sure — revoke all" : "revoke all sessions"}
        </button>
      </div>

      {note && (
        <p className="admin__note label" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
