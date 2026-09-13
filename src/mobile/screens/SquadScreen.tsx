/**
 * SquadScreen.tsx — formation and friends.
 *
 * Frontend only: ShadowQuest has no social endpoint, so the squad is seeded
 * and kept in localStorage beside the rest of the operator's data (see
 * mobile/squad.ts). The shape is what a real API would return, so wiring one
 * up later means changing the loader, not this screen.
 *
 * Two ideas, kept separate on purpose:
 *   Formation — four named slots. One member each. Your own row cannot be
 *               removed, because you are always in your own squad.
 *   Friends   — everyone else you have added. Not slotted, still counted.
 */
import { useEffect, useMemo, useState } from "react";
import { type User } from "../../lib/auth";
import { LIFE_FACTOR_META } from "../../lib/todo";
import {
  acceptInvite,
  availableFriends,
  assignRole,
  formationOf,
  invite,
  loadSquad,
  onlineCount,
  poolById,
  removeMember,
  saveSquad,
  squadTopLevel,
  squadWeekly,
  syncSelf,
  type Squad,
  type SquadMember,
  type SquadRole,
  ROLE_META,
  FORMATION_ORDER,
} from "../squad";
import { Avatar, Caption, Empty, Panel, Sheet, initialsOf } from "../parts";
import type { Profile } from "../../lib/todo";

export function SquadScreen({ user, profile }: { user: User; profile: Profile }) {
  const [squad, setSquad] = useState<Squad>(() => loadSquad(user));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(squad.name);
  const [motto, setMotto] = useState(squad.motto);
  /**
   * Two ways into the same sheet, and they must not be confused:
   *   `assigning`  — a member is picked and we are choosing their slot.
   *   `targetRole` — a slot is picked and we are choosing who fills it.
   * Opening from an empty slot used to offer four disabled role buttons,
   * which was a dead end; it now offers the roster instead.
   */
  const [assigning, setAssigning] = useState<SquadMember | null>(null);
  const [targetRole, setTargetRole] = useState<SquadRole | null>(null);
  const [manage, setManage] = useState(false);

  // Re-load when a different operator signs in.
  useEffect(() => {
    const s = loadSquad(user);
    setSquad(s);
    setName(s.name);
    setMotto(s.motto);
  }, [user]);

  // The operator's own row always reflects their live profile, never a
  // snapshot taken the last time the squad was saved.
  useEffect(() => {
    setSquad((s) => {
      const next = syncSelf(s, user);
      return {
        ...next,
        members: next.members.map((m) =>
          m.self
            ? {
                ...m,
                level: profile.lifeLevel,
                rank: profile.growthRank,
                streak: profile.streak,
                focusArea: profile.focusArea,
                weeklyPoints: profile.rewardPoints,
              }
            : m,
        ),
      };
    });
  }, [user, profile.lifeLevel, profile.growthRank, profile.streak, profile.focusArea, profile.rewardPoints]);

  const commit = (next: Squad) => {
    setSquad(next);
    saveSquad(user, next);
  };

  const openAssign = (m: SquadMember | null, role: SquadRole | null = null) => {
    setAssigning(m);
    setTargetRole(role);
    setManage(true);
  };

  /**
   * Candidates for an empty slot: anyone not already standing in it, bench
   * first. Putting the unplaced members at the top matters because picking a
   * slotted member is a *move* — it vacates their old slot — so the choices
   * that actually fill the gap should come first.
   */
  const candidates = squad.members
    .filter((m) => m.role !== targetRole)
    .sort((a, b) => {
      if ((a.role === null) !== (b.role === null)) return a.role === null ? -1 : 1;
      return b.level - a.level;
    });

  const friends = useMemo(() => availableFriends(squad), [squad]);
  const roster = useMemo(
    () => [...squad.members].sort((a, b) => b.level - a.level),
    [squad.members],
  );
  const slots = useMemo(() => formationOf(squad), [squad]);

  const invitePool = useMemo(() => {
    const ids = squad.invites;
    return ids.map((id) => poolById(id)).filter((m): m is SquadMember => Boolean(m));
  }, [squad.invites]);

  const saveRename = () => {
    const clean = name.trim() || squad.name;
    commit({ ...squad, name: clean, motto: motto.trim() || squad.motto });
    setRenaming(false);
  };

  return (
    <div className="m-screen m-squad">
      <header className="m-head">
        <h1 className="m-head__t">
          {squad.name} <span className="m-head__ja">{squad.nameJa}</span>
        </h1>
        <p className="m-head__s">{squad.motto}</p>
      </header>

      <Panel glow className="m-sq-head">
        <div className="m-sq-head__grid">
          <div>
            <span className="m-sq-head__l">Members</span>
            <span className="m-sq-head__v num">{squad.members.length}</span>
          </div>
          <div>
            <span className="m-sq-head__l">Online</span>
            <span className="m-sq-head__v num">{onlineCount(squad)}</span>
          </div>
          <div>
            <span className="m-sq-head__l">Top level</span>
            <span className="m-sq-head__v num">{squadTopLevel(squad)}</span>
          </div>
          <div>
            <span className="m-sq-head__l">Weekly</span>
            <span className="m-sq-head__v num is-gold">
              {squadWeekly(squad).toLocaleString()}
            </span>
          </div>
        </div>
        <button type="button" className="m-btn m-btn--ghost" onClick={() => setRenaming(true)}>
          Edit squad
        </button>
      </Panel>

      {/* — formation — */}
      <Caption>Formation</Caption>
      <div className="m-form-grid">
        {slots.map((s) => (
          <div className={`m-slot ${s.member ? "is-filled" : ""}`} key={s.role}>
            <span className="m-slot__role">
              {s.label} <i>{s.ja}</i>
            </span>
            {s.member ? (
              <button
                type="button"
                className="m-slot__m"
                onClick={() => openAssign(s.member)}
                aria-label={`Change ${s.label}`}
              >
                <Avatar
                  initials={initialsOf(s.member.name)}
                  hue={s.member.hue}
                  size={42}
                  online={s.member.online}
                />
                <span className="m-slot__n">{s.member.name}</span>
                <span className="m-slot__meta num">
                  Lv.{s.member.level} · {s.member.rank}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="m-slot__empty"
                onClick={() => openAssign(null, s.role)}
                aria-label={`Fill ${s.label} slot`}
              >
                <span className="m-slot__plus" aria-hidden="true">
                  +
                </span>
                <span>Empty</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* — invites — */}
      {invitePool.length ? (
        <>
          <Caption>Invites</Caption>
          <Panel className="m-inv">
            {invitePool.map((m) => (
              <div className="m-inv__r" key={m.id}>
                <Avatar initials={initialsOf(m.name)} hue={m.hue} size={36} />
                <span className="m-inv__n">{m.name}</span>
                <button
                  type="button"
                  className="m-btn m-btn--sm"
                  onClick={() => commit(acceptInvite(squad, m.id))}
                >
                  Accept
                </button>
              </div>
            ))}
          </Panel>
        </>
      ) : null}

      {/* — roster — */}
      <Caption>
        Roster <span className="num">{roster.length}</span>
      </Caption>
      <div className="m-roster">
        {roster.map((m) => (
          <div className={`m-mem ${m.self ? "is-self" : ""}`} key={m.id}>
            <Avatar initials={initialsOf(m.name)} hue={m.hue} size={40} online={m.online} />
            <div className="m-mem__b">
              <span className="m-mem__n">
                {m.name}
                {m.self ? <i className="m-mem__you">you</i> : null}
                <i className="m-mem__ja">{m.nameJa}</i>
              </span>
              <span className="m-mem__s">
                {m.focusArea} · {LIFE_FACTOR_META[m.strength].label}
              </span>
            </div>
            <div className="m-mem__r">
              <span className="m-mem__lv num">Lv.{m.level}</span>
              <span className="m-mem__rank">{m.rank}</span>
            </div>
            <button
              type="button"
              className="m-mem__more"
              onClick={() => openAssign(m)}
              aria-label={`Manage ${m.name}`}
            >
              ⋯
            </button>
          </div>
        ))}
      </div>

      {/* — friends not yet added — */}
      <Caption>
        Friends <span className="num">{friends.length}</span>
      </Caption>
      {friends.length ? (
        <Panel className="m-inv">
          {friends.map((m) => (
            <div className="m-inv__r" key={m.id}>
              <Avatar initials={initialsOf(m.name)} hue={m.hue} size={36} />
              <span className="m-inv__n">
                {m.name}
                <i className="m-inv__s">Lv.{m.level}</i>
              </span>
              <button
                type="button"
                className="m-btn m-btn--sm"
                onClick={() => commit(invite(squad, m.id))}
              >
                Invite
              </button>
            </div>
          ))}
        </Panel>
      ) : (
        <Empty title="No one left to add" hint="Everyone in the pool is already with you." />
      )}

      {/* — rename — */}
      <Sheet open={renaming} onClose={() => setRenaming(false)} title="Edit squad">
        <div className="m-form">
          <label className="m-field">
            <span className="m-field__l">Squad name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={28} />
          </label>
          <label className="m-field">
            <span className="m-field__l">Motto</span>
            <input value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={64} />
          </label>
          <button type="button" className="m-btn m-btn--go" onClick={saveRename}>
            Save
          </button>
        </div>
      </Sheet>

      {/* — slot assignment — */}
      <Sheet
        open={manage}
        onClose={() => setManage(false)}
        title={
          assigning
            ? assigning.name
            : targetRole
              ? `Fill ${ROLE_META[targetRole].label}`
              : "Formation"
        }
      >
        <div className="m-form">
          {!assigning && targetRole ? (
            <>
              <span className="m-field__l">
                Who stands as {ROLE_META[targetRole].label}?
              </span>
              <div className="m-cand">
                {candidates.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className="m-cand__b"
                    onClick={() => {
                      commit(assignRole(squad, m.id, targetRole));
                      setManage(false);
                    }}
                  >
                    <Avatar initials={initialsOf(m.name)} hue={m.hue} size={34} />
                    <span className="m-cand__t">
                      <span className="m-cand__n">{m.name}</span>
                      <span className="m-cand__s num">
                        Lv.{m.level} · {m.role ? ROLE_META[m.role].label : "bench"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {assigning ? (
            <span className="m-field__l">Place in formation</span>
          ) : null}
          {assigning ? (
            <div className="m-roles">
            {FORMATION_ORDER.map((r: SquadRole) => {
              const held = squad.members.find((m) => m.role === r);
              const active = assigning?.role === r;
              return (
                <button
                  key={r}
                  type="button"
                  className={`m-roles__b ${active ? "is-on" : ""}`}
                  disabled={!assigning}
                  onClick={() => {
                    if (!assigning) return;
                    commit(assignRole(squad, assigning.id, r));
                    setManage(false);
                  }}
                >
                  <span className="m-roles__n">
                    {ROLE_META[r].label} <i>{ROLE_META[r].ja}</i>
                  </span>
                  <span className="m-roles__h">
                    {held ? (active ? "You" : held.name) : "Open"}
                  </span>
                </button>
              );
            })}
            </div>
          ) : null}

          {assigning && !assigning.self ? (
            <div className="m-sheetacts">
              <button
                type="button"
                className="m-btn m-btn--ghost"
                onClick={() => {
                  commit(assignRole(squad, assigning.id, null));
                  setManage(false);
                }}
              >
                Remove from formation
              </button>
              <button
                type="button"
                className="m-btn m-btn--danger"
                onClick={() => {
                  commit(removeMember(squad, assigning.id));
                  setManage(false);
                }}
              >
                Remove from squad
              </button>
            </div>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
