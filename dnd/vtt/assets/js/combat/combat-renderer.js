import { normalizeCombatTeam } from './combat-state.js';

export function renderCombatTracker({
  elements = {},
  combatants = [],
  options = {},
  state = {},
  callbacks = {},
  documentRef = globalThis.document,
  HTMLElementCtor = globalThis.HTMLElement,
} = {}) {
  const root = elements.root ?? null;
  const waitingContainer = elements.waiting ?? null;
  const completedContainer = elements.completed ?? null;

  if (!root || !waitingContainer || !completedContainer || !documentRef) {
    return { rendered: false, entries: [], activeIds: new Set() };
  }

  const gmViewing = Boolean(callbacks.isGmUser?.());
  const rawEntries = Array.isArray(combatants) ? combatants.filter(Boolean) : [];
  const toBoolean = typeof callbacks.toBoolean === 'function' ? callbacks.toBoolean : toBooleanValue;
  const entries = rawEntries.filter(
    (entry) => gmViewing || !toBoolean(entry.hidden ?? entry.isHidden ?? false, false)
  );

  root.dataset.viewerRole = gmViewing ? 'gm' : 'player';

  const originalOrder = new Map();
  entries.forEach((entry, index) => {
    const id = typeof entry?.id === 'string' ? entry.id : null;
    if (id) {
      originalOrder.set(id, index);
    }
  });

  const combatantTeams = state.combatantTeams instanceof Map ? state.combatantTeams : new Map();
  combatantTeams.clear();
  entries.forEach((entry) => {
    const id = typeof entry?.id === 'string' ? entry.id : null;
    if (!id) {
      return;
    }
    const team = normalizeCombatTeam(entry.team ?? entry.combatTeam ?? null);
    combatantTeams.set(id, team);
  });

  if (!gmViewing) {
    sortPlayerTrackerEntries(entries, {
      originalOrder,
      combatantTeams,
      getCombatantProfileId: callbacks.getCombatantProfileId,
    });
  }

  const activeIds = normalizeIdSet(options?.activeIds);
  if (!activeIds.size) {
    rawEntries.forEach((entry) => {
      if (entry && typeof entry.id === 'string') {
        activeIds.add(entry.id);
      }
    });
  }

  if (!options?.skipCache) {
    callbacks.setLastCombatTrackerEntries?.(entries.map(cloneCombatantEntry).filter(Boolean));
    callbacks.setLastCombatTrackerActiveIds?.(new Set(activeIds));
  } else if (options?.activeIds) {
    callbacks.setLastCombatTrackerActiveIds?.(new Set(activeIds));
  }

  const visibleEntryIds = new Set();
  entries.forEach((entry) => {
    if (entry && typeof entry.id === 'string') {
      visibleEntryIds.add(entry.id);
    }
  });

  const displayRepresentatives = gmViewing
    ? new Map()
    : callbacks.buildDisplayRepresentatives?.(visibleEntryIds) ?? new Map();

  if (!options?.skipPrune) {
    const groupsPruned = gmViewing ? Boolean(callbacks.pruneCombatGroups?.(activeIds)) : false;
    if (gmViewing) {
      callbacks.pruneCompletedCombatants?.(activeIds);
    }

    if (groupsPruned && callbacks.shouldSyncPrunedGroups?.()) {
      callbacks.syncCombatStateToStore?.();
    }
  }

  const groupColorAssignmentResult = callbacks.getCombatGroupColorAssignments?.();
  const groupColorAssignments =
    groupColorAssignmentResult instanceof Map ? groupColorAssignmentResult : new Map();

  const waitingFragment = documentRef.createDocumentFragment();
  const completedFragment = documentRef.createDocumentFragment();
  const renderedRepresentatives = new Set();
  const getCombatActive = asGetter(callbacks.getCombatActive, false);
  const getActiveCombatantId = asGetter(callbacks.getActiveCombatantId, null);
  const completedCombatants =
    state.completedCombatants instanceof Set ? state.completedCombatants : new Set();

  entries.forEach((combatant) => {
    const id = typeof combatant?.id === 'string' ? combatant.id : null;
    if (!id) {
      return;
    }

    const actualRepresentativeId = callbacks.getRepresentativeIdFor?.(id);
    const isDisplayRepresentative = displayRepresentatives.has(id);
    const displayRepForGroup = displayRepresentatives.get(id);

    if (!isDisplayRepresentative && (!actualRepresentativeId || actualRepresentativeId !== id)) {
      return;
    }

    const representativeId = isDisplayRepresentative ? displayRepForGroup : actualRepresentativeId;
    if (!representativeId || renderedRepresentatives.has(representativeId)) {
      return;
    }
    renderedRepresentatives.add(representativeId);

    const token = createCombatantTokenNode({
      combatant,
      representativeId,
      gmViewing,
      visibleEntryIds,
      displayRepresentatives,
      groupColorAssignments,
      combatantTeams,
      completedCombatants,
      getCombatActive,
      getActiveCombatantId,
      getCombatantTeam: callbacks.getCombatantTeam,
      getGroupMembers: callbacks.getGroupMembers,
      getVisibleGroupMembers: callbacks.getVisibleGroupMembers,
      documentRef,
      HTMLElementCtor,
    });

    if (!token) {
      return;
    }

    const isCompleted = getCombatActive() && completedCombatants.has(representativeId);
    if (isCompleted) {
      completedFragment.appendChild(token);
    } else {
      waitingFragment.appendChild(token);
    }
  });

  const activeCombatantId = getActiveCombatantId();
  if (activeCombatantId && !renderedRepresentatives.has(activeCombatantId) && gmViewing) {
    callbacks.setActiveCombatantId?.(null);
  }

  const trackerHoverTokenIds =
    state.trackerHoverTokenIds instanceof Set ? state.trackerHoverTokenIds : new Set();
  if (trackerHoverTokenIds.size) {
    const staleIds = Array.from(trackerHoverTokenIds);
    trackerHoverTokenIds.clear();
    staleIds.forEach((id) => callbacks.updateBoardTokenHighlight?.(id));
  }

  waitingContainer.innerHTML = '';
  waitingContainer.appendChild(waitingFragment);
  waitingContainer.dataset.empty = waitingContainer.children.length ? 'false' : 'true';

  completedContainer.innerHTML = '';
  completedContainer.appendChild(completedFragment);
  completedContainer.dataset.empty = completedContainer.children.length ? 'false' : 'true';

  const hasCombatants = waitingContainer.children.length || completedContainer.children.length;
  root.dataset.hasCombatants = hasCombatants ? 'true' : 'false';

  callbacks.attachTrackerHoverHandlers?.(waitingContainer);
  callbacks.attachTrackerHoverHandlers?.(completedContainer);
  callbacks.refreshCombatantStateClasses?.();
  callbacks.updateCombatModeIndicators?.();

  if (gmViewing) {
    callbacks.cancelTrackerOverflowRefresh?.();
    callbacks.refreshTrackerOverflowIndicators?.();
  } else {
    callbacks.setSectionOverflowState?.(waitingContainer, false);
    callbacks.setSectionOverflowState?.(completedContainer, false);
    callbacks.scheduleTrackerOverflowRefresh?.();
  }

  return {
    rendered: true,
    entries,
    activeIds,
    renderedRepresentatives,
  };
}

export function createCombatantTokenNode({
  combatant,
  representativeId,
  gmViewing = false,
  visibleEntryIds = new Set(),
  groupColorAssignments = new Map(),
  combatantTeams = new Map(),
  completedCombatants = new Set(),
  getCombatActive = () => false,
  getActiveCombatantId = () => null,
  getCombatantTeam = () => 'ally',
  getGroupMembers = (id) => [id],
  getVisibleGroupMembers = (id) => [id],
  documentRef = globalThis.document,
  HTMLElementCtor = globalThis.HTMLElement,
} = {}) {
  if (!documentRef || !representativeId || !combatant || typeof combatant !== 'object') {
    return null;
  }

  const label =
    typeof combatant.name === 'string' && combatant.name.trim() ? combatant.name.trim() : 'Token';
  const token = documentRef.createElement('div');
  token.className = 'vtt-combat-token';
  token.dataset.combatantId = representativeId;
  token.setAttribute('role', 'listitem');
  token.setAttribute('tabindex', gmViewing ? '0' : '-1');

  const groupMembers = gmViewing
    ? normalizeStringArray(getGroupMembers(representativeId))
    : normalizeStringArray(getVisibleGroupMembers(representativeId, visibleEntryIds));
  const groupSize = groupMembers.length;
  const accessibleLabel = groupSize > 1 ? `${label} (group of ${groupSize})` : label;
  token.setAttribute('aria-label', accessibleLabel);
  token.title = accessibleLabel;

  const imageUrl = typeof combatant.imageUrl === 'string' ? combatant.imageUrl : '';
  if (imageUrl) {
    const img = documentRef.createElement('img');
    img.src = imageUrl;
    img.alt = label;
    token.appendChild(img);
  } else {
    const initials = documentRef.createElement('span');
    initials.className = 'vtt-combat-token__initials';
    initials.textContent = deriveCombatTokenInitials(label);
    token.appendChild(initials);
  }

  if (groupSize > 1) {
    token.dataset.groupSize = String(groupSize);
  } else if ('groupSize' in token.dataset) {
    delete token.dataset.groupSize;
  }

  const groupColorIndex = groupSize > 1 ? groupColorAssignments.get(representativeId) : null;
  if (groupColorIndex) {
    token.dataset.groupColor = String(groupColorIndex);
  } else if ('groupColor' in token.dataset) {
    delete token.dataset.groupColor;
  }

  const team = getCombatantTeam(representativeId);
  if (team) {
    token.dataset.combatTeam = team;
  } else if ('combatTeam' in token.dataset) {
    delete token.dataset.combatTeam;
  }

  groupMembers.forEach((memberId) => {
    if (memberId) {
      combatantTeams.set(memberId, team);
    }
  });

  const isCompleted = getCombatActive() && completedCombatants.has(representativeId);
  token.dataset.combatState = isCompleted ? 'completed' : 'waiting';
  applyCombatantStateToNode(token, representativeId, {
    combatActive: getCombatActive(),
    activeCombatantId: getActiveCombatantId(),
    completedCombatants,
    gmViewing,
    HTMLElementCtor,
  });

  return token;
}

export function applyCombatantStateToNode(
  node,
  representativeId,
  {
    combatActive = false,
    activeCombatantId = null,
    completedCombatants = new Set(),
    gmViewing = false,
    HTMLElementCtor = globalThis.HTMLElement,
  } = {}
) {
  if (!isHtmlElement(node, HTMLElementCtor)) {
    return;
  }

  const isRepresentative = typeof representativeId === 'string' && representativeId !== '';
  const isActive = Boolean(combatActive && isRepresentative && representativeId === activeCombatantId);
  const isCompleted = Boolean(
    combatActive && isRepresentative && completedCombatants.has(representativeId)
  );

  node.classList.toggle('is-active', isActive);
  node.classList.toggle('is-completed', isCompleted);
  if (isActive) {
    node.setAttribute('aria-current', 'true');
  } else {
    node.removeAttribute('aria-current');
  }

  const state = isCompleted ? 'completed' : isActive ? 'active' : 'waiting';
  node.dataset.combatState = state;
  node.setAttribute('tabindex', gmViewing ? '0' : '-1');
}

export function refreshCombatantStateClasses({
  root = null,
  combatActive = false,
  activeCombatantId = null,
  completedCombatants = new Set(),
  gmViewing = false,
  HTMLElementCtor = globalThis.HTMLElement,
} = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return;
  }

  Array.from(root.querySelectorAll('[data-combatant-id]')).forEach((node) => {
    if (!isHtmlElement(node, HTMLElementCtor)) {
      return;
    }
    applyCombatantStateToNode(node, node.dataset.combatantId || null, {
      combatActive,
      activeCombatantId,
      completedCombatants,
      gmViewing,
      HTMLElementCtor,
    });
  });
}

export function cloneCombatantEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const clone = { ...entry };
  if (entry.hp && typeof entry.hp === 'object') {
    clone.hp = { ...entry.hp };
  }
  return clone;
}

export function deriveCombatTokenInitials(label) {
  const trimmed = typeof label === 'string' ? label.trim() : '';
  if (!trimmed) {
    return '?';
  }

  const words = trimmed.split(/\s+/).slice(0, 2);
  const initials = words
    .map((word) => word.charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase();
  return initials || trimmed.charAt(0).toUpperCase();
}

export function getPlayerTrackerSortCategory(combatantId, playerProfileIds, prioritizedPcSet, combatantTeams) {
  if (typeof combatantId !== 'string' || !combatantId) {
    return 3;
  }
  if (prioritizedPcSet?.has(combatantId)) {
    return 0;
  }
  if (playerProfileIds?.has(combatantId)) {
    return 1;
  }
  const team = combatantTeams?.get?.(combatantId);
  if (team === 'ally') {
    return 1;
  }
  if (team === 'enemy') {
    return 2;
  }
  return 3;
}

function sortPlayerTrackerEntries(entries, { originalOrder, combatantTeams, getCombatantProfileId }) {
  const playerProfileIds = new Map();
  const prioritizedPcIds = [];

  entries.forEach((entry) => {
    const id = typeof entry?.id === 'string' ? entry.id : null;
    if (!id) {
      return;
    }
    const profileId =
      typeof getCombatantProfileId === 'function' ? getCombatantProfileId(id) : null;
    if (profileId && !playerProfileIds.has(id)) {
      playerProfileIds.set(id, profileId);
      if (prioritizedPcIds.length < 4) {
        prioritizedPcIds.push(id);
      }
    }
  });

  const prioritizedPcSet = new Set(prioritizedPcIds);

  entries.sort((a, b) => {
    const aId = typeof a?.id === 'string' ? a.id : '';
    const bId = typeof b?.id === 'string' ? b.id : '';
    const aCategory = getPlayerTrackerSortCategory(
      aId,
      playerProfileIds,
      prioritizedPcSet,
      combatantTeams
    );
    const bCategory = getPlayerTrackerSortCategory(
      bId,
      playerProfileIds,
      prioritizedPcSet,
      combatantTeams
    );
    if (aCategory !== bCategory) {
      return aCategory - bCategory;
    }
    const aIndex = originalOrder.get(aId) ?? 0;
    const bIndex = originalOrder.get(bId) ?? 0;
    return aIndex - bIndex;
  });
}

function normalizeIdSet(value) {
  const source = value instanceof Set ? Array.from(value) : value ?? [];
  if (!source || typeof source === 'string' || typeof source[Symbol.iterator] !== 'function') {
    return new Set();
  }
  return new Set(Array.from(source).filter((id) => typeof id === 'string' && id));
}

function normalizeStringArray(value) {
  if (!value || typeof value === 'string' || typeof value[Symbol.iterator] !== 'function') {
    return [];
  }
  return Array.from(value).filter((id) => typeof id === 'string' && id);
}

function asGetter(candidate, fallback) {
  if (typeof candidate === 'function') {
    return candidate;
  }
  return () => fallback;
}

function isHtmlElement(node, HTMLElementCtor) {
  if (!node) {
    return false;
  }
  if (typeof HTMLElementCtor === 'function') {
    return node instanceof HTMLElementCtor;
  }
  return node.nodeType === 1;
}

function toBooleanValue(value, fallback = false) {
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
    return toBooleanValue(value.valueOf(), fallback);
  }

  return fallback;
}
