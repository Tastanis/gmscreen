import {normalizeTokenRenderGeometry} from './token-presentation.js';
import {normalizePlacementHitPoints} from './token-hit-points.js';
import {ensurePlacementConditions} from './token-conditions.js';
import {normalizeCombatTeam} from '../state/normalize/placements.js';

export function normalizePlacementForRender(placement) {
  if (!placement || typeof placement !== 'object') {
    return null;
  }

  const id = typeof placement.id === 'string' ? placement.id : null;
  if (!id) {
    return null;
  }

  const {column,row,width,height} = normalizeTokenRenderGeometry(placement);
  const name = typeof placement.name === 'string' ? placement.name : '';
  const imageUrl = typeof placement.imageUrl === 'string' ? placement.imageUrl : '';
  const levelId = typeof placement.levelId === 'string' && placement.levelId.trim()
    ? placement.levelId.trim()
    : null;
  const hp = normalizePlacementHitPoints(
    placement.hp ??
      placement.hitPoints ??
      placement?.overlays?.hitPoints ??
      placement?.overlays?.hitPoints?.value ??
      placement?.stats?.hp ??
      null
  );
  const showHp = Boolean(placement.showHp ?? placement.showHitPoints ?? placement?.overlays?.hitPoints?.visible ?? false);
  const showTriggeredAction = Boolean(
    placement.showTriggeredAction ?? placement?.overlays?.triggeredAction?.visible ?? false
  );
  const triggeredActionReady =
    placement.triggeredActionReady ?? placement?.overlays?.triggeredAction?.ready ?? true;
  const mainActionUsedThisTurn = Boolean(placement.mainActionUsedThisTurn);
  const maneuverUsedThisTurn = Boolean(placement.maneuverUsedThisTurn);
  const readyTriggerAbilities = Array.isArray(placement.readyTriggerAbilities)
    ? placement.readyTriggerAbilities.filter((id) => typeof id === 'string' && id.length)
    : [];
  const hasReadyTrigger = Boolean(placement.hasReadyTrigger || readyTriggerAbilities.length);
  const conditions = ensurePlacementConditions(
    placement?.conditions ??
      placement.condition ??
      placement?.status ??
      placement?.overlays?.condition ??
      placement?.overlays?.conditions ??
      null
  );
  const condition = conditions[0] ?? null;
  const team = normalizeCombatTeam(
    placement.combatTeam ??
      placement.team ??
      placement?.tags?.team ??
      placement?.faction ??
      placement?.alignment ??
      null
  );
  const hidden = toBoolean(
    placement.hidden ?? placement.isHidden ?? placement?.flags?.hidden ?? false,
    false
  );
  const marks = placement.marks && typeof placement.marks === 'object' && !Array.isArray(placement.marks)
    ? JSON.parse(JSON.stringify(placement.marks))
    : {};
  const activeMarks = placement.activeMarks && typeof placement.activeMarks === 'object' && !Array.isArray(placement.activeMarks)
    ? JSON.parse(JSON.stringify(placement.activeMarks))
    : {};

  return {
    id,
    column,
    row,
    width,
    height,
    name,
    imageUrl,
    levelId,
    hp,
    showHp,
    showTriggeredAction,
    triggeredActionReady: triggeredActionReady !== false,
    mainActionUsedThisTurn,
    maneuverUsedThisTurn,
    hasReadyTrigger,
    readyTriggerAbilities,
    conditions,
    condition,
    team,
    hidden,
    marks,
    activeMarks,
  };
}

export function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
    return fallback;
  }

  if (typeof value === 'object' && value !== null) {
    return toBoolean(value.valueOf(), fallback);
  }

  return fallback;
}
