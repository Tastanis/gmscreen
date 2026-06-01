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
  phaseTick = null,
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

  placement.readyTriggerAbilities = ready;
  placement.readyTriggerSources = sources;
  placement.readyTriggerPayloads = payloads;
  placement.hasReadyTrigger = true;
  placement.triggerSetAtPhase = phaseTick;
  placement._lastModified = now;

  return {
    hasReadyTrigger: true,
    readyTriggerAbilities: ready,
    readyTriggerSources: sources,
    readyTriggerPayloads: payloads,
    triggerSetAtPhase: phaseTick,
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
  if (!nextHas) placement.triggerSetAtPhase = null;
  placement._lastModified = now;

  return {
    hasReadyTrigger: nextHas,
    readyTriggerAbilities: nextReady,
    readyTriggerSources: nextSources,
    readyTriggerPayloads: nextPayloads,
    triggerSetAtPhase: nextHas ? placement.triggerSetAtPhase : null,
  };
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
