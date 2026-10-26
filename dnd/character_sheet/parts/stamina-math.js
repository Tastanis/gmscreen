// Stamina and temporary Stamina (Draw Steel rules, Director's ruling October 2026).
//
// Temporary Stamina is its OWN number, kept beside Stamina (sheet: hero.vitals.tempStamina; token:
// placement.tempStamina). Damage takes it first and the rest comes off Stamina. Gaining temporary Stamina keeps the
// HIGHER of what is held and what is gained (it never adds). Healing never adds it and never removes it. It does not
// count toward winded or dying. It ends at the end of combat.
//
// Older data kept temporary Stamina as Stamina above the maximum. `staminaState` reads that as temporary Stamina
// (the excess moves over, Stamina stops at the maximum). Reading it twice changes nothing more.
//
// Pure: no page, no network. Used by the sheet, the map's side panel, the board and the tests.

const whole = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Math.trunc(Number(value));
  return null;
};

/**
 * {current, max, temp} from a sheet's vitals ({currentStamina, staminaMax, tempStamina}) or a token's hit points
 * ({current, max} plus a temp given separately). Over-max Stamina from before the change becomes temporary.
 * `max` is null when there is none.
 */
export function staminaState(source = {}, tempOverride = undefined) {
  const s = source && typeof source === 'object' ? source : {};
  const rawCurrent = 'currentStamina' in s ? s.currentStamina : s.current;
  const rawMax = 'staminaMax' in s ? s.staminaMax : s.max;
  const rawTemp = tempOverride !== undefined ? tempOverride : ('tempStamina' in s ? s.tempStamina : s.temp);
  const max = whole(rawMax);
  let current = whole(rawCurrent);
  let temp = Math.max(0, whole(rawTemp) ?? 0);
  if (current === null) current = max !== null && max > 0 ? max : 0;
  if (max !== null && max > 0 && current > max) {
    temp = Math.max(temp, current - max);
    current = max;
  }
  return { current, max: max !== null && max > 0 ? max : null, temp };
}

/** Damage: temporary Stamina first, the rest from Stamina (which may go below nought). */
export function damageStamina(state, amount) {
  const s = staminaState(state);
  const hit = Math.max(0, whole(amount) ?? 0);
  const fromTemp = Math.min(s.temp, hit);
  return { ...s, temp: s.temp - fromTemp, current: s.current - (hit - fromTemp), absorbed: fromTemp };
}

/** Healing: Stamina up as far as the maximum (never lowered); temporary Stamina untouched. */
export function healStamina(state, amount) {
  const s = staminaState(state);
  const heal = Math.max(0, whole(amount) ?? 0);
  const next = s.max !== null ? Math.max(s.current, Math.min(s.max, s.current + heal)) : s.current + heal;
  return { ...s, current: next };
}

/** Gaining temporary Stamina: the higher of what is held and what is gained. */
export function gainTempStamina(state, amount) {
  const s = staminaState(state);
  return { ...s, temp: Math.max(s.temp, Math.max(0, whole(amount) ?? 0)) };
}

/**
 * How the bar is drawn: green from the left for Stamina (a share of the maximum), blue from the RIGHT edge for
 * temporary Stamina (a share of the maximum, at most the whole bar). Winded and dying from Stamina only.
 */
export function staminaBarView(state) {
  const s = staminaState(state);
  const max = s.max || 0;
  const greenPct = max > 0 ? Math.max(0, Math.min(100, (Math.max(0, s.current) / max) * 100)) : (s.current > 0 ? 100 : 0);
  const negativePct = max > 0 && s.current < 0 ? Math.min(100, (Math.abs(s.current) / max) * 100) : 0;
  const bluePct = s.temp > 0 ? (max > 0 ? Math.min(100, (s.temp / max) * 100) : 100) : 0;
  const winded = max > 0 && s.current <= Math.floor(max / 2) && s.current > 0;
  const dying = s.current <= 0 && max > 0;
  const label = `${s.current} / ${max > 0 ? max : '—'}${s.temp > 0 ? ` +${s.temp}` : ''}`;
  return { ...s, greenPct: Math.round(greenPct * 10) / 10, bluePct: Math.round(bluePct * 10) / 10, negativePct: Math.round(negativePct * 10) / 10, winded, dying, label, windedAt: max > 0 ? Math.floor(max / 2) : null };
}

/** A Recovery heals a third of the Stamina maximum (rounded down). */
export function recoveryValueOf(vitals = {}) {
  const max = whole(vitals?.staminaMax) ?? 0;
  return max > 0 ? Math.floor(max / 3) : 0;
}

const api = { staminaState, damageStamina, healStamina, gainTempStamina, staminaBarView, recoveryValueOf };
if (typeof window !== 'undefined') window.StaminaMath = api;
export default api;
