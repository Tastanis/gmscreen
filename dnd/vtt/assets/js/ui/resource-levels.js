// How much heroic resource a hero has had this turn (the Null's Discipline Mastery: "Benefits based on how much
// discipline you have last until the end of your turn, even if a benefit would become unavailable to you because of the
// amount of discipline you spend during your turn"). The board says whose turn it is; every page notes a hero's number
// whenever it reads, spends or gains it; a check asks for the most it has been this turn (or its number now, outside a
// turn). Keys are character profile ids ("zepha").

const levels = new Map(); // id -> { value, peak, turn }
let turnKey = '';

function key(characterId) {
  return String(characterId || '').trim().toLowerCase();
}

/** The board's current turn ("round:combatant"); a new turn starts every peak again from the number now. */
export function setResourceTurn(next) {
  const value = String(next || '');
  if (value === turnKey) return;
  turnKey = value;
  for (const entry of levels.values()) {
    entry.turn = turnKey;
    entry.peak = entry.value;
  }
}

/** A hero's number as just read or written. `before` (a spend's number before it) counts toward the turn's peak. */
export function noteResourceLevel(characterId, value, { before = null } = {}) {
  const id = key(characterId);
  const number = Number(value);
  if (!id || !Number.isFinite(number)) return;
  const entry = levels.get(id) || { value: number, peak: number, turn: turnKey };
  if (entry.turn !== turnKey) { entry.turn = turnKey; entry.peak = number; }
  entry.value = number;
  const earlier = Number(before);
  entry.peak = Math.max(entry.peak, number, Number.isFinite(earlier) ? earlier : -Infinity);
  levels.set(id, entry);
}

/** The most the hero has had this turn, or null when this page has not seen the number yet. */
export function resourceLevelOf(characterId) {
  const entry = levels.get(key(characterId));
  if (!entry) return null;
  return turnKey ? Math.max(entry.peak, entry.value) : entry.value;
}

if (typeof globalThis !== 'undefined') {
  globalThis.vttResourceLevels = { setResourceTurn, noteResourceLevel, resourceLevelOf };
}
