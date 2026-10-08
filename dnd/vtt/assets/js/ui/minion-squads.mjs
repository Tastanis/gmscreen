// Minion squads and their captains. Pure rules, so every browser reaches the same answer from the
// tokens themselves and the rules can be tested without a page.
//
// A squad is recorded on each of its member tokens as a `squad` marker:
//   { id, monsterId, representativeId, perMinionStamina, maxPool, initialMemberCount,
//     captainId?, withCaptain? }
// and every member carries the squad's shared Stamina pool as its own `hp`.

const list = (placements) => (Array.isArray(placements) ? placements : Object.values(placements || {})).filter(Boolean);
const number = (value) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? n : null; };

/** The squad a token belongs to, rebuilt from the markers on the scene's tokens. Null when it has none. */
export function squadForPlacement(placements, placementId) {
  const all = list(placements);
  const marker = all.find((placement) => placement.id === placementId)?.squad;
  if (!marker || !marker.id) return null;
  const members = all.filter((placement) => placement.squad?.id === marker.id);
  const perMinionStamina = Math.max(1, number(marker.perMinionStamina) ?? 1);
  return {
    id: marker.id,
    monsterId: marker.monsterId ?? '',
    representativeId: marker.representativeId ?? '',
    memberIds: members.map((placement) => placement.id),
    perMinionStamina,
    maxPool: Math.max(1, number(marker.maxPool) ?? perMinionStamina * members.length),
    initialMemberCount: Math.max(1, number(marker.initialMemberCount) ?? members.length),
    captainId: typeof marker.captainId === 'string' && marker.captainId ? marker.captainId : null,
    withCaptain: typeof marker.withCaptain === 'string' ? marker.withCaptain.trim() : '',
  };
}

/**
 * The squad's shared Stamina. Every member should carry the same number; if they disagree (an
 * older save where one browser damaged a single token) the lowest is the pool, so damage already
 * dealt is never given back.
 */
export function squadPool(squad, placements) {
  const members = new Set(squad.memberIds);
  const values = list(placements).filter((placement) => members.has(placement.id))
    .map((placement) => number(placement.hp?.current)).filter((value) => value !== null);
  if (!values.length) return squad.maxPool;
  return Math.max(0, Math.min(squad.maxPool, ...values));
}

/** What a hit does to the pool, and how many minions it drops. */
export function damageSquad(squad, pool, amount) {
  const dealt = Math.max(0, Math.trunc(Number(amount) || 0));
  const next = Math.max(0, pool - dealt);
  const standingBefore = Math.ceil(pool / squad.perMinionStamina);
  const standing = Math.ceil(next / squad.perMinionStamina);
  return { previous: pool, current: next, standingBefore, standing, kills: Math.max(0, standingBefore - standing) };
}

const isMinion = (placement) => /minion/i.test(String(placement?.monster?.organization ?? placement?.monster?.role ?? ''));

/**
 * The captain a tracker group gets when it is formed: its one creature that is not a minion.
 * Heroes and tokens with no monster record never count. Null when the group has no such
 * creature, or has more than one (the GM then attaches the one they mean).
 */
export function pickCaptain(groupPlacements) {
  const candidates = list(groupPlacements).filter((placement) => placement.monster && typeof placement.monster === 'object' && !isMinion(placement));
  return candidates.length === 1 ? candidates[0].id : null;
}

/** The squad's captain while it is on the scene and still has Stamina. Null otherwise. */
export function livingCaptain(squad, placements) {
  if (!squad?.captainId) return null;
  const captain = list(placements).find((placement) => placement.id === squad.captainId);
  if (!captain) return null;
  const stamina = number(captain.hp?.current);
  return stamina !== null && stamina <= 0 ? null : captain;
}

/**
 * Reads a minion's "With Captain" line, written as the monster book writes it. What the app
 * applies by itself comes back as numbers; `text` is always the whole line; `byHand` lists the
 * parts left for the table, and `manual` is true when there are any.
 *   "+1 damage bonus to strikes" / "Strike damage +1"     -> strikeDamage: 1
 *   "Gain an edge on strikes"                             -> edge: 1
 *   "Have a double edge on strikes"                       -> edge: 2
 *   "+5 bonus to ranged distance"                         -> rangedDistance: 5
 *   "+3 bonus to melee distance"                          -> meleeDistance: 3
 *   "+2 bonus to speed" / "Speed +2"                      -> speed: 2
 *   "+2 bonus to forced movement"                         -> forcedMovement: 2
 *   "+2 bonus to Stamina", or anything else               -> byHand
 */
export function parseCaptainBonus(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const bonus = { text, strikeDamage: 0, edge: 0, rangedDistance: 0, meleeDistance: 0, speed: 0, forcedMovement: 0, byHand: [], manual: false };
  if (!text) return bonus;
  const parts = text.split(/[;,.]|\band\b/i).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const amount = number(part.match(/\+\s*(\d+)/)?.[1]);
    if (/\bedge\b/i.test(part) && /\bstrikes?\b/i.test(part)) bonus.edge = Math.max(bonus.edge, /\bdouble\b/i.test(part) ? 2 : 1);
    else if (amount && /\bstamina\b/i.test(part)) bonus.byHand.push(part);
    else if (amount && /damage/i.test(part)) bonus.strikeDamage += amount;
    else if (amount && /forced\s+movement/i.test(part)) bonus.forcedMovement += amount;
    else if (amount && /ranged\s+distance|\brange\b/i.test(part)) bonus.rangedDistance += amount;
    else if (amount && /melee\s+distance|\breach\b/i.test(part)) bonus.meleeDistance += amount;
    else if (amount && /\bspeed\b/i.test(part)) bonus.speed += amount;
    else bonus.byHand.push(part);
  }
  bonus.manual = bonus.byHand.length > 0;
  return bonus;
}

/**
 * The same line in plain words, for the Monster Creator and the GM: what the VTT will do by
 * itself, and what it will only remind the table of.
 */
export function describeCaptainBonus(value) {
  const bonus = value && typeof value === 'object' ? value : parseCaptainBonus(value);
  const applied = [];
  if (bonus.strikeDamage) applied.push(`+${bonus.strikeDamage} damage on strikes`);
  if (bonus.edge) applied.push(bonus.edge > 1 ? 'double edge on strikes' : 'edge on strikes');
  if (bonus.rangedDistance) applied.push(`+${bonus.rangedDistance} ranged distance`);
  if (bonus.meleeDistance) applied.push(`+${bonus.meleeDistance} melee distance`);
  if (bonus.speed) applied.push(`+${bonus.speed} speed`);
  if (bonus.forcedMovement) applied.push(`+${bonus.forcedMovement} forced movement`);
  return { applied, byHand: [...(bonus.byHand || [])] };
}

/**
 * The bonus a token is getting from its captain right now, or null: it must be a squad member,
 * the squad must have a captain who is still up, and its "With Captain" line must say something.
 */
export function captainBonusFor(placements, placementId) {
  const squad = squadForPlacement(placements, placementId);
  if (!squad) return null;
  const captain = livingCaptain(squad, placements);
  if (!captain) return null;
  const own = list(placements).find((placement) => placement.id === placementId);
  const text = squad.withCaptain || String(own?.monster?.with_captain ?? own?.monster?.withCaptain ?? '').trim();
  if (!text) return null;
  return { ...parseCaptainBonus(text), captainId: captain.id, captainName: captain.name || 'the captain' };
}

/**
 * The captain's bonus in the form the ability runner already understands for hero kits: a feature
 * whose modifiers add to rolled strike damage, to distance and to forced movement. Null when
 * nothing can be applied this way (speed and the edge are handled elsewhere).
 */
export function captainFeature(bonus) {
  if (!bonus) return null;
  const modifiers = [];
  if (bonus.strikeDamage) modifiers.push({ match: { keywordsAny: ['Strike'] }, apply: { damageBonus: bonus.strikeDamage }, label: `+${bonus.strikeDamage} damage` });
  if (bonus.rangedDistance) modifiers.push({ match: { keywordsAny: ['Ranged'] }, apply: { rangeBonus: bonus.rangedDistance }, label: `+${bonus.rangedDistance} ranged distance` });
  if (bonus.meleeDistance) modifiers.push({ match: { keywordsAny: ['Melee'], keywordsNone: ['Ranged'] }, apply: { rangeBonus: bonus.meleeDistance }, label: `+${bonus.meleeDistance} melee distance` });
  if (bonus.forcedMovement) modifiers.push({ match: {}, apply: { forcedMovementBonus: bonus.forcedMovement }, label: `+${bonus.forcedMovement} forced movement` });
  return modifiers.length ? { title: `With Captain (${bonus.captainName})`, automation: { modifiers } } : null;
}

// ---------- attaching and detaching a captain ----------

/** Every squad on the scene, each listed once. */
export function squadsOnScene(placements) {
  const seen = new Map();
  for (const placement of list(placements)) {
    const id = placement.squad?.id;
    if (id && !seen.has(id)) seen.set(id, squadForPlacement(placements, placement.id));
  }
  return [...seen.values()];
}

/** The squads a creature is captain of (the rules allow one; older data may hold more). */
export function squadsLedBy(placements, captainId) {
  return captainId ? squadsOnScene(placements).filter((squad) => squad.captainId === captainId) : [];
}

/** A creature that could lead a squad: made from a monster, and not a minion itself. */
export function canBeCaptain(placement) {
  return Boolean(placement && placement.monster && typeof placement.monster === 'object' && !isMinion(placement) && !placement.squad?.id);
}

/**
 * What the "captain" action would do for the current selection, or null when it does not apply.
 *   one creature that can lead + members of exactly one squad  -> attach it (replacing any captain)
 *   a squad's captain, with or without members of its squad     -> detach it
 *   only members of one squad that has a captain                -> detach that captain
 */
export function captainAction(placements, selectedIds) {
  const all = list(placements);
  const selected = [...new Set(selectedIds || [])].map((id) => all.find((placement) => placement.id === id)).filter(Boolean);
  if (!selected.length) return null;
  const members = selected.filter((placement) => placement.squad?.id);
  const others = selected.filter((placement) => !placement.squad?.id);
  const squadIds = [...new Set(members.map((placement) => placement.squad.id))];
  if (squadIds.length > 1 || others.length > 1) return null;
  const squad = squadIds.length ? squadForPlacement(all, members[0].id) : null;
  const other = others[0] || null;
  const nameOf = (id) => all.find((placement) => placement.id === id)?.name || 'the captain';

  if (other && squad) {
    if (squad.captainId === other.id) return { kind: 'detach', squadId: squad.id, captainId: other.id, captainName: nameOf(other.id) };
    if (!canBeCaptain(other)) return null;
    return { kind: 'attach', squadId: squad.id, captainId: other.id, captainName: nameOf(other.id), replaces: squad.captainId && squad.captainId !== other.id ? nameOf(squad.captainId) : '', leaves: squadsLedBy(all, other.id).map((led) => led.id).filter((id) => id !== squad.id) };
  }
  if (other) {
    const led = squadsLedBy(all, other.id);
    return led.length === 1 ? { kind: 'detach', squadId: led[0].id, captainId: other.id, captainName: nameOf(other.id) } : null;
  }
  return squad?.captainId ? { kind: 'detach', squadId: squad.id, captainId: squad.captainId, captainName: nameOf(squad.captainId) } : null;
}

/**
 * The small badge a token shows: `captain` on a squad's captain (with `down` once it has no
 * Stamina), `led` on a minion whose squad has a captain who is up. Null otherwise.
 */
export function squadBadge(placements, placementId) {
  const all = list(placements);
  const own = all.find((placement) => placement.id === placementId);
  if (!own) return null;
  if (own.squad?.id) {
    const squad = squadForPlacement(all, placementId);
    const captain = livingCaptain(squad, all);
    return captain ? { kind: 'led', captainName: captain.name || 'its captain' } : null;
  }
  const led = squadsLedBy(all, placementId);
  if (!led.length) return null;
  const stamina = number(own.hp?.current);
  return { kind: 'captain', down: stamina !== null && stamina <= 0, minions: led.reduce((count, squad) => count + squad.memberIds.length, 0) };
}
