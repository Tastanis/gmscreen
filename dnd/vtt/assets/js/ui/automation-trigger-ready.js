export function cloneTriggerSnapshot(eventSnapshot) {
  if (!eventSnapshot || typeof eventSnapshot !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(eventSnapshot));
  } catch (_err) {
    return eventSnapshot;
  }
}

export function applyTriggerReadyState(placement, {
  abilityId = null,
  sourceId = null,
  eventSnapshot = null,
  markRound = null,
  markCombatantId = null,
  now = Date.now(),
} = {}) {
  if (!placement || typeof placement !== 'object') return null;
  const ready = Array.isArray(placement.readyTriggerAbilities)
    ? [...placement.readyTriggerAbilities]
    : [];
  if (abilityId && !ready.includes(abilityId)) ready.push(abilityId);

  const sources = placement.readyTriggerSources && typeof placement.readyTriggerSources === 'object'
    ? { ...placement.readyTriggerSources }
    : {};
  if (abilityId && sourceId) sources[abilityId] = sourceId;

  const payloads = placement.readyTriggerPayloads && typeof placement.readyTriggerPayloads === 'object'
    ? { ...placement.readyTriggerPayloads }
    : {};
  if (abilityId && eventSnapshot && typeof eventSnapshot === 'object') {
    payloads[abilityId] = cloneTriggerSnapshot(eventSnapshot);
  }

  const round = Number.isFinite(Number(markRound)) ? Math.max(0, Math.trunc(Number(markRound))) : null;
  const combatantId = typeof markCombatantId === 'string' && markCombatantId ? markCombatantId : null;

  placement.readyTriggerAbilities = ready;
  placement.readyTriggerSources = sources;
  placement.readyTriggerPayloads = payloads;
  placement.hasReadyTrigger = true;
  placement.triggerMarkRound = round;
  placement.triggerMarkCombatantId = combatantId;
  // Legacy field from the GM-local phase-tick expiry system; scrub it so old
  // clients' stale stamps don't linger on the placement.
  placement.triggerSetAtPhase = null;
  placement._lastModified = now;

  return {
    hasReadyTrigger: true,
    readyTriggerAbilities: ready,
    readyTriggerSources: sources,
    readyTriggerPayloads: payloads,
    triggerMarkRound: round,
    triggerMarkCombatantId: combatantId,
  };
}

export function clearTriggerReadyState(placement, abilityId = null, { now = Date.now() } = {}) {
  if (!placement || typeof placement !== 'object') return null;
  const priorSources = placement.readyTriggerSources && typeof placement.readyTriggerSources === 'object'
    ? placement.readyTriggerSources
    : {};
  const priorPayloads = placement.readyTriggerPayloads && typeof placement.readyTriggerPayloads === 'object'
    ? placement.readyTriggerPayloads
    : {};
  let nextReady;
  let nextSources;
  let nextPayloads;

  if (abilityId) {
    nextReady = (Array.isArray(placement.readyTriggerAbilities) ? placement.readyTriggerAbilities : [])
      .filter((id) => id !== abilityId);
    nextSources = { ...priorSources };
    delete nextSources[abilityId];
    nextPayloads = { ...priorPayloads };
    delete nextPayloads[abilityId];
  } else {
    nextReady = [];
    nextSources = {};
    nextPayloads = {};
  }

  const nextHas = nextReady.length > 0;
  placement.readyTriggerAbilities = nextReady;
  placement.readyTriggerSources = nextSources;
  placement.readyTriggerPayloads = nextPayloads;
  placement.hasReadyTrigger = nextHas;
  if (!nextHas) {
    placement.triggerMarkRound = null;
    placement.triggerMarkCombatantId = null;
    placement.triggerSetAtPhase = null;
  }
  placement._lastModified = now;

  return {
    hasReadyTrigger: nextHas,
    readyTriggerAbilities: nextReady,
    readyTriggerSources: nextSources,
    readyTriggerPayloads: nextPayloads,
    triggerMarkRound: nextHas ? (placement.triggerMarkRound ?? null) : null,
    triggerMarkCombatantId: nextHas ? (placement.triggerMarkCombatantId ?? null) : null,
  };
}

// Decides whether a placement's ready-trigger "!" marker should expire when a
// combatant finishes their turn. Rules:
// - Marker stamped during a creature's turn → expires when THAT creature ends
//   its turn.
// - Marker stamped while no one's turn was active (or by a legacy client that
//   only wrote `triggerSetAtPhase`) → expires at the NEXT turn end, on the
//   assumption the acting player forgot to press Start Turn.
export function shouldExpireReadyTriggerAtTurnEnd(placement, finishedCombatantId) {
  if (!placement || typeof placement !== 'object') return false;
  const hasReady = Boolean(placement.hasReadyTrigger)
    || (Array.isArray(placement.readyTriggerAbilities) && placement.readyTriggerAbilities.length > 0);
  if (!hasReady) return false;
  const markId = typeof placement.triggerMarkCombatantId === 'string' && placement.triggerMarkCombatantId
    ? placement.triggerMarkCombatantId
    : null;
  if (!markId) return true;
  const finishedId = typeof finishedCombatantId === 'string' && finishedCombatantId
    ? finishedCombatantId
    : null;
  return Boolean(finishedId) && markId === finishedId;
}

export function syncTriggeredActionIndicator(tokenElement, placement = {}) {
  if (!tokenElement) return;
  const indicator = tokenElement.querySelector('.vtt-token__trigger-indicator');
  if (indicator) indicator.remove();

  let readyMark = tokenElement.querySelector('.vtt-token__trigger-ready');
  const showReady = Boolean(placement.hasReadyTrigger);
  if (!showReady) {
    if (readyMark) readyMark.remove();
    return;
  }
  if (!readyMark) {
    readyMark = document.createElement('button');
    readyMark.type = 'button';
    readyMark.className = 'vtt-token__trigger-ready';
    readyMark.setAttribute('data-token-trigger-ready', 'true');
    readyMark.setAttribute('aria-label', 'Trigger condition met. Click to clear.');
    readyMark.title = 'Trigger condition met. Click to clear.';
    readyMark.textContent = '!';
    tokenElement.appendChild(readyMark);
  }
}
