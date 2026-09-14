/**
 * ProfileScreen.tsx — the operator, and how they signed in.
 *
 * The sign-in panel reports the truth of the current session and nothing
 * more: when Google opened it, the verified Google profile the backend
 * returned is shown (name, address, avatar); otherwise the panel says the
 * session is a passphrase one and offers the real OAuth flow, which links
 * Google to this same account — the ledger is keyed by email, so tasks,
 * habits, progress, rewards and achievements stay exactly where they are.
 *
 * There is no "switch account" here and no chooser: switching identity means
 * signing out and signing in again, which is the only honest way to change
 * whose ledger is on screen.
 */
import { useEffect, useState } from "react";
import { scopeOf, type User } from "../../lib/auth";
import { ApkLink } from "../../components/ApkLink";
import {
  readProvider,
  signedInGoogleProfile,
  startGoogleSignIn,
  type GoogleProfile,
} from "../../lib/googleAuth";
import { GoogleMark } from "../../components/GoogleMark";
import { goToTab } from "../nav";
import { achievementsOf, powerIndex } from "../stats";
import type { Ledger } from "../useLedger";
import { Avatar, Caption, Panel, initialsOf } from "../parts";
import { squadWeekly, loadSquad } from "../squad";
import { StreakCard } from "../StreakCard";

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
  const [account, setAccount] = useState<GoogleProfile | null>(() => signedInGoogleProfile());
  const [linking, setLinking] = useState(false);

  const provider = readProvider();
  const marks = achievementsOf(profile, tasks).filter((a) => a.earned).length;
  const squad = loadSquad(user);

  // Another tab can change the identity; keep this screen honest about it.
  useEffect(() => {
    const sync = () => setAccount(signedInGoogleProfile());
    window.addEventListener("sq:auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("sq:auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /**
   * Link Google to the account that is already open. This is the same real
   * OAuth round trip the gate uses; the backend matches on the verified
   * email and attaches the provider to the existing MongoDB document rather
   * than creating a second one.
   */
  const connect = () => {
    setLinking(true);
    startGoogleSignIn();
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
        {account?.picture ? (
          <img
            className="m-id__pic"
            src={account.picture}
            alt=""
            width={56}
            height={56}
            referrerPolicy="no-referrer"
          />
        ) : (
          <Avatar initials={initialsOf(user.handle)} hue={232} size={56} />
        )}
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

      {/* — the chain — */}
      <StreakCard profile={profile} tasks={tasks} />

      {/* — how this session was opened — */}
      <Caption>Sign-in</Caption>
      <Panel className="m-g">
        <div className="m-g__row">
          <GoogleMark size={20} className="m-gmark" />
          <div className="m-g__b">
            {account ? (
              <>
                <span className="m-g__n">Signed in with Google</span>
                <span className="m-g__e">{account.email}</span>
              </>
            ) : (
              <>
                <span className="m-g__n">
                  {provider?.kind === "local" ? "Signed in with a passphrase" : "Not connected"}
                </span>
                <span className="m-g__e">
                  Link Google to open this same ledger with one tap
                </span>
              </>
            )}
          </div>
        </div>
        {!account ? (
          <div className="m-g__acts">
            <button
              type="button"
              className="m-btn m-btn--sm"
              onClick={connect}
              disabled={linking}
              aria-busy={linking || undefined}
            >
              {linking ? "Signing in with Google…" : "Connect Google"}
            </button>
          </div>
        ) : null}
        <p className="m-note m-g__note">
          {account
            ? "Your Google account is linked to this ledger. Sign out to use a different one."
            : "Linking keeps every task, habit and point on this account — it only adds a second way in."}
        </p>
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
        <button type="button" className="m-rowbtn" onClick={() => goToTab("stats")}>
          <span className="m-rowbtn__ja" aria-hidden="true">統</span>
          <span className="m-rowbtn__b">
            <span className="m-rowbtn__t">Stats dashboard</span>
            <span className="m-rowbtn__s">Activity, momentum, growth</span>
          </span>
          <span className="m-rowbtn__a" aria-hidden="true">›</span>
        </button>
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
        {user.role === "admin" && (
          <button
            type="button"
            className="m-rowbtn"
            onClick={() => {
              window.location.hash = "#/app/admin";
            }}
          >
            <span className="m-rowbtn__ja" aria-hidden="true">御</span>
            <span className="m-rowbtn__b">
              <span className="m-rowbtn__t">Control panel</span>
              <span className="m-rowbtn__s">Owner-only console</span>
            </span>
            <span className="m-rowbtn__a" aria-hidden="true">›</span>
          </button>
        )}
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

    </div>
  );
}
