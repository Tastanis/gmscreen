// What a sheet page changed, field by field. Pure: no page, no network.
//
// Brandon, October 12, 2026: "Character sheets seem to be changing without permission ... zepha's might and agility
// were just randomly reset to zero."
//
// A save used to send the WHOLE character as the page held it, and the server replaced the whole stored record
// with it. Any old copy of a sheet that saved (a page left in Edit mode, a phone tab that woke up, a second
// device) wrote its old values over newer ones, and a field that was blank on that copy was stored blank.
//
// A page now keeps the sheet as it last knew the server to hold it (its baseline) beside the sheet as it stands,
// and a save sends only the fields that differ: {path, value} for each. A field the page never touched is not in
// the list, however old the page is. The server sets only the fields named (SheetChanges.php).

// The counters: numbers that go up and down in play and are changed from the map as well as from here. A change
// to one says what this page believed it was ("from"), and the server moves its own number by the difference
// (SheetChanges::COUNTERS). A plus pressed on a page that is behind adds one to the true number.
export const COUNTERS = new Set(['hero.surges', 'hero.victories', 'hero.vitals.currentRecoveries', 'hero.vitals.currentStamina', 'hero.resource.value']);

// Named groups that are one field all the same: the skills ({Alchemy: {level, bonus}, ...}). A skill taken off is a
// name no longer in the group, and "a page does not delete what it does not hold" never sent that, so the group is
// sent whole when anything in it differs (October 2026: a skill removed in the Skills form came back on reload).
export const WHOLE_FIELDS = new Set(['sidebar.skills']);

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNothing = (value) => value === undefined || value === null || value === '';

/** The same for the purposes of a save: 3 and "3" are, as are a missing value and an empty one. */
export function sameValue(a, b) {
  if (a === b) return true;
  if (isNothing(a) && isNothing(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index]));
  }
  if (isMap(a) || isMap(b)) {
    if (!isMap(a) || !isMap(b)) return false;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => sameValue(a[key], b[key]));
  }
  if (isNothing(a) || isNothing(b)) return false;
  return String(a) === String(b);
}

/**
 * The fields of `now` that differ from `baseline`, as [{path: [...], value}]. Named groups of fields are gone
 * into; a list (abilities, features, skills) is one field and is sent whole when anything in it differs.
 * Never the party's hero tokens (they have their own request), and never an emptied characteristic: an empty
 * Might is how a blank input reads, not a score.
 */
export function diffSheet(baseline, now, path = [], amounts = true) {
  const changes = [];
  if (isMap(baseline) && isMap(now) && !WHOLE_FIELDS.has(path.join('.'))) {
    for (const key of new Set([...Object.keys(baseline), ...Object.keys(now)])) {
      if (!(key in now)) continue;                                  // a page does not delete what it does not hold
      if (path.length === 1 && path[0] === 'hero' && key === 'heroTokens') continue;
      changes.push(...diffSheet(baseline[key], now[key], [...path, key], amounts));
    }
    return changes;
  }
  if (sameValue(baseline, now)) return changes;
  if (path.length === 3 && path[0] === 'hero' && path[1] === 'stats' && isNothing(now) && Number.isFinite(Number(baseline)) && !isNothing(baseline)) return changes;
  if (!path.length) return changes;
  const change = { path, value: now === undefined ? null : JSON.parse(JSON.stringify(now)) };
  // Not for what is typed in Edit mode (amounts false): a number typed there is the number meant.
  if (amounts && COUNTERS.has(path.join('.'))) change.from = baseline === undefined ? null : baseline;
  changes.push(change);
  return changes;
}

/** Sets each named field on `target` (changed in place) and returns it. */
export function applyChanges(target, changes) {
  for (const { path, value } of changes || []) {
    let at = target;
    for (let index = 0; index < path.length - 1; index += 1) {
      if (!isMap(at[path[index]]) && !Array.isArray(at[path[index]])) at[path[index]] = {};
      at = at[path[index]];
    }
    at[path[path.length - 1]] = value === undefined ? null : JSON.parse(JSON.stringify(value));
  }
  return target;
}

// For the sheet page, which loads this file by its own script tag before sheet.js and reads it from the window
// (sheet.js must not wait for an import: see the note there).
if (typeof window !== 'undefined') window.SheetChanges = { COUNTERS, WHOLE_FIELDS, sameValue, diffSheet, applyChanges };
