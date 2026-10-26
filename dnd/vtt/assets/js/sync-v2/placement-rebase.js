// A token change refused because somebody else changed the token first (409, a stale revision): what the user meant
// is put on the token as it now is, once, as a delta (late October 2026: "retry the Director's change after a
// clash"). Never the old whole value: that would undo the other person's change.
//
// rebasePlacementPatch(previous, current, patch): previous is the token as this page last had it confirmed, current
// the fresh token, patch what the user's change set. A field nobody else touched (or already as wanted) is sent as
// it was. Fields somebody else changed too are reapplied as what this change did to them:
// - conditions: the ones this change added are added, the ones it took off are taken off; the rest stay as now;
// - hp: the same amount of damage or healing on the Stamina it now has (healing stops at the maximum);
// - tempStamina: the same gain or loss, never below 0;
// - overlays: follow the new Stamina.
// Answers {patch} or null when some other field clashed (the caller says so instead of sending).

const REBASED = new Set(['conditions', 'condition', 'hp', 'tempStamina', 'overlays']);

const json = (value) => JSON.stringify(value ?? null);
const same = (a, b) => json(a) === json(b);
const listOf = (value) => (Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : []));
const number = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const conditionKey = (condition) => {
  if (!condition || typeof condition !== 'object') return json(condition);
  const duration = condition.duration && typeof condition.duration === 'object' ? condition.duration.type : condition.duration;
  return `${String(condition.name || '').trim().toLowerCase()}|${String(duration || '').toLowerCase()}|${condition.sourceId || ''}|${condition.amount ?? ''}|${condition.damageType ?? ''}|${condition.hidden ? 'h' : ''}`;
};

/** The condition list after reapplying what one change did (before → wanted) onto the list as it is now. */
export function rebaseConditionList(before, wanted, now) {
  const was = listOf(before), want = listOf(wanted), current = listOf(now);
  const wasKeys = new Set(was.map(conditionKey)), wantKeys = new Set(want.map(conditionKey));
  const removed = new Set(was.filter((c) => !wantKeys.has(conditionKey(c))).map(conditionKey));
  const added = want.filter((c) => !wasKeys.has(conditionKey(c)));
  const result = current.filter((c) => !removed.has(conditionKey(c)));
  const held = new Set(result.map(conditionKey));
  for (const condition of added) {
    if (!held.has(conditionKey(condition))) { result.push(condition); held.add(conditionKey(condition)); }
  }
  return result;
}

function rebaseHp(before, wanted, now) {
  if (!wanted || typeof wanted !== 'object' || !now || typeof now !== 'object') return wanted;
  const result = { ...now };
  const wasCurrent = number(before?.current), wantCurrent = number(wanted.current), nowCurrent = number(now.current);
  if (wasCurrent !== null && wantCurrent !== null && nowCurrent !== null && wasCurrent !== wantCurrent) {
    const delta = wantCurrent - wasCurrent;
    let next = nowCurrent + delta;
    const max = number(now.max ?? wanted.max);
    if (delta > 0 && max !== null && next > max && wantCurrent <= max) next = max;
    result.current = String(next);
  } else if (wasCurrent === null || nowCurrent === null) {
    result.current = wanted.current;
  }
  if (!same(before?.max, wanted.max)) result.max = wanted.max;
  return result;
}

export function rebasePlacementPatch(previous, current, patch) {
  if (!patch || typeof patch !== 'object' || !current || typeof current !== 'object') return null;
  const before = previous && typeof previous === 'object' ? previous : {};
  const result = {};
  for (const [field, wanted] of Object.entries(patch)) {
    if (same(current[field], before[field]) || same(current[field], wanted)) { result[field] = wanted; continue; }
    if (!REBASED.has(field)) return null;
  }
  const clashed = (field) => Object.hasOwn(patch, field) && !(same(current[field], before[field]) || same(current[field], patch[field]));
  if (clashed('conditions') || clashed('condition')) {
    const beforeList = listOf(before.conditions ?? before.condition);
    const wantedList = Object.hasOwn(patch, 'conditions') ? listOf(patch.conditions) : listOf(patch.condition);
    const list = rebaseConditionList(beforeList, wantedList, listOf(current.conditions ?? current.condition));
    if (Object.hasOwn(patch, 'conditions')) result.conditions = list.length ? list : null;
    if (Object.hasOwn(patch, 'condition')) result.condition = list[0] ?? null;
  }
  if (clashed('hp')) result.hp = rebaseHp(before.hp, patch.hp, current.hp);
  if (clashed('tempStamina')) {
    const delta = (number(patch.tempStamina) ?? 0) - (number(before.tempStamina) ?? 0);
    const next = Math.max(0, (number(current.tempStamina) ?? 0) + delta);
    result.tempStamina = next > 0 ? next : null;
  }
  if (clashed('overlays')) {
    const overlays = current.overlays && typeof current.overlays === 'object' ? JSON.parse(JSON.stringify(current.overlays)) : {};
    const hp = result.hp ?? patch.hp;
    if (hp && typeof hp === 'object') overlays.hitPoints = { ...(overlays.hitPoints || {}), value: hp };
    result.overlays = overlays;
  }
  return { patch: result };
}
