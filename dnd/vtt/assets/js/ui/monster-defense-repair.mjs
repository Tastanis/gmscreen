// Tokens made from a monster before the server kept immunities and weaknesses through a save
// carry a monster record without them. These rules decide which tokens are affected and what
// to give back, from the monster's own record. Nothing here writes anything.

const entriesOf = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [])
  .filter((entry) => entry && typeof entry === 'object' && (String(entry.type ?? '').trim() || String(entry.value ?? '').trim()));

/** The immunities and weaknesses a monster record declares, in whichever form it stores them. */
export function declaredDefenses(monster) {
  if (!monster || typeof monster !== 'object') return { immunities: [], weaknesses: [] };
  const nested = monster.defenses && typeof monster.defenses === 'object' ? monster.defenses : {};
  const read = (kind, listKey) => {
    const lists = [...entriesOf(nested[listKey]), ...entriesOf(monster[listKey])];
    if (lists.length) return lists;
    const single = entriesOf(nested[kind]);
    if (single.length) return single;
    return entriesOf({ type: monster[`${kind}_type`] ?? monster[`${kind}Type`] ?? '', value: monster[`${kind}_value`] ?? monster[`${kind}Value`] ?? '' });
  };
  return { immunities: read('immunity', 'immunities'), weaknesses: read('weakness', 'weaknesses') };
}

/** The monster a token should be checked against, or '' when it is not made from one. */
export function monsterIdOf(placement) {
  const monster = placement?.monster && typeof placement.monster === 'object' ? placement.monster : null;
  if (!monster) return '';
  return String(placement.monsterId || monster.id || '').trim();
}

/** True when a token's monster record declares no immunity and no weakness at all. */
export function lacksDefenses(placement) {
  if (!monsterIdOf(placement)) return false;
  const { immunities, weaknesses } = declaredDefenses(placement.monster);
  return immunities.length === 0 && weaknesses.length === 0;
}

/**
 * The `defenses` block a token's monster should have, taking the missing immunities and
 * weaknesses from the monster's own record. Null when there is nothing to give back: the token
 * already has some, or the monster has none either.
 */
export function restoredDefenses(placement, catalogMonster) {
  if (!lacksDefenses(placement)) return null;
  const { immunities, weaknesses } = declaredDefenses(catalogMonster);
  if (!immunities.length && !weaknesses.length) return null;
  const copy = (entry) => ({ ...(String(entry.type ?? '').trim() ? { type: String(entry.type).trim() } : {}), ...(String(entry.value ?? '').trim() ? { value: String(entry.value).trim() } : {}) });
  const current = placement.monster.defenses && typeof placement.monster.defenses === 'object' ? placement.monster.defenses : {};
  const defenses = { ...current };
  if (immunities.length) { defenses.immunities = immunities.map(copy); defenses.immunity = copy(immunities[0]); }
  if (weaknesses.length) { defenses.weaknesses = weaknesses.map(copy); defenses.weakness = copy(weaknesses[0]); }
  return defenses;
}
