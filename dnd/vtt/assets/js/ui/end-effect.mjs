// End Effect: solos and leaders can, at the end of their turn, take N damage to end a save-ends effect on them
// (the damage can't be reduced). The VTT offers it in the save popup. N comes from an `endEffect` passive in the
// monster's automation, or from the trait's own words, as the Monsters book writes them:
//   "End Effect: At the end of each of their turns, the dragon can take 20 damage to end one effect on them that
//    can be ended by a saving throw." / Ajax: "...take 20 damage to end up to two save ends effects..."

const COUNT_WORDS = { one: 1, a: 1, an: 1, two: 2, three: 3 };

function textOf(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return [entry.name, entry.text, entry.description, entry.effect, entry.additional_effect]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ');
}

function passiveFrom(automation) {
  if (!automation || typeof automation !== 'object') return null;
  const passives = Array.isArray(automation.passives) ? automation.passives : [];
  for (const passive of passives) {
    const kind = String(passive?.kind || '').replace(/[^a-z]/gi, '').toLowerCase();
    if (kind !== 'endeffect') continue;
    const damage = Number.parseInt(passive.damage ?? passive.amount, 10);
    if (!Number.isFinite(damage) || damage < 0) continue;
    const count = Math.max(1, Number.parseInt(passive.count, 10) || 1);
    return { damage, count, label: String(passive.label || 'End Effect').trim() || 'End Effect' };
  }
  return null;
}

// Reads "take 20 damage to end one / up to two ... effect(s)" from a piece of text.
export function endEffectFromText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ');
  const match = /take (\d+) damage to end (?:up to )?(one|two|three|a|an|\d+)?\b[^.]*?effects?/i.exec(clean);
  if (!match) return null;
  const damage = Number.parseInt(match[1], 10);
  const word = String(match[2] || 'one').toLowerCase();
  const count = COUNT_WORDS[word] || Math.max(1, Number.parseInt(word, 10) || 1);
  return Number.isFinite(damage) ? { damage, count, label: 'End Effect' } : null;
}

// The End Effect a monster has, or null: { damage, count, label }.
export function endEffectFor(monster) {
  if (!monster || typeof monster !== 'object') return null;
  const entries = [];
  if (Array.isArray(monster.traits)) entries.push(...monster.traits);
  const abilities = monster.abilities && typeof monster.abilities === 'object' ? monster.abilities : {};
  Object.keys(abilities).forEach((key) => {
    if (Array.isArray(abilities[key])) entries.push(...abilities[key]);
  });
  for (const entry of entries) {
    const fromPassive = passiveFrom(entry?.automation);
    if (fromPassive) return fromPassive;
  }
  for (const entry of entries) {
    const text = textOf(entry);
    if (!/end effect|saving throw|save ends/i.test(text)) continue;
    const found = endEffectFromText(text);
    if (found) return found;
  }
  return null;
}
