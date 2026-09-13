/**
 * ProfileScreen.tsx — the operator, and how they signed in.
 *
 * Also the home of the Google connection: which account is attached, and the
 * controls to switch or detach it. Detaching clears the provider marker only
 * — the ledger is keyed by email in lib/auth and is never deleted from here,
 * so signing back in with the same address restores exactly what was there.
 */
import { useEffect, useState } from "react";
import { scopeOf, type User } from "../../lib/auth";
import { ApkLink } from "../../components/ApkLink";
import {
  GOOGLE_ACCOUNTS,
  readProvider,
  signedInAccount,
  writeProvider,
  type GoogleAccount,
} from "../demoAccounts";
import { login } from "../../lib/auth";
import { goToTab } from "../nav";
import { achievementsOf, powerIndex } from "../stats";
import type { Ledger } from "../useLedger";
import { Avatar, Caption, Panel, Sheet, initialsOf } from "../parts";
import { squadWeekly, loadSquad } from "../squad";

export function ProfileScreen({
  user,
  ledger,
  onSignOut,
}: {
  user: User;
  ledger: Ledger;
  onSignOut: () => void;
}) {
  const { profile, tasks } = ledger;
  const [account, setAccount] = useState<GoogleAccount | null>(() => signedInAccount());
  const [picker, setPicker] = useState(false);

  const provider = readProvider();
  const marks = achievementsOf(profile, tasks).filter((a) => a.earned).length;
  const squad = loadSquad(user);

  // Another tab can change the identity; keep this screen honest about it.
  useEffect(() => {
    const sync = () => setAccount(signedInAccount());
    window.addEventListener("sq:auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("sq:auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const attach = (a: GoogleAccount) => {
    login(a.name, a.email);
    writeProvider({ kind: "google", accountId: a.id, at: Date.now() });
    setAccount(a);
    setPicker(false);
  };

  const detach = () => {
    writeProvider(null);
    setAccount(null);
  };

  const joined = new Date(user.joinedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="m-screen m-profile">
      <header className="m-head">
        <h1 className="m-head__t">Profile</h1>
        <p className="m-head__s">{profile.focusArea}</p>
      </header>

      <Panel glow className="m-id">
        <Avatar
          initials={account ? account.initials : initialsOf(user.handle)}
          hue={account ? account.hue : 232}
          size={56}
        />
        <div className="m-id__b">
          <span className="m-id__n">{user.handle}</span>
          <span className="m-id__e">{user.email}</span>
          <span className="m-id__j">On the ledger since {joined}</span>
        </div>
      </Panel>

      {/* — the sheet, in numbers — */}
      <div className="m-mini">
        <div>
          <span className="m-mini__l">Level</span>
          <span className="m-mini__v num">{profile.lifeLevel}</span>
        </div>
        <div>
          <span className="m-mini__l">Rank</span>
          <span className="m-mini__v">{profile.growthRank}</span>
        </div>
        <div>
          <span className="m-mini__l">Power</span>
          <span className="m-mini__v num">{powerIndex(profile)}</span>
        </div>
        <div>
          <span className="m-mini__l">Marks</span>
          <span className="m-mini__v num">{marks}</span>
        </div>
      </div>

      {/* — Google — */}
      <Caption>Sign-in</Caption>
      <Panel className="m-g">
        <div className="m-g__row">
          <GoogleMark />
          <div className="m-g__b">
            {account ? (
              <>
                <span className="m-g__n">Signed in with Google</span>
                <span className="m-g__e">{account.email}</span>
              </>
            ) : (
              <>
                <span className="m-g__n">
                  {provider?.kind === "local" ? "Signed in on this device" : "Not connected"}
                </span>
                <span className="m-g__e">
                  {provider?.kind === "local"
                    ? "No Google account attached"
                    : "Attach a Google account"}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="m-g__acts">
          <button type="button" className="m-btn m-btn--sm" onClick={() => setPicker(true)}>
            {account ? "Switch account" : "Connect Google"}
          </button>
          {account ? (
            <button type="button" className="m-btn m-btn--ghost m-btn--sm" onClick={detach}>
              Detach
            </button>
          ) : null}
        </div>
      </Panel>

      {/* — squad — */}
      <Caption>Squad</Caption>
      <button type="button" className="m-rowbtn" onClick={() => goToTab("squad")}>
        <span className="m-rowbtn__ja" aria-hidden="true">
          隊
        </span>
        <span className="m-rowbtn__b">
          <span className="m-rowbtn__t">{squad.name}</span>
          <span className="m-rowbtn__s">
            {squad.members.length} members · {squadWeekly(squad).toLocaleString()} this week
          </span>
        </span>
        <span className="m-rowbtn__a" aria-hidden="true">
          ›
        </span>
      </button>

      {/* — the rest of the app — */}
      <Caption>Sections</Caption>
      <div className="m-rows">
        <button type="button" className="m-rowbtn" onClick={() => goToTab("progress")}>
          <span className="m-rowbtn__ja" aria-hidden="true">成</span>
          <span className="m-rowbtn__b">
            <span className="m-rowbtn__t">Character sheet</span>
            <span className="m-rowbtn__s">Factors, rank, discipline</span>
          </span>
          <span className="m-rowbtn__a" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="m-rowbtn"
          onClick={() => {
            window.location.hash = "#/app/field";
          }}
        >
          <span className="m-rowbtn__ja" aria-hidden="true">集中</span>
          <span className="m-rowbtn__b">
            <span className="m-rowbtn__t">Deep Work</span>
            <span className="m-rowbtn__s">Focus session</span>
          </span>
          <span className="m-rowbtn__a" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="m-rowbtn"
          onClick={() => {
            window.location.hash = "#/app/ladder";
          }}
        >
          <span className="m-rowbtn__ja" aria-hidden="true">道</span>
          <span className="m-rowbtn__b">
            <span className="m-rowbtn__t">Milestones</span>
            <span className="m-rowbtn__s">The ladder</span>
          </span>
          <span className="m-rowbtn__a" aria-hidden="true">›</span>
        </button>
      </div>

      <Caption>Skills</Caption>
      {profile.skills.length ? (
        <div className="m-skills">
          {profile.skills.map((s) => (
            <span className="m-skill" key={s}>
              {s}
            </span>
          ))}
        </div>
      ) : (
        <Panel className="m-pad">
          <p className="m-note">No skills recorded on this profile yet.</p>
        </Panel>
      )}

      <Caption>The app</Caption>
      <Panel className="m-pad m-app-info">
        <ApkLink compact />
        <p className="m-note">
          Ledger key <code className="num">{scopeOf(user)}</code> · stored on this device
        </p>
      </Panel>

      <button type="button" className="m-btn m-btn--danger m-signout" onClick={onSignOut}>
        Sign out
      </button>

      {/* — Google account chooser — */}
      <Sheet open={picker} onClose={() => setPicker(false)} title="Choose an account">
        <div className="m-gpick">
          <p className="m-gpick__h">to continue to ShadowQuest</p>
          {GOOGLE_ACCOUNTS.map((a) => (
            <button
              type="button"
              key={a.id}
              className={`m-gpick__a ${account?.id === a.id ? "is-on" : ""}`}
              onClick={() => attach(a)}
            >
              <Avatar initials={a.initials} hue={a.hue} size={38} />
              <span className="m-gpick__b">
                <span className="m-gpick__n">{a.name}</span>
                <span className="m-gpick__e">{a.hint}</span>
              </span>
              {account?.id === a.id ? <span className="m-gpick__ok">✓</span> : null}
            </button>
          ))}
          <p className="m-gpick__f">
            Demo identities. Choosing one signs you in on this device only —
            the ledger stays keyed to that address.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

/** Google's four-colour G, drawn rather than pulled from a CDN. */
function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="m-gmark">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7C13.4 14.7 18.3 10.8 24 10.8z"
      />
    </svg>
  );
}
