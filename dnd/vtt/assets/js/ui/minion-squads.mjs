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
 * The captain of a tracker group: the first creature in it that is not a minion. Heroes and
 * tokens with no monster record are never captains. Null when the group is all minions.
 */
export function pickCaptain(groupPlacements) {
  const captain = list(groupPlacements).find((placement) => placement.monster && typeof placement.monster === 'object' && !isMinion(placement));
  return captain ? captain.id : null;
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
 * Reads a minion's "With Captain" line. The numbers the app can apply by itself come back as
 * fields; `text` is always the whole line, and `manual` is true when part of it is left for the
 * table (an edge, a new ability, anything not listed here).
 *   "+1 damage bonus on strikes" / "Strike damage +1"        -> strikeDamage: 1
 *   "+4 bonus to ranged distance" / "Ranged distance +4"     -> rangedDistance: 4
 *   "+1 bonus to melee distance" / "Melee distance +1"       -> meleeDistance: 1
 *   "+2 bonus to speed" / "Speed +2"                         -> speed: 2
 *   "Gain an edge on strikes"                                -> edgeOnStrikes: true (reminder only)
 */
export function parseCaptainBonus(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const bonus = { text, strikeDamage: 0, rangedDistance: 0, meleeDistance: 0, speed: 0, edgeOnStrikes: false, manual: false };
  if (!text) return bonus;
  let understood = 0;
  const parts = text.split(/[;,.]|\band\b/i).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const amount = number(part.match(/\+\s*(\d+)/)?.[1]);
    if (amount && /damage/i.test(part)) { bonus.strikeDamage += amount; understood += 1; }
    else if (amount && /ranged\s+distance|\brange\b/i.test(part)) { bonus.rangedDistance += amount; understood += 1; }
    else if (amount && /melee\s+distance|\breach\b/i.test(part)) { bonus.meleeDistance += amount; understood += 1; }
    else if (amount && /\bspeed\b/i.test(part)) { bonus.speed += amount; understood += 1; }
    else if (/\bedge\b/i.test(part)) { bonus.edgeOnStrikes = true; bonus.manual = true; }
    else bonus.manual = true;
  }
  if (!understood && !bonus.edgeOnStrikes) bonus.manual = true;
  return bonus;
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
 * whose modifiers add to rolled strike damage and to distance. Null when nothing can be applied.
 */
export function captainFeature(bonus) {
  if (!bonus) return null;
  const modifiers = [];
  if (bonus.strikeDamage) modifiers.push({ match: { keywordsAny: ['Strike'] }, apply: { damageBonus: bonus.strikeDamage }, label: `+${bonus.strikeDamage} damage` });
  if (bonus.rangedDistance) modifiers.push({ match: { keywordsAny: ['Ranged'] }, apply: { rangeBonus: bonus.rangedDistance }, label: `+${bonus.rangedDistance} ranged distance` });
  if (bonus.meleeDistance) modifiers.push({ match: { keywordsAny: ['Melee'], keywordsNone: ['Ranged'] }, apply: { rangeBonus: bonus.meleeDistance }, label: `+${bonus.meleeDistance} melee distance` });
  return modifiers.length ? { title: `With Captain (${bonus.captainName})`, automation: { modifiers } } : null;
}
