const PC_CHARACTER_IDS = new Set(['cal', 'sharon', 'indigo', 'zepha']);

const SKILL_GROUPS = {
  Crafting: [
    'Alchemy',
    'Architecture',
    'Blacksmithing',
    'Carpentry',
    'Cooking',
    'Fletching',
    'Forgery',
    'Jewelry',
    'Mechanics',
    'Tailoring',
  ],
  Exploration: [
    'Climb',
    'Drive',
    'Endurance',
    'Gymnastics',
    'Heal',
    'Jump',
    'Lift',
    'Navigate',
    'Ride',
    'Swim',
    'Track',
  ],
  Interpersonal: [
    'Brag',
    'Empathize',
    'Flirt',
    'Gamble',
    'Handle Animals',
    'Interrogate',
    'Intimidate',
    'Lead',
    'Lie',
    'Music',
    'Perform',
    'Persuade',
    'Read Person',
  ],
  Intrigue: [
    'Alertness',
    'Conceal Object',
    'Disguise',
    'Eavesdrop',
    'Escape Artist',
    'Hide',
    'Pick Lock',
    'Pick Pocket',
    'Sabotage',
    'Search',
    'Sneak',
  ],
  Lore: [
    'Culture',
    'Criminal Underworld',
    'History',
    'Magic',
    'Monsters',
    'Nature',
    'Psionics',
    'Religion',
    'Rumors',
    'Society',
    'Strategy',
    'Timescape',
  ],
};

const ABILITY_CATEGORIES = [
  { key: 'triggers', label: 'Trigger', heading: 'Triggers', empty: 'No triggers listed.' },
  { key: 'mains', label: 'Main Action', heading: 'Main Actions', empty: 'No main actions listed.' },
  { key: 'maneuvers', label: 'Maneuver', heading: 'Maneuvers', empty: 'No maneuvers listed.' },
];

const TEST_TIER_LABELS = {
  low: '<= 11',
  mid: '12-16',
  high: '17+',
};

const PANEL_VISIBILITY_STORAGE_PREFIX = 'vtt:character-summary:open:';
const ABILITY_TRAY_BODY_OPEN_CLASS = 'vtt-character-ability-tray-is-open';
const HERO_TOKEN_SYNC_CHANNEL = 'vtt-hero-token-sync';
const CHARACTER_SHEET_SYNC_CHANNEL = 'vtt-character-sheet-sync';
const STAMINA_SYNC_CHANNEL = 'vtt-stamina-sync';
const CHARACTER_SHEET_SYNC_INTERVAL_MS = 4000;
const CONDITION_OPTIONS = [
  'Bleeding',
  'Dazed',
  'Frightened',
  'Grabbed',
  'Prone',
  'Restrained',
  'Slowed',
  'Taunted',
  'Weakened',
];

export function mountCharacterSummaryPanel(routes = {}, userContext = {}) {
  const panel = document.getElementById('vtt-character-summary-panel');
  if (!panel) {
    return;
  }

  const storageKey = buildPanelVisibilityStorageKey(userContext);
  let panelPreferredOpen = readPanelVisibilityPreference(storageKey);
  let activeRequestId = 0;
  let activeCharacterId = null;
  let activeAbilityCategory = null;
  let activeSheet = null;
  let activeToken = null;
  let activeDisplayName = '';
  let sheetSyncChannel = null;
  let heroTokenSyncChannel = null;
  let staminaSyncChannel = null;
  let sheetSyncInFlight = false;
  const boardHeader = document.querySelector('.vtt-board__header');
  const abilityTray = ensureAbilityTray();
  const abilityPreview = ensureAbilityPreview();
  const revealButton = ensureRevealButton();

  const updatePanelTop = () => {
    if (!boardHeader || !document.body) {
      return;
    }
    const rect = boardHeader.getBoundingClientRect();
    const top = Math.max(12, Math.ceil(rect.bottom + 4));
    document.body.style.setProperty('--vtt-character-panel-top', `${top}px`);
  };

  updatePanelTop();
  window.addEventListener('resize', updatePanelTop);
  if (typeof ResizeObserver === 'function' && boardHeader) {
    const observer = new ResizeObserver(updatePanelTop);
    observer.observe(boardHeader);
  }

  const clearActiveCharacter = () => {
    activeCharacterId = null;
    activeSheet = null;
    activeAbilityCategory = null;
    activeToken = null;
    activeDisplayName = '';
    setPanelOpen(false, { persist: false });
    syncRevealButton();
    renderAbilityTray(abilityTray, null);
    hideAbilityPreview(abilityPreview);
  };

  const setPanelOpen = (open, { persist = true } = {}) => {
    const isOpen = Boolean(open);
    updatePanelTop();
    panel.classList.toggle('vtt-character-summary--open', isOpen);
    panel.classList.toggle('vtt-character-summary--closed', !isOpen);
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    document.body?.classList.toggle('vtt-character-summary-is-open', isOpen);
    if (isOpen && activeSheet) {
      renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
    }
    if (persist) {
      panelPreferredOpen = isOpen;
      writePanelVisibilityPreference(storageKey, isOpen);
    }
    syncRevealButton();
  };

  const showPanel = () => {
    setPanelOpen(true);
  };

  const tuckPanel = () => {
    setPanelOpen(false);
  };

  const setLoading = (name) => {
    activeDisplayName = String(name || activeCharacterId || 'Character');
    panel.innerHTML = `<div class="vtt-character-summary__loading">Loading ${escapeHtml(name || 'character')}...</div>`;
    renderAbilityTray(abilityTray, null);
    hideAbilityPreview(abilityPreview);
    if (panelPreferredOpen) {
      setPanelOpen(true, { persist: false });
    } else {
      setPanelOpen(false, { persist: false });
    }
    syncRevealButton();
  };

  const setError = () => {
    panel.innerHTML = `
      <button type="button" class="vtt-character-summary__tuck" data-character-summary-tuck aria-label="Tuck character sheet" title="Tuck character sheet">&lt;</button>
      <div class="vtt-character-summary__error">Unable to load this character sheet.</div>
    `;
    bindCharacterSummaryControls(panel, { onTuck: tuckPanel });
    renderAbilityTray(abilityTray, null);
    hideAbilityPreview(abilityPreview);
    if (panelPreferredOpen) {
      setPanelOpen(true, { persist: false });
    } else {
      setPanelOpen(false, { persist: false });
    }
  };

  const renderActiveSheet = () => {
    if (!activeCharacterId || !activeSheet) {
      return;
    }
    activeDisplayName = activeSheet?.hero?.name || activeToken?.name || formatCharacterName(activeCharacterId);
    panel.innerHTML = renderCharacterCard(activeSheet, {
      characterId: activeCharacterId,
      token: activeToken,
    });
    bindCharacterSummaryControls(panel, {
      onTuck: tuckPanel,
      onHeroToken: handleHeroTokenClick,
      onStaminaAction: handleStaminaAction,
      onRecovery: handleRecoveryClick,
      onSurgeDelta: handleSurgeDelta,
      onResourceDelta: handleResourceDelta,
      onResourceRoll: handleResourceRoll,
      onVictory: handleVictoryClick,
      onConditionAdd: handleConditionAdd,
    });
    renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
    autoRegisterActiveTriggerAbilities();
    syncRevealButton();
  };

  const refreshActiveSheet = async ({ force = false } = {}) => {
    if (!activeCharacterId || sheetSyncInFlight) {
      return;
    }
    if (!force && document.visibilityState === 'hidden') {
      return;
    }
    sheetSyncInFlight = true;
    try {
      activeSheet = await fetchCharacterSummary(routes, activeCharacterId);
      renderActiveSheet();
    } catch (error) {
      console.warn('[VTT] Failed to refresh character summary', error);
    } finally {
      sheetSyncInFlight = false;
    }
  };

  const getSheetSyncChannel = () => {
    if (typeof BroadcastChannel !== 'function') {
      return null;
    }
    if (!sheetSyncChannel) {
      sheetSyncChannel = new BroadcastChannel(CHARACTER_SHEET_SYNC_CHANNEL);
    }
    return sheetSyncChannel;
  };

  const getHeroTokenSyncChannel = () => {
    if (typeof BroadcastChannel !== 'function') {
      return null;
    }
    if (!heroTokenSyncChannel) {
      heroTokenSyncChannel = new BroadcastChannel(HERO_TOKEN_SYNC_CHANNEL);
    }
    return heroTokenSyncChannel;
  };

  const getStaminaSyncChannel = () => {
    if (typeof BroadcastChannel !== 'function') {
      return null;
    }
    if (!staminaSyncChannel) {
      staminaSyncChannel = new BroadcastChannel(STAMINA_SYNC_CHANNEL);
    }
    return staminaSyncChannel;
  };

  const broadcastStaminaChange = () => {
    const vitals = activeSheet?.hero?.vitals;
    if (!activeCharacterId || !vitals) return;
    const channel = getStaminaSyncChannel();
    if (!channel) return;
    channel.postMessage({
      type: 'stamina-sync',
      source: 'vtt',
      character: activeCharacterId,
      currentStamina: Number.isFinite(Number(vitals.currentStamina)) ? Number(vitals.currentStamina) : 0,
      staminaMax: Number.isFinite(Number(vitals.staminaMax)) ? Number(vitals.staminaMax) : 0,
    });
  };

  const broadcastSheetChange = (change) => {
    const channel = getSheetSyncChannel();
    if (channel && activeCharacterId) {
      channel.postMessage({
        type: 'character-sheet-sync',
        source: 'vtt',
        character: activeCharacterId,
        change,
      });
    }
    document.dispatchEvent(new CustomEvent('vtt:character-sheet-updated', {
      detail: { characterId: activeCharacterId, change },
    }));
  };

  const saveActiveSheet = async (change) => {
    if (!activeCharacterId || !activeSheet) {
      return false;
    }
    const saved = await saveCharacterSummarySheet(activeSheet, { characterId: activeCharacterId, routes });
    if (saved) {
      broadcastSheetChange(change);
      if (change === 'stamina' || change === 'recovery') {
        broadcastStaminaChange();
      }
    }
    return saved;
  };

  function autoRegisterActiveTriggerAbilities() {
    if (!activeSheet || !activeToken?.id) return;
    const triggerActions = Array.isArray(activeSheet.actions?.triggers) ? activeSheet.actions.triggers : [];
    triggerActions.forEach((action, actionIndex) => {
      const automation = normalizeAutomation(action?.automation);
      if (!hasAbilityAutomation(automation)) return;
      const triggerBlocks = (automation.cards || []).filter((block) => block?.type === 'trigger' && block.match);
      if (!triggerBlocks.length) return;
      const abilityId = action?._stableActionId || getStableActionId(action, 'triggers', actionIndex);
      triggerBlocks.forEach((block) => {
        requestAutomationRegisterTrigger({
          casterId: activeToken.id,
          abilityId,
          abilityName: action.name || 'Triggered Ability',
          actionLabel: action.actionLabel || '',
          freeTriggered: isFreeTriggeredActionLabel(action.actionLabel || ''),
          match: block.match,
          effects: block.effects || [],
          targetGroup: block.target || '',
          targetIds: [],
          condition: block.condition || '',
          note: block.note || '',
        }).catch((error) => {
          console.warn('[VTT] Failed to auto-register triggered ability', action?.name || abilityId, error);
        });
      });
    });
  }

  async function showCharacter(detail = {}) {
    const characterId = normalizeCharacterId(detail.characterId);
    if (!characterId) {
      close();
      return;
    }

    const isNewCharacter = activeCharacterId !== characterId;
    activeCharacterId = characterId;
    if (isNewCharacter) {
      activeAbilityCategory = null;
    }
    const requestId = ++activeRequestId;
    const token = detail.token && typeof detail.token === 'object' ? detail.token : {};
    activeToken = clonePlain(token);
    setLoading(token.name || characterId);

    try {
      const sheet = await fetchCharacterSummary(routes, characterId);
      if (requestId !== activeRequestId || activeCharacterId !== characterId) {
        return;
      }
      activeSheet = sheet;
      renderActiveSheet();
      if (panelPreferredOpen) {
        setPanelOpen(true, { persist: false });
      } else {
        setPanelOpen(false, { persist: false });
      }
    } catch (error) {
      console.warn('[VTT] Failed to load character summary', error);
      if (requestId === activeRequestId) {
        setError();
      }
    }
  }

  async function handleHeroTokenClick(index, button) {
    if (!activeSheet || !activeCharacterId || index < 0 || index > 1) {
      return;
    }
    const tokens = normalizeHeroTokens(activeSheet.hero?.heroTokens);
    const isSpent = Boolean(tokens[index]);
    if (!isSpent) {
      const agreed = await showHeroTokenConfirmation(button);
      if (!agreed) {
        return;
      }
    }
    tokens[index] = !isSpent;
    activeSheet.hero = activeSheet.hero && typeof activeSheet.hero === 'object' ? activeSheet.hero : {};
    activeSheet.hero.heroTokens = tokens;
    renderActiveSheet();
    try {
      const payload = new URLSearchParams();
      payload.append('action', 'sync-hero-tokens');
      payload.append('character', activeCharacterId);
      payload.append('tokenIndex', String(index));
      payload.append('tokenState', tokens[index] ? '1' : '0');
      const endpoint = typeof routes?.sheet === 'string' && routes.sheet ? routes.sheet : '/dnd/character_sheet/handler.php';
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        body: payload,
      });
      const result = await response.json();
      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to sync hero token');
      }
      activeSheet.hero.heroTokens = normalizeHeroTokens(result.heroTokens);
      renderActiveSheet();
      const heroChannel = getHeroTokenSyncChannel();
      if (heroChannel) {
        heroChannel.postMessage({ type: 'hero-token-sync', heroTokens: result.heroTokens });
      }
      broadcastSheetChange('heroTokens');
    } catch (error) {
      console.warn('[VTT] Failed to update hero token', error);
      refreshActiveSheet({ force: true });
    }
  }

  async function handleStaminaAction(action) {
    const vitals = activeSheet?.hero?.vitals;
    if (!vitals) return;
    const amount = promptForPositiveInt(action === 'damage' ? 'How much damage?' : 'How much healing?');
    if (!amount) return;
    const current = numberLike(vitals.currentStamina, 0);
    const max = numberLike(vitals.staminaMax, 0);
    if (action === 'damage') {
      vitals.currentStamina = current - amount;
    } else {
      const healed = current + amount;
      if (max > 0 && healed > max) {
        const overflow = healed - max;
        const useTemp = window.confirm(`Healing would go ${overflow} over max. Use the extra as temporary Stamina? OK = temp, Cancel = heal to max.`);
        vitals.currentStamina = useTemp ? healed : max;
      } else {
        vitals.currentStamina = healed;
      }
    }
    appendStaminaHistory(vitals, vitals.currentStamina);
    renderActiveSheet();
    await saveActiveSheet('stamina');
  }

  async function handleRecoveryClick() {
    const vitals = activeSheet?.hero?.vitals;
    if (!vitals) return;
    const currentRecoveries = numberLike(vitals.currentRecoveries, 0);
    const recoveryValue = numberLike(vitals.recoveryValue || computeRecoveryValue(vitals), 0);
    if (currentRecoveries <= 0 || recoveryValue <= 0) {
      return;
    }
    if (!window.confirm(`Spend 1 recovery to heal ${recoveryValue} Stamina?`)) {
      return;
    }
    const current = numberLike(vitals.currentStamina, 0);
    const max = numberLike(vitals.staminaMax, 0);
    vitals.currentRecoveries = Math.max(0, currentRecoveries - 1);
    vitals.currentStamina = max > 0 ? Math.min(max, current + recoveryValue) : current + recoveryValue;
    appendStaminaHistory(vitals, vitals.currentStamina);
    renderActiveSheet();
    await saveActiveSheet('recovery');
  }

  async function handleSurgeDelta(delta) {
    const hero = activeSheet?.hero;
    if (!hero) return;
    const current = Math.max(0, numberLike(hero.surges, 0));
    hero.surges = Math.max(0, current + delta);
    hero.surgesUsed = 0;
    renderActiveSheet();
    await saveActiveSheet('surges');
  }

  async function handleResourceDelta(delta) {
    const resource = activeSheet?.hero?.resource;
    if (!resource) return;
    resource.value = (Number.parseInt(resource.value ?? 0, 10) || 0) + delta;
    renderActiveSheet();
    await saveActiveSheet('resource');
  }

  async function handleResourceRoll() {
    const resource = activeSheet?.hero?.resource;
    if (!resource) return;
    const autoGain = resolveAutoResourceGain(resource.autoDice || '');
    if (!autoGain) {
      window.alert('No resource auto gain is set on this character sheet.');
      return;
    }
    const current = Number.parseInt(resource.value ?? 0, 10) || 0;
    resource.value = current + autoGain.amount;
    renderActiveSheet();
    await saveActiveSheet('resource');
    window.alert(`${resource.title || 'Resource'} ${autoGain.label}: +${autoGain.amount} (${current} -> ${resource.value}).`);
  }

  async function handleVictoryClick() {
    const hero = activeSheet?.hero;
    if (!hero) return;
    if (!window.confirm('Do you want to add a victory point?')) {
      return;
    }
    hero.victories = (Number.parseInt(hero.victories ?? 0, 10) || 0) + 1;
    renderActiveSheet();
    await saveActiveSheet('victories');
  }

  function handleConditionAdd(conditionName) {
    const placementId = activeToken?.id || '';
    const name = String(conditionName || '').trim();
    if (!placementId || !name) {
      return;
    }
    document.dispatchEvent(new CustomEvent('vtt:automation-apply-condition', {
      detail: {
        payload: {
          placementId,
          condition: { name, duration: 'save-ends' },
        },
      },
    }));
  }

  const sheetChannel = getSheetSyncChannel();
  if (sheetChannel) {
    sheetChannel.addEventListener('message', (event) => {
      const payload = event?.data;
      if (!payload || payload.type !== 'character-sheet-sync' || payload.source === 'vtt') {
        return;
      }
      const character = String(payload.character || '').trim().toLowerCase();
      if (!activeCharacterId || (character && character !== activeCharacterId)) {
        return;
      }
      refreshActiveSheet({ force: true });
    });
  }

  const heroChannel = getHeroTokenSyncChannel();
  if (heroChannel) {
    heroChannel.addEventListener('message', (event) => {
      const payload = event?.data;
      if (!payload || payload.type !== 'hero-token-sync' || !activeSheet?.hero) {
        return;
      }
      activeSheet.hero.heroTokens = normalizeHeroTokens(payload.heroTokens);
      renderActiveSheet();
    });
  }

  window.setInterval(() => refreshActiveSheet(), CHARACTER_SHEET_SYNC_INTERVAL_MS);

  document.addEventListener('vtt:token-selection-summary', (event) => {
    const detail = event?.detail ?? {};
    if (!detail.characterId) {
      clearActiveCharacter();
      return;
    }
    showCharacter(detail);
  });

  // The board resets triggered actions at combat start, each new round, and
  // combat end by mutating the placement store. Our `activeToken` is a clone
  // captured at selection time, so those store flips don't reach the rendered
  // TRIGGER dot on their own. Re-sync the clone and re-render when our active
  // token is among the reset placements (manual toggles already self-sync).
  document.addEventListener('vtt:triggered-actions-reset', (event) => {
    if (!activeToken || typeof activeToken !== 'object' || !activeToken.id) {
      return;
    }
    const ids = event?.detail?.placementIds;
    if (Array.isArray(ids) && ids.length && !ids.includes(activeToken.id)) {
      return;
    }
    activeToken.triggeredActionReady = true;
    activeToken.triggeredActionUsedThisRound = false;
    activeToken.mainActionUsedThisTurn = false;
    activeToken.maneuverUsedThisTurn = false;
    activeToken.hasReadyTrigger = false;
    activeToken.readyTriggerAbilities = [];
    activeToken.readyTriggerSources = {};
    activeToken.readyTriggerPayloads = {};
    renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
  });

  document.addEventListener('vtt:turn-action-usage-changed', (event) => {
    if (!activeToken || typeof activeToken !== 'object' || !activeToken.id) {
      return;
    }
    const detail = event?.detail ?? {};
    const placementId = String(detail.placementId || '').trim();
    if (placementId && placementId !== activeToken.id) {
      return;
    }
    const actionKind = normalizeActionUsageKind(detail.actionKind);
    if (actionKind === 'main') {
      activeToken.mainActionUsedThisTurn = Boolean(detail.used);
    } else if (actionKind === 'maneuver') {
      activeToken.maneuverUsedThisTurn = Boolean(detail.used);
    } else {
      activeToken.mainActionUsedThisTurn = false;
      activeToken.maneuverUsedThisTurn = false;
    }
    renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
  });

  revealButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (!activeCharacterId) {
      return;
    }
    showPanel();
  });

  function syncRevealButton() {
    const hasCharacter = Boolean(activeCharacterId);
    const isOpen = panel.classList.contains('vtt-character-summary--open');
    revealButton.hidden = !hasCharacter || isOpen;
    revealButton.setAttribute('aria-hidden', revealButton.hidden ? 'true' : 'false');
    const label = activeDisplayName ? `Show ${activeDisplayName} sheet` : 'Show character sheet';
    revealButton.setAttribute('aria-label', label);
    revealButton.title = label;
    const nameEl = revealButton.querySelector('[data-character-summary-reveal-name]');
    if (nameEl) {
      nameEl.textContent = activeDisplayName || 'Sheet';
    }
  }

  abilityTray.addEventListener('click', (event) => {
    // Trigger-dot toggle (above the TRIGGER tab) — dispatches to the board to
    // flip triggeredActionReady on the placement.
    const triggerDot = event.target.closest('[data-character-trigger-toggle]');
    if (triggerDot) {
      event.preventDefault();
      event.stopPropagation();
      const placementId = triggerDot.dataset.placementId || '';
      if (placementId) {
        // Optimistic local update so the dot flips instantly.
        if (activeToken && typeof activeToken === 'object') {
          const wasReady = activeToken.triggeredActionReady !== false;
          activeToken.triggeredActionReady = !wasReady;
          if (!wasReady) {
            activeToken.triggeredActionUsedThisRound = false;
          }
          renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
        }
        document.dispatchEvent(new CustomEvent('vtt:toggle-triggered-action', { detail: { placementId } }));
      }
      return;
    }

    const actionDot = event.target.closest('[data-character-action-toggle]');
    if (actionDot) {
      event.preventDefault();
      event.stopPropagation();
      const placementId = actionDot.dataset.placementId || '';
      const actionKind = normalizeActionUsageKind(actionDot.dataset.actionKind);
      if (placementId && actionKind) {
        if (activeToken && typeof activeToken === 'object') {
          const key = actionKind === 'main' ? 'mainActionUsedThisTurn' : 'maneuverUsedThisTurn';
          activeToken[key] = !Boolean(activeToken[key]);
          renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
        }
        document.dispatchEvent(new CustomEvent('vtt:toggle-turn-action-usage', {
          detail: { placementId, actionKind },
        }));
      }
      return;
    }

    // Clicking the blue "!" badge clears all ready-trigger flags for this token.
    const triggerClear = event.target.closest('[data-character-trigger-clear]');
    if (triggerClear) {
      event.preventDefault();
      event.stopPropagation();
      const placementId = triggerClear.dataset.placementId || '';
      if (placementId) {
        if (activeToken && typeof activeToken === 'object') {
          activeToken.hasReadyTrigger = false;
          activeToken.readyTriggerAbilities = [];
          activeToken.readyTriggerSources = {};
          activeToken.readyTriggerPayloads = {};
          activeToken.triggerSetAtPhase = null;
          renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
        }
        document.dispatchEvent(new CustomEvent('vtt:clear-trigger-ready', { detail: { placementId } }));
      }
      return;
    }

    const abilityItem = event.target.closest('[data-character-ability-item]');
    if (abilityItem && activeSheet) {
      const action = getAbilityAction(activeSheet, abilityItem.dataset.abilityCategory, abilityItem.dataset.abilityIndex, { activeToken });
      if (action && hasAbilityAutomation(action.automation)) {
        event.preventDefault();
        event.stopPropagation();
        // If this ability was injected because a trigger condition was met
        // (e.g. opp-attack), clear that trigger from the placement now so
        // the blue "!" disappears and the player can't fire it twice.
        const clearsTrigger = abilityItem.dataset.clearsTrigger || '';
        const sourcePlacementId = activeToken?.id || '';
        // The mover that triggered the opp-attack is stored on the token at
        // mark-ready time. Capture it BEFORE dispatching the clear (which
        // wipes the sources map). The target picker pulses this token red.
        const suggestedTargetId = (clearsTrigger && activeToken?.readyTriggerSources && typeof activeToken.readyTriggerSources === 'object')
          ? (activeToken.readyTriggerSources[clearsTrigger] || '')
          : '';
        // The firing-event payload (damage amount, etc.) is also stashed on
        // the placement at mark-ready time. Capture it BEFORE the clear
        // dispatch so trigger-aware effects like halveTriggeringDamage know
        // what damage event armed them.
        const triggerSnapshot = (clearsTrigger && activeToken?.readyTriggerPayloads && typeof activeToken.readyTriggerPayloads === 'object')
          ? activeToken.readyTriggerPayloads[clearsTrigger]
          : null;
        const triggerPayload = triggerSnapshot && typeof triggerSnapshot === 'object' ? triggerSnapshot : null;
        if (clearsTrigger && sourcePlacementId) {
          if (activeToken && typeof activeToken === 'object') {
            activeToken.readyTriggerAbilities = (Array.isArray(activeToken.readyTriggerAbilities) ? activeToken.readyTriggerAbilities : [])
              .filter((id) => id !== clearsTrigger);
            if (activeToken.readyTriggerSources && typeof activeToken.readyTriggerSources === 'object') {
              delete activeToken.readyTriggerSources[clearsTrigger];
            }
            if (activeToken.readyTriggerPayloads && typeof activeToken.readyTriggerPayloads === 'object') {
              delete activeToken.readyTriggerPayloads[clearsTrigger];
            }
            activeToken.hasReadyTrigger = activeToken.readyTriggerAbilities.length > 0;
            if (!activeToken.hasReadyTrigger) activeToken.triggerSetAtPhase = null;
          }
          document.dispatchEvent(new CustomEvent('vtt:clear-trigger-ready', {
            detail: { placementId: sourcePlacementId, abilityId: clearsTrigger },
          }));
        }
        const itemRect = abilityItem.getBoundingClientRect();
        activeAbilityCategory = null;
        hideAbilityPreview(abilityPreview);
        renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
        startAbilityAutomation(activeSheet, action, abilityItem.dataset.abilityCategory, activeToken, {
          characterId: activeCharacterId,
          routes,
          suggestedTargetId,
          triggerPayload,
          manualTriggerResolution: abilityItem.dataset.abilityCategory === 'triggers' && !triggerPayload,
          automationAnchor: {
            left: itemRect.left,
            top: itemRect.top,
            right: itemRect.right,
            bottom: itemRect.bottom,
            width: itemRect.width,
            height: itemRect.height,
          },
        });
      }
      return;
    }

    const categoryButton = event.target.closest('[data-character-ability-category]');
    if (!categoryButton || !activeSheet) {
      return;
    }
    const category = categoryButton.dataset.characterAbilityCategory || '';
    activeAbilityCategory = activeAbilityCategory === category ? null : category;
    hideAbilityPreview(abilityPreview);
    renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
  });

  abilityTray.addEventListener('pointerover', (event) => {
    const item = event.target.closest('[data-character-ability-item]');
    if (!item || !activeSheet) {
      return;
    }
    const action = getAbilityAction(activeSheet, item.dataset.abilityCategory, item.dataset.abilityIndex, { activeToken });
    if (action) {
      renderAbilityPreview(abilityPreview, action, item.dataset.abilityCategory, activeSheet);
    }
  });

  abilityTray.addEventListener('pointerout', (event) => {
    const item = event.target.closest('[data-character-ability-item]');
    if (!item || item.contains(event.relatedTarget)) {
      return;
    }
    hideAbilityPreview(abilityPreview);
  });

  abilityTray.addEventListener('focusin', (event) => {
    const item = event.target.closest('[data-character-ability-item]');
    if (!item || !activeSheet) {
      return;
    }
    const action = getAbilityAction(activeSheet, item.dataset.abilityCategory, item.dataset.abilityIndex, { activeToken });
    if (action) {
      renderAbilityPreview(abilityPreview, action, item.dataset.abilityCategory, activeSheet);
    }
  });

  abilityTray.addEventListener('focusout', (event) => {
    const item = event.target.closest('[data-character-ability-item]');
    if (!item || item.contains(event.relatedTarget)) {
      return;
    }
    hideAbilityPreview(abilityPreview);
  });
}

function ensureAbilityTray() {
  let tray = document.getElementById('vtt-character-ability-tray');
  if (!tray) {
    tray = document.createElement('div');
    tray.id = 'vtt-character-ability-tray';
    tray.className = 'vtt-character-ability-tray';
    tray.setAttribute('aria-hidden', 'true');
    document.body?.appendChild(tray);
  }
  return tray;
}

function ensureAbilityPreview() {
  let preview = document.getElementById('vtt-character-ability-preview');
  if (!preview) {
    preview = document.createElement('aside');
    preview.id = 'vtt-character-ability-preview';
    preview.className = 'vtt-character-ability-preview';
    preview.setAttribute('aria-hidden', 'true');
    document.body?.appendChild(preview);
  }
  return preview;
}

function ensureRevealButton() {
  let button = document.getElementById('vtt-character-summary-reveal');
  if (!button) {
    button = document.createElement('button');
    button.id = 'vtt-character-summary-reveal';
    button.className = 'vtt-character-summary-reveal';
    button.type = 'button';
    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
    button.innerHTML = `
      <span class="vtt-character-summary-reveal__chevron" aria-hidden="true">&gt;</span>
      <span class="vtt-character-summary-reveal__name" data-character-summary-reveal-name>Sheet</span>
    `;
    document.body?.appendChild(button);
  }
  return button;
}

function bindCharacterSummaryControls(panel, {
  onTuck = null,
  onHeroToken = null,
  onStaminaAction = null,
  onRecovery = null,
  onSurgeDelta = null,
  onResourceDelta = null,
  onResourceRoll = null,
  onVictory = null,
  onConditionAdd = null,
} = {}) {
  panel.querySelectorAll('[data-character-summary-tuck]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onTuck === 'function') {
        onTuck();
      }
    });
  });

  panel.querySelectorAll('[data-character-condition-remove]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const placementId = button.dataset.placementId || '';
      const conditionIndex = Number.parseInt(button.dataset.conditionIndex || '', 10);
      if (!placementId || !Number.isInteger(conditionIndex) || conditionIndex < 0) {
        return;
      }

      document.dispatchEvent(
        new CustomEvent('vtt:character-summary-remove-condition', {
          detail: {
            placementId,
            conditionIndex,
          },
        })
      );
    });
  });

  panel.querySelectorAll('[data-character-hero-token]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const index = Number.parseInt(button.dataset.characterHeroToken || '', 10);
      onHeroToken?.(index, button);
    });
  });

  panel.querySelectorAll('[data-character-stamina-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onStaminaAction?.(button.dataset.characterStaminaAction || '');
    });
  });

  panel.querySelectorAll('[data-character-recovery]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onRecovery?.();
    });
  });

  panel.querySelectorAll('[data-character-surge-delta]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onSurgeDelta?.(Number.parseInt(button.dataset.characterSurgeDelta || '0', 10) || 0);
    });
  });

  panel.querySelectorAll('[data-character-resource-delta]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onResourceDelta?.(Number.parseInt(button.dataset.characterResourceDelta || '0', 10) || 0);
    });
  });

  panel.querySelectorAll('[data-character-resource-roll]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onResourceRoll?.();
    });
  });

  panel.querySelectorAll('[data-character-add-victory]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onVictory?.();
    });
  });

  panel.querySelectorAll('[data-character-condition-select]').forEach((select) => {
    select.addEventListener('change', () => {
      const value = select.value;
      select.value = '';
      onConditionAdd?.(value);
    });
  });
}

function renderAbilityTray(tray, sheet, { activeCategory = null, activeToken = null } = {}) {
  if (!tray) {
    return;
  }
  if (!sheet) {
    tray.innerHTML = '';
    tray.setAttribute('aria-hidden', 'true');
    tray.classList.remove('vtt-character-ability-tray--open');
    document.body?.classList.remove(ABILITY_TRAY_BODY_OPEN_CLASS);
    return;
  }

  const placement = activeToken && typeof activeToken === 'object' ? activeToken : null;
  const showTriggerDot = Boolean(placement?.showTriggeredAction ?? placement?.overlays?.triggeredAction?.visible ?? false);
  const triggerReady = placement ? placement.triggeredActionReady !== false : true;
  const triggerPlacementId = placement?.id ? String(placement.id) : '';
  const hasReadyTrigger = Boolean(placement?.hasReadyTrigger);
  const mainActionUsed = Boolean(placement?.mainActionUsedThisTurn);
  const maneuverUsed = Boolean(placement?.maneuverUsedThisTurn);

  tray.innerHTML = `
    <nav class="vtt-character-ability-tray__inner" aria-label="Character abilities">
      ${ABILITY_CATEGORIES.map((category) => {
        const actions = getAbilityActions(sheet, category.key, { activeToken });
        const isActive = activeCategory === category.key;
        const isTrigger = category.key === 'triggers';
        const actionUsageKind = normalizeActionUsageKind(category.key);
        const actionUsed = actionUsageKind === 'main'
          ? mainActionUsed
          : actionUsageKind === 'maneuver'
            ? maneuverUsed
            : false;
        // NOTE: nested <button> inside <button> is invalid HTML and breaks
        // layout (browsers split them). The dot uses <span role="button">
        // so it stays inside the parent tab.
        const dotHtml = isTrigger && showTriggerDot && triggerPlacementId
          ? `<span
              class="vtt-character-ability-tab__trigger-dot${triggerReady ? '' : ' is-spent'}"
              role="button"
              tabindex="0"
              data-character-trigger-toggle
              data-placement-id="${escapeAttribute(triggerPlacementId)}"
              aria-label="${triggerReady ? 'Triggered action ready. Click to mark used.' : 'Triggered action used. Click to reset.'}"
              title="${triggerReady ? 'Triggered action ready' : 'Triggered action used'}"
            ></span>`
          : actionUsageKind && triggerPlacementId
            ? `<span
                class="vtt-character-ability-tab__action-dot${actionUsed ? ' is-spent' : ''}"
                role="button"
                tabindex="0"
                data-character-action-toggle
                data-placement-id="${escapeAttribute(triggerPlacementId)}"
                data-action-kind="${escapeAttribute(actionUsageKind)}"
                aria-label="${actionUsed ? `${category.label} used. Click to reset.` : `${category.label} unused. Click to mark used.`}"
                title="${actionUsed ? `${category.label} used` : `${category.label} unused`}"
              ></span>`
          : '';
        const tabClass = `vtt-character-ability-tab${isTrigger && hasReadyTrigger ? ' has-ready-trigger' : ''}`;
        return `
          <div class="vtt-character-ability-category${isActive ? ' is-active' : ''}">
            ${isActive ? renderAbilityList(category, actions, { activeToken }) : ''}
            <button
              class="${tabClass}"
              type="button"
              data-character-ability-category="${escapeAttribute(category.key)}"
              aria-expanded="${isActive ? 'true' : 'false'}"
            >${dotHtml}<span class="vtt-character-ability-tab__label">${escapeHtml(category.label)}</span></button>
          </div>
        `;
      }).join('')}
    </nav>
  `;
  tray.setAttribute('aria-hidden', 'false');
  tray.classList.add('vtt-character-ability-tray--open');
  document.body?.classList.add(ABILITY_TRAY_BODY_OPEN_CLASS);
}

function renderAbilityList(category, actions, opts = {}) {
  const activeToken = opts.activeToken || null;
  return `
    <div class="vtt-character-ability-list" role="menu" aria-label="${escapeAttribute(category.heading)}">
      <div class="vtt-character-ability-list__heading">${escapeHtml(category.heading)}</div>
      ${actions.length
        ? actions.map((action, index) => renderAbilityItem(action, category.key, index, { activeToken })).join('')
        : `<div class="vtt-character-ability-empty">${escapeHtml(category.empty)}</div>`}
    </div>
  `;
}

function renderAbilityItem(action, categoryKey, index, opts = {}) {
  const name = action?.name || 'Untitled Ability';
  const meta = summarizeAbility(action, categoryKey);
  const automated = hasAbilityAutomation(action?.automation);
  const ready = Array.isArray(opts.activeToken?.readyTriggerAbilities) ? opts.activeToken.readyTriggerAbilities : [];
  // When an ability is ready because a trigger condition was met, the existing
  // category icon turns blue and pulses. Avoid inserting a second icon in this
  // tight row; it can crush the title/meta columns.
  const actionId = action?._stableActionId || getStableActionId(action, categoryKey, index);
  const triggerId = action?._injectedTriggerId || (actionId && ready.includes(actionId) ? actionId : '');
  return `
    <button
      class="vtt-character-ability-item${automated ? ' vtt-character-ability-item--automated' : ''}${triggerId ? ' vtt-character-ability-item--trigger-ready' : ''}"
      type="button"
      role="menuitem"
      data-character-ability-item
      data-ability-category="${escapeAttribute(categoryKey)}"
      data-ability-index="${escapeAttribute(index)}"
      ${triggerId ? `data-clears-trigger="${escapeAttribute(triggerId)}"` : ''}
    >
      <span class="vtt-character-ability-item__mark" aria-hidden="true">${escapeHtml(getAbilityIcon(categoryKey))}</span>
      <span class="vtt-character-ability-item__text">
        <span class="vtt-character-ability-item__name">${escapeHtml(name)}</span>
        ${meta ? `<span class="vtt-character-ability-item__meta">${escapeHtml(meta)}</span>` : ''}
      </span>
      ${renderAbilityCostBadge(action)}
      ${automated ? '<span class="vtt-character-ability-item__auto" title="Automated" aria-label="Automated">A</span>' : ''}
    </button>
  `;
}

// Render the heroic-resource cost as a prominent right-side badge so the player
// can read it at a glance. The number is colour-tiered by magnitude (the more
// expensive the ability, the louder the badge).
function renderAbilityCostBadge(action) {
  const raw = String(action?.cost || '').trim();
  if (!raw) return '';
  const { amount, name } = parseAbilityResourceCost(raw);
  // Non-numeric / unparseable costs stay on the meta line (summarizeAbility).
  if (amount <= 0) return '';
  const tier = amount >= 5 ? 'high' : amount >= 3 ? 'mid' : 'low';
  const label = name
    ? `<span class="vtt-character-ability-item__cost-label">${escapeHtml(name)}</span>`
    : '';
  return `<span class="vtt-character-ability-item__cost" data-cost-tier="${tier}" title="Costs ${escapeAttribute(raw)}" aria-label="Costs ${escapeAttribute(raw)}"><span class="vtt-character-ability-item__cost-value">${amount}</span>${label}</span>`;
}

function renderAbilityPreview(preview, action, categoryKey, sheet = null) {
  if (!preview || !action) {
    return;
  }

  const title = action.name || 'Untitled Ability';
  const actionLabel = action.actionLabel || getAbilityCategoryLabel(categoryKey);
  const tags = Array.isArray(action.tags) ? action.tags.filter(Boolean) : [];
  const useWhen = typeof action.useWhen === 'string' ? action.useWhen.trim() : '';
  const descriptionBlocks = extractTextBlocks(action.description || '');
  const tests = Array.isArray(action.tests) ? action.tests : [];
  const previewTests = applyFeatureModifiersToPreviewTests(tests, action, sheet);

  preview.innerHTML = `
    <article class="vtt-character-ability-card">
      <header class="vtt-character-ability-card__header">
        <h2>${escapeHtml(title)}</h2>
        ${action.cost ? `<span class="vtt-character-ability-card__cost">${escapeHtml(action.cost)}</span>` : ''}
      </header>
      <div class="vtt-character-ability-card__type">
        <strong>${escapeHtml(actionLabel)}</strong>
        ${tags.length ? `<span>${escapeHtml(tags.join(', '))}</span>` : ''}
      </div>
      ${useWhen ? `<p class="vtt-character-ability-card__when">${escapeHtml(useWhen)}</p>` : ''}
      ${renderAbilityMeta(action, categoryKey)}
      ${descriptionBlocks.length
        ? `<div class="vtt-character-ability-card__description">${descriptionBlocks.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}</div>`
        : ''}
      ${previewTests.length ? `<div class="vtt-character-ability-card__tests">${previewTests.map((test) => renderAbilityTest(test, sheet)).join('')}</div>` : ''}
    </article>
  `;
  preview.setAttribute('aria-hidden', 'false');
  preview.classList.add('vtt-character-ability-preview--open');
}

function hideAbilityPreview(preview) {
  if (!preview) {
    return;
  }
  preview.setAttribute('aria-hidden', 'true');
  preview.classList.remove('vtt-character-ability-preview--open');
}

function renderAbilityMeta(action, categoryKey) {
  const entries = [
    ['Range', action.range],
    ['Target', action.target],
    ...(categoryKey === 'triggers' ? [['Trigger', action.trigger]] : []),
  ].filter(([, value]) => typeof value === 'string' && value.trim());

  if (!entries.length) {
    return '';
  }

  return `
    <dl class="vtt-character-ability-card__meta">
      ${entries.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join('')}
    </dl>
  `;
}

function renderAbilityTest(test, sheet = null) {
  const tiers = test?.tiers && typeof test.tiers === 'object' ? test.tiers : {};
  return `
    <section class="vtt-character-ability-test">
      <header>
        <strong>${escapeHtml(test?.label || 'Power Roll')}</strong>
        <span>${escapeHtml(formatRoll(test?.rollMod))}</span>
      </header>
      ${test?.beforeEffect ? `<p>${escapeHtml(test.beforeEffect)}</p>` : ''}
      <div class="vtt-character-ability-test__tiers">
        ${Object.entries(TEST_TIER_LABELS).map(([key, label]) => renderAbilityTier(label, tiers[key], sheet)).join('')}
      </div>
      ${test?.additionalEffect ? `<p>${escapeHtml(test.additionalEffect)}</p>` : ''}
    </section>
  `;
}

function renderAbilityTier(label, tier = {}, sheet = null) {
  const parts = [];
  if (tier?.damage) {
    const damage = resolveDamagePreview(tier.damage, sheet);
    parts.push(`${damage}${tier.damageType ? ` ${tier.damageType}` : ''}`);
  }
  const noteHasPotency = hasPotencyShorthand(tier?.notes);
  if (tier?.notes) {
    parts.push(resolvePotencyNotePreview(tier.notes, sheet));
  }
  if (tier?.attributeCheck?.enabled && !noteHasPotency) {
    const attribute = tier.attributeCheck.attribute || 'Attribute';
    const threshold = resolvePotencyThresholdPreview(tier.attributeCheck.threshold, sheet);
    const effect = tier.attributeCheck.effect || '';
    parts.push(`${attribute} < ${threshold}${effect ? `: ${effect}` : ''}`);
  }
  if (!parts.length) {
    return '';
  }
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(parts.join(' | '))}</p>
    </div>
  `;
}

function hasPotencyShorthand(text) {
  return /\b(?:M|A|R|I|P|Might|Agility|Reason|Intuition|Presence)\s*<\s*(?:w|v|s|weak|average|strong)\b/i.test(String(text || ''));
}

function resolvePotencyNotePreview(text, sheet = null) {
  const raw = String(text || '').trim();
  if (!raw || !sheet) {
    return raw;
  }
  return raw.replace(
    /\b(M|A|R|I|P|Might|Agility|Reason|Intuition|Presence)\s*<\s*(w|v|s|weak|average|strong)\b/gi,
    (_match, attribute, level) => {
      const fullAttribute = normalizeAttributeName(attribute) || attribute;
      const threshold = resolvePotencyThresholdPreview(level, sheet);
      return `${fullAttribute} < ${threshold}`;
    }
  );
}

function resolvePotencyThresholdPreview(level, sheet = null) {
  const raw = String(level || '').trim();
  if (!raw || !sheet) {
    return raw || '-';
  }
  if (/^-?\d+$/.test(raw)) {
    return raw;
  }
  const highest = getHighestAttributeBonus(sheet);
  const normalized = raw.toLowerCase();
  if (normalized === 's' || normalized === 'strong') return String(highest);
  if (normalized === 'v' || normalized === 'average') return String(highest - 1);
  if (normalized === 'w' || normalized === 'weak') return String(highest - 2);
  return raw;
}

function applyFeatureModifiersToPreviewTests(tests, action, sheet = null) {
  if (!Array.isArray(tests) || !tests.length) {
    return [];
  }
  const matched = collectPreviewModifiers(action, sheet);
  if (!matched.length) {
    return tests;
  }
  const damageBonus = matched.reduce((sum, modifier) => sum + (Number.parseInt(modifier.apply?.damageBonus, 10) || 0), 0);
  if (!damageBonus) {
    return tests;
  }
  return tests.map((test) => ({
    ...test,
    tiers: Object.fromEntries(
      Object.entries(test?.tiers || {}).map(([key, tier]) => [
        key,
        {
          ...tier,
          damage: tier?.damage ? addFlatBonusToDamageText(tier.damage, damageBonus) : tier?.damage,
        },
      ])
    ),
  }));
}

function collectPreviewModifiers(action, sheet = null) {
  const features = Array.isArray(sheet?.features) ? sheet.features : [];
  if (!features.length) {
    return [];
  }
  const keywords = getActionKeywords(action);
  const matched = [];
  for (const feature of features) {
    const modifiers = Array.isArray(feature?.automation?.modifiers) ? feature.automation.modifiers : [];
    for (const modifier of modifiers) {
      if (previewModifierMatches(modifier, keywords, action)) {
        matched.push(modifier);
      }
    }
  }
  return matched;
}

function previewModifierMatches(modifier, keywords, action) {
  if (!modifier || !modifier.match) {
    return false;
  }
  const match = modifier.match;
  const lowerKeywords = keywords.map((keyword) => String(keyword).toLowerCase());
  const hasAll = (items) => (items || []).every((item) => lowerKeywords.includes(String(item).toLowerCase()));
  const hasAny = (items) => !items?.length || items.some((item) => lowerKeywords.includes(String(item).toLowerCase()));
  const hasNone = (items) => !items?.length || items.every((item) => !lowerKeywords.includes(String(item).toLowerCase()));
  if (match.keywordsAll && !hasAll(match.keywordsAll)) return false;
  if (match.keywordsAny && !hasAny(match.keywordsAny)) return false;
  if (match.keywordsNone && !hasNone(match.keywordsNone)) return false;
  if (match.damageType && !actionHasDamageType(action, match.damageType)) return false;
  if (match.attribute && !actionUsesAttribute(action, match.attribute)) return false;
  return true;
}

function getActionKeywords(action) {
  if (Array.isArray(action?.automation?.keywords) && action.automation.keywords.length) {
    return action.automation.keywords;
  }
  if (Array.isArray(action?.keywords) && action.keywords.length) {
    return action.keywords;
  }
  if (Array.isArray(action?.tags) && action.tags.length) {
    return action.tags;
  }
  return [];
}

function actionHasDamageType(action, damageType) {
  const target = String(damageType || '').trim().toLowerCase();
  if (!target) return true;
  for (const test of action?.tests || []) {
    for (const tier of Object.values(test?.tiers || {})) {
      if (String(tier?.damageType || '').trim().toLowerCase() === target) {
        return true;
      }
    }
  }
  return false;
}

function actionUsesAttribute(action, attribute) {
  const target = normalizeAttributeName(attribute);
  if (!target) return true;
  const tests = Array.isArray(action?.tests) ? action.tests : [];
  return tests.some((test) => String(test?.label || '').toLowerCase().includes(target.toLowerCase()));
}

function addFlatBonusToDamageText(damage, bonus) {
  const raw = String(damage || '').trim();
  if (!raw || !bonus) return raw;
  const match = raw.match(/^(-?\d+)(.*)$/);
  if (!match) return raw;
  return `${Number.parseInt(match[1], 10) + bonus}${match[2] || ''}`;
}

function resolveDamagePreview(damage, sheet = null) {
  const raw = String(damage || '').trim();
  if (!raw || !sheet) {
    return raw;
  }

  const diceMatch = raw.match(/\b\d*d\d+\b/i);
  if (diceMatch) {
    return raw.replace(/\b(Might|Agility|Reason|Intuition|Presence|Strongest|M|A|R|I|P)\b(?:\s+or\s+\b(Might|Agility|Reason|Intuition|Presence|Strongest|M|A|R|I|P)\b)*/gi, (match) => {
      const bonus = resolveAttributeChoice(match, sheet);
      return Number.isFinite(bonus) ? String(bonus) : match;
    });
  }

  const normalized = raw
    .replace(/\b(Might|Agility|Reason|Intuition|Presence|Strongest|M|A|R|I|P)\b(?:\s+or\s+\b(Might|Agility|Reason|Intuition|Presence|Strongest|M|A|R|I|P)\b)*/gi, (match) => {
      const bonus = resolveAttributeChoice(match, sheet);
      return Number.isFinite(bonus) ? String(bonus) : match;
    })
    .replace(/\s+/g, ' ')
    .trim();

  if (!/^[\d+\-*/ ().]+$/.test(normalized)) {
    return normalized;
  }

  const total = evaluateSimpleArithmetic(normalized);
  return Number.isFinite(total) ? String(total) : normalized;
}

function resolveAttributeChoice(text, sheet) {
  const attributes = String(text || '')
    .split(/\s+or\s+/i)
    .map(normalizeAttributeName)
    .filter(Boolean);
  if (!attributes.length) {
    return NaN;
  }
  return attributes.reduce((best, attribute) => Math.max(best, getAttributeBonus(sheet, attribute)), -Infinity);
}

function getHighestAttributeBonus(sheet) {
  return ['Might', 'Agility', 'Reason', 'Intuition', 'Presence'].reduce(
    (best, attribute) => Math.max(best, getAttributeBonus(sheet, attribute)),
    0
  );
}

function normalizeAttributeName(attribute) {
  const key = String(attribute || '').trim().toLowerCase();
  const map = {
    m: 'Might',
    might: 'Might',
    a: 'Agility',
    agility: 'Agility',
    r: 'Reason',
    reason: 'Reason',
    i: 'Intuition',
    intuition: 'Intuition',
    p: 'Presence',
    presence: 'Presence',
    strongest: 'Strongest',
  };
  return map[key] || '';
}

function evaluateSimpleArithmetic(expression) {
  const tokens = String(expression || '').match(/\d+|[+\-*/()]/g);
  if (!tokens || tokens.join('') !== String(expression || '').replace(/\s+/g, '')) {
    return NaN;
  }

  let index = 0;
  const peek = () => tokens[index];
  const consume = () => tokens[index++];

  function parsePrimary() {
    const token = consume();
    if (token === '(') {
      const value = parseExpression();
      if (consume() !== ')') return NaN;
      return value;
    }
    if (/^\d+$/.test(token || '')) {
      return Number.parseInt(token, 10);
    }
    return NaN;
  }

  function parseFactor() {
    let value = parsePrimary();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parsePrimary();
      if (!Number.isFinite(value) || !Number.isFinite(right)) return NaN;
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  function parseExpression() {
    let value = parseFactor();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseFactor();
      if (!Number.isFinite(value) || !Number.isFinite(right)) return NaN;
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = parseExpression();
  return index === tokens.length ? result : NaN;
}

async function fetchCharacterSummary(routes, characterId) {
  const endpoint = typeof routes?.sheet === 'string' && routes.sheet ? routes.sheet : '/dnd/character_sheet/handler.php';
  const url = new URL(endpoint, window.location.href);
  url.searchParams.set('action', 'summary');
  url.searchParams.set('character', characterId);
  url.searchParams.set('source', 'vtt');

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Sheet summary failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || payload.success === false || !payload.data) {
    throw new Error(payload?.error || 'Sheet summary response was empty');
  }

  return payload.data;
}

function renderCharacterCard(sheet, { characterId, token } = {}) {
  const hero = sheet?.hero && typeof sheet.hero === 'object' ? sheet.hero : {};
  const sidebar = sheet?.sidebar && typeof sheet.sidebar === 'object' ? sheet.sidebar : {};
  const vitals = hero.vitals && typeof hero.vitals === 'object' ? hero.vitals : {};
  const stats = hero.stats && typeof hero.stats === 'object' ? hero.stats : {};
  const heroTokens = Array.isArray(hero.heroTokens) ? hero.heroTokens : [];
  const resource = hero.resource && typeof hero.resource === 'object' ? hero.resource : {};
  const sidebarResource = sidebar.resource && typeof sidebar.resource === 'object' ? sidebar.resource : {};
  const conditions = normalizeConditions(token?.conditions ?? token?.condition ?? []);
  const featureList = normalizeFeatures(sheet?.features ?? []);

  const name = hero.name || token?.name || formatCharacterName(characterId);
  const className = hero.class || '';
  const classTrack = hero.classTrack || hero.ancestry || '';
  const imageUrl = typeof token?.imageUrl === 'string' ? token.imageUrl : '';
  const staminaCurrent = numberLike(vitals.currentStamina, 0);
  const staminaMax = numberLike(vitals.staminaMax, 0);
  const recoveriesCurrent = numberLike(vitals.currentRecoveries, 0);
  const recoveriesMax = numberLike(vitals.recoveriesMax, 0);
  const recoveryValue = valueOrDash(vitals.recoveryValue || computeRecoveryValue(vitals));
  const healthPercent = staminaMax > 0 ? clamp((staminaCurrent / staminaMax) * 100, 0, 100) : 0;
  const resourceTitle = resource.title || sidebarResource.title || 'Resource';
  const resourceValue = valueOrZero(resource.value);
  const resourceNotes = extractTextBlocks(sidebarResource.text || '');
  const victories = valueOrZero(hero.victories);
  const surges = Math.max(0, numberLike(hero.surges, 0));
  const lists = sidebar.lists && typeof sidebar.lists === 'object' ? sidebar.lists : {};
  const skills = normalizeSkills(sidebar.skills);
  const languageList = Array.isArray(lists.languages) ? lists.languages : [];

  return `
    <article class="vtt-character-card" data-character-id="${escapeHtml(characterId)}">
      <button type="button" class="vtt-character-summary__tuck" data-character-summary-tuck aria-label="Tuck character sheet" title="Tuck character sheet">&lt;</button>
      <header class="vtt-character-card__hero">
        <div class="vtt-character-card__portrait">
          ${imageUrl ? `<img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(name)} token">` : ''}
        </div>
        <div class="vtt-character-card__identity">
          <h2 class="vtt-character-card__name">${escapeHtml(name)}</h2>
          <div class="vtt-character-card__level">Level ${escapeHtml(hero.level || 1)}</div>
          ${className ? `<div class="vtt-character-card__class">${escapeHtml(className)}</div>` : ''}
          ${classTrack ? `<div class="vtt-character-card__track">${escapeHtml(classTrack)}</div>` : ''}
        </div>
        <div class="vtt-character-card__quick">
          ${renderHeroTokenDots(heroTokens)}
          ${renderSurgeControl(surges)}
        </div>
      </header>

      ${renderSection('Stamina', renderStaminaSection({
        staminaCurrent,
        staminaMax,
        healthPercent,
        recoveriesCurrent,
        recoveriesMax,
        recoveryValue,
      }))}

      ${renderSection('Statistics', `
        <div class="vtt-character-stats">
          ${renderStat('Might', stats.might)}
          ${renderStat('Agility', stats.agility)}
          ${renderStat('Reason', stats.reason)}
          ${renderStat('Intuition', stats.intuition)}
          ${renderStat('Presence', stats.presence)}
        </div>
        <div class="vtt-character-vitals">
          ${renderVital('Speed', vitals.speed)}
          ${renderVital('Disengage', vitals.disengage)}
          ${renderVital('Stability', vitals.stability)}
        </div>
      `)}

      ${renderSection('Heroic Resources', `
        <div class="vtt-character-resources">
          <div class="vtt-character-resource-totals">
            ${renderResource('Victories', victories)}
            ${renderResource(resourceTitle, resourceValue, { resource })}
          </div>
          <div class="vtt-character-resource-notes">
            ${resourceNotes.length
              ? resourceNotes.map(renderResourceNote).join('')
              : renderResourceNote('No resource notes listed.')}
          </div>
        </div>
      `)}

      ${renderSection('Auras, Conditions, & Effects', `
        <div class="vtt-character-condition-list">
          ${conditions.length
            ? conditions.map((condition) => renderCondition(condition, token?.id)).join('')
            : renderConditionPicker(token?.id)}
        </div>
      `)}

      ${renderSection('Skills & Languages', `
        <div class="vtt-character-text-list">
          ${renderSkillGroups(skills)}
          ${languageList.length ? `<p><strong>Languages:</strong> ${escapeHtml(languageList.join(', '))}</p>` : ''}
        </div>
      `)}

      ${renderSection('Feats', `
        ${featureList.length
          ? featureList.map(renderFeature).join('')
          : '<p class="vtt-character-feature">No feats listed.</p>'}
      `)}
    </article>
  `;
}

function renderStaminaSection({ staminaCurrent, staminaMax, healthPercent, recoveriesCurrent, recoveriesMax, recoveryValue }) {
  return `
    <div class="vtt-character-stamina">
      <button type="button" class="vtt-character-pill vtt-character-pill--damage" data-character-stamina-action="damage">
        <span class="vtt-character-pill__label">DMG</span>
        <span class="vtt-character-pill__value">-</span>
      </button>
      <div class="vtt-character-pill">
        <span class="vtt-character-pill__value">${escapeHtml(staminaCurrent)} / ${escapeHtml(staminaMax)}</span>
      </div>
      <button type="button" class="vtt-character-pill" data-character-stamina-action="heal">
        <span class="vtt-character-pill__label">Heal</span>
        <span class="vtt-character-pill__value">+</span>
      </button>
      <button type="button" class="vtt-character-pill vtt-character-recovery" data-character-recovery>
        <span class="vtt-character-pill__label">Recoveries</span>
        <span class="vtt-character-recovery__layout">
          <span class="vtt-character-recovery__heal">+${escapeHtml(recoveryValue)}</span>
          <span class="vtt-character-recovery__count">${escapeHtml(recoveriesCurrent)} / ${escapeHtml(recoveriesMax)}</span>
        </span>
        ${renderRecoveryTicks(recoveriesCurrent, recoveriesMax)}
      </button>
      <div class="vtt-character-pill vtt-character-pill--temp">
        <span class="vtt-character-pill__label">Temp</span>
        <span class="vtt-character-pill__value">0</span>
      </div>
    </div>
    <div class="vtt-character-healthbar">
      <div class="vtt-character-healthbar__fill" style="width: ${healthPercent}%;"></div>
      <div class="vtt-character-healthbar__text">${escapeHtml(staminaCurrent)} / ${escapeHtml(staminaMax)}</div>
    </div>
  `;
}

function renderSection(title, body) {
  return `
    <section class="vtt-character-section">
      <header class="vtt-character-section__header">
        <span class="vtt-character-section__icon" aria-hidden="true">=</span>
        <span>${escapeHtml(title)}</span>
      </header>
      <div class="vtt-character-section__body">${body}</div>
    </section>
  `;
}

function renderQuickBox(label, value) {
  return `
    <div class="vtt-character-card__quick-box">
      <span class="vtt-character-card__quick-label">${escapeHtml(label)}</span>
      <span class="vtt-character-card__quick-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderHeroTokenDots(tokens) {
  const normalized = normalizeHeroTokens(tokens);
  return `
    <div class="vtt-character-card__quick-box vtt-character-hero-tokens">
      <span class="vtt-character-card__quick-label">Hero Tokens</span>
      <span class="vtt-character-hero-token-row">
        ${normalized.map((spent, index) => `
          <button
            type="button"
            class="vtt-character-hero-token${spent ? ' is-spent' : ' is-ready'}"
            data-character-hero-token="${index}"
            aria-label="${spent ? 'Reset' : 'Spend'} hero token ${index + 1}"
            title="${spent ? 'Reset hero token' : 'Spend hero token'}"
          ></button>
        `).join('')}
      </span>
    </div>
  `;
}

function renderSurgeControl(surges) {
  return `
    <div class="vtt-character-card__quick-box vtt-character-surge-control">
      <span class="vtt-character-card__quick-label">Surges</span>
      <span class="vtt-character-surge-control__row">
        <button type="button" class="vtt-character-step" data-character-surge-delta="-1" aria-label="Spend a surge">-</button>
        <span class="vtt-character-card__quick-value">${escapeHtml(surges)}</span>
        <button type="button" class="vtt-character-step" data-character-surge-delta="1" aria-label="Add a surge">+</button>
      </span>
    </div>
  `;
}

function renderStat(label, value) {
  return `
    <div class="vtt-character-stat">
      <span class="vtt-character-stat__label">${escapeHtml(label)}</span>
      <span class="vtt-character-stat__value">${formatSigned(value)}</span>
    </div>
  `;
}

function renderVital(label, value) {
  return `
    <div class="vtt-character-vital">
      <div class="vtt-character-vital__label">${escapeHtml(label)}</div>
      <div class="vtt-character-vital__value">${escapeHtml(valueOrDash(value))}</div>
    </div>
  `;
}

function renderResource(label, value, { resource = null } = {}) {
  const autoDice = resource && typeof resource.autoDice === 'string' ? resource.autoDice.trim() : '';
  if (!resource) {
    return `
      <button type="button" class="vtt-character-resource vtt-character-resource--button" data-character-add-victory>
        <div class="vtt-character-resource__label">${escapeHtml(label)}</div>
        <div class="vtt-character-resource__value">${escapeHtml(value)}</div>
      </button>
    `;
  }
  return `
    <div class="vtt-character-resource">
      <div class="vtt-character-resource__label">${escapeHtml(label)}</div>
      <div class="vtt-character-resource__value-row">
        <button type="button" class="vtt-character-step" data-character-resource-delta="1" aria-label="Increase ${escapeAttribute(label)}">▲</button>
        <div class="vtt-character-resource__value">${escapeHtml(value)}</div>
        <button type="button" class="vtt-character-step" data-character-resource-delta="-1" aria-label="Decrease ${escapeAttribute(label)}">▼</button>
        ${autoDice ? `<button type="button" class="vtt-character-roll" data-character-resource-roll aria-label="Roll ${escapeAttribute(autoDice)}">${escapeHtml(autoDice)}</button>` : ''}
      </div>
    </div>
  `;
}

function renderCondition(condition, placementId) {
  const entry = typeof condition === 'object' && condition
    ? condition
    : { label: String(condition || ''), index: 0, hidden: false };
  const label = entry.label || entry.name || 'Effect';
  const index = Number.isInteger(entry.index) ? entry.index : 0;
  const detail = entry.detail || '';
  const removeButton = placementId
    ? `<button class="vtt-character-condition__remove" type="button" data-character-condition-remove data-placement-id="${escapeAttribute(placementId)}" data-condition-index="${escapeAttribute(index)}" aria-label="Remove ${escapeAttribute(label)}">x</button>`
    : '';

  return `
    <span class="vtt-character-condition ${entry.hidden ? 'vtt-character-condition--hidden-effect' : ''}">
      <span class="vtt-character-condition__body">
        <span class="vtt-character-condition__name">${escapeHtml(label)}</span>
        ${detail ? `<span class="vtt-character-condition__detail">${escapeHtml(detail)}</span>` : ''}
      </span>
      ${removeButton}
    </span>
  `;
}

function renderConditionPicker(placementId) {
  if (!placementId) {
    return '<span class="vtt-character-condition">No conditions</span>';
  }
  return `
    <label class="vtt-character-condition vtt-character-condition--picker">
      <span>No conditions</span>
      <select data-character-condition-select aria-label="Add condition">
        <option value="">Add...</option>
        ${CONDITION_OPTIONS.map((condition) => `<option value="${escapeAttribute(condition)}">${escapeHtml(condition)}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderRecoveryTicks(current, max) {
  const total = Math.max(0, Math.min(12, Number(max) || 0));
  if (!total) {
    return '';
  }
  let output = '';
  for (let index = 0; index < total; index += 1) {
    output += `<span class="vtt-character-recovery__tick${index < current ? ' is-filled' : ''}"></span>`;
  }
  return `<span class="vtt-character-recovery__ticks">${output}</span>`;
}

function renderSkillGroups(skills) {
  const grouped = new Map();
  skills.forEach(([skill]) => {
    const group = getSkillGroup(skill);
    if (!grouped.has(group)) {
      grouped.set(group, []);
    }
    grouped.get(group).push(skill);
  });

  if (!grouped.size) {
    return '<p><strong>Skills:</strong> None listed</p>';
  }

  return Array.from(grouped.entries())
    .map(([group, entries]) => `<p><strong>${escapeHtml(group)}:</strong> ${escapeHtml(entries.sort().join(', '))}</p>`)
    .join('');
}

function renderFeature(feature) {
  const title = feature.title || 'Untitled Feat';
  const useWhen = typeof feature.useWhen === 'string' ? feature.useWhen.trim() : '';
  return `
    <p class="vtt-character-feature">
      <span class="vtt-character-feature__title">${escapeHtml(title)}</span>
      ${useWhen ? `<span class="vtt-character-feature__when">${escapeHtml(useWhen)}</span>` : ''}
    </p>
  `;
}

function renderResourceNote(text) {
  return `<p class="vtt-character-resource-note">${escapeHtml(text)}</p>`;
}

function normalizeCharacterId(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PC_CHARACTER_IDS.has(normalized) ? normalized : '';
}

function buildPanelVisibilityStorageKey(userContext = {}) {
  const rawName =
    typeof userContext?.name === 'string' && userContext.name.trim()
      ? userContext.name
      : typeof window !== 'undefined' && typeof window.vttConfig?.currentUser === 'string'
        ? window.vttConfig.currentUser
        : 'anonymous';
  const userKey = rawName.trim().toLowerCase() || 'anonymous';
  return `${PANEL_VISIBILITY_STORAGE_PREFIX}${userKey}`;
}

function readPanelVisibilityPreference(storageKey) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return true;
    }
    const value = window.localStorage.getItem(storageKey);
    if (value === 'closed') {
      return false;
    }
    if (value === 'open') {
      return true;
    }
  } catch (error) {
    // Ignore storage failures; the panel should still work in private mode.
  }
  return true;
}

function writePanelVisibilityPreference(storageKey, open) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(storageKey, open ? 'open' : 'closed');
  } catch (error) {
    // Ignore storage failures; this is a user convenience preference only.
  }
}

function normalizeConditions(value) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { label, name: label, index, hidden: false } : null;
      }
      if (entry && typeof entry === 'object') {
        const hidden = Boolean(entry.hidden || String(entry.name || '').trim().toLowerCase() === 'hiddeneffect');
        const label = formatConditionLabel(entry, hidden);
        if (!label) return null;
        const durationLabel = formatConditionDuration(entry.duration);
        return {
          label,
          name: String(entry.name ?? label).trim(),
          index,
          hidden,
          sourceName: String(entry.sourceName ?? '').trim(),
          sourceAbility: String(entry.sourceAbility ?? '').trim(),
          durationLabel,
          detail: formatConditionDetail(entry, hidden, durationLabel),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function formatConditionLabel(entry, hidden) {
  const rawName = String(entry?.name ?? '').trim();
  const normalized = rawName.toLowerCase();
  if (normalized === 'damageweakness' || normalized === 'damageimmunity') {
    const amount = Number.parseInt(entry.amount, 10);
    const damageType = String(entry.damageType || '').trim().toLowerCase();
    const typeLabel = damageType ? `${damageType.charAt(0).toUpperCase()}${damageType.slice(1)} ` : '';
    const rider = normalized === 'damageweakness' ? 'weakness' : 'immunity';
    return `${typeLabel}${rider}${Number.isFinite(amount) && amount > 0 ? ` ${amount}` : ''}`.trim();
  }
  return String(
    hidden
      ? (entry.label ?? entry.sourceAbility ?? entry.text ?? entry.name ?? 'Hidden effect')
      : (entry.label ?? entry.name ?? entry.title ?? '')
  ).trim();
}

function formatConditionDetail(entry, hidden, durationLabel) {
  const parts = [];
  if (hidden) {
    parts.push(entry.sourceAbility, entry.sourceName);
  }
  if (durationLabel && durationLabel !== 'instantaneous') {
    parts.push(durationLabel);
  }
  return parts.filter(Boolean).join(' - ');
}

function formatConditionDuration(duration) {
  const type = typeof duration === 'string'
    ? duration
    : duration && typeof duration === 'object'
      ? duration.type || duration.value || duration.mode || ''
      : '';
  const normalized = String(type || '').trim();
  if (!normalized) return '';
  if (normalized === 'end-of-turn') return 'end of turn';
  if (normalized === 'save-ends') return 'save ends';
  return normalized.replace(/-/g, ' ');
}

function normalizeSkills(value) {
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value)
    .filter(([, entry]) => {
      if (typeof entry === 'string') {
        return entry.trim() && entry !== 'Untrained';
      }
      return entry && typeof entry === 'object' && (entry.level || 'Trained') !== 'Untrained';
    })
    .sort(([left], [right]) => left.localeCompare(right));
}

function normalizeFeatures(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((feature) => (feature && typeof feature === 'object' ? feature : null))
    .filter((feature) => feature && (feature.title || feature.text))
    .slice(0, 8);
}

function extractTextBlocks(html) {
  if (!html) {
    return [];
  }

  const div = document.createElement('div');
  div.innerHTML = String(html);
  div.querySelectorAll('br').forEach((breakNode) => {
    breakNode.replaceWith('\n');
  });

  const directBlocks = Array.from(div.children).filter((node) =>
    ['P', 'DIV', 'LI', 'BLOCKQUOTE'].includes(node.tagName)
  );
  const blockNodes = directBlocks.length
    ? directBlocks
    : Array.from(div.querySelectorAll('p, div, li, blockquote'));
  const blocks = blockNodes
    .flatMap((node) => (node.textContent || '').split(/\n\s*\n+/))
    .map((text) => text.trim())
    .filter(Boolean);

  if (blocks.length) {
    return blocks;
  }

  return (div.textContent || div.innerText || '')
    .split(/\n\s*\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function actionHasKeyword(action, keyword) {
  if (!action) return false;
  const target = String(keyword || '').toLowerCase();
  if (!target) return false;
  const keywords = action.automation && Array.isArray(action.automation.keywords) ? action.automation.keywords : [];
  if (keywords.some((k) => String(k).toLowerCase() === target)) return true;
  const tags = Array.isArray(action.tags) ? action.tags : [];
  if (tags.some((t) => String(t).toLowerCase() === target)) return true;
  return false;
}

function getAbilityActions(sheet, categoryKey, opts = {}) {
  const actions = sheet?.actions && typeof sheet.actions === 'object' ? sheet.actions : {};
  const list = Array.isArray(actions[categoryKey]) ? actions[categoryKey] : [];
  const baseList = list.map((action, index) => ({
    ...action,
    _stableActionId: action?._stableActionId || getStableActionId(action, categoryKey, index),
  }));
  const freeStrikes = Array.isArray(actions.freeStrikes) ? actions.freeStrikes : [];
  const activeToken = opts.activeToken || null;
  let merged = baseList;
  if (categoryKey === 'mains') {
    // Free strikes share the Main Action tab in the panel.
    merged = [...baseList, ...freeStrikes];
  } else if (categoryKey === 'triggers') {
    // Opportunity attack: when the active token has the built-in opp-attack
    // trigger ready, the melee free strike appears at the top of the
    // trigger list. Click it to run the free strike AND clear the trigger.
    const ready = Array.isArray(activeToken?.readyTriggerAbilities) ? activeToken.readyTriggerAbilities : [];
    if (ready.includes('__opportunityAttack__')) {
      // Prefer a melee free strike (book default for opp-attacks). Fall back
      // to any Strike-keyword free strike so classes whose free strike is
      // explicitly ranged — e.g. the Talent using Mind Spike — still get the
      // "!" injection on the trigger list.
      const fallback =
        freeStrikes.find((fs) => actionHasKeyword(fs, 'Melee')) ||
        freeStrikes.find((fs) => actionHasKeyword(fs, 'Strike')) ||
        freeStrikes[0];
      if (fallback) {
        merged = [{ ...fallback, _injectedTriggerId: '__opportunityAttack__' }, ...baseList];
      }
    }
    const injectedReadyActions = collectReadyTriggeredActions(sheet, activeToken)
      .filter((entry) => entry.categoryKey !== 'triggers')
      .filter((entry) => !merged.some((action) => (
        action?._stableActionId === entry.action._stableActionId ||
        action?._injectedTriggerId === entry.triggerId
      )))
      .map((entry) => ({
        ...entry.action,
        _injectedTriggerId: entry.triggerId,
        actionLabel: entry.action.actionLabel || getAbilityCategoryLabel(entry.categoryKey),
      }));
    if (injectedReadyActions.length) {
      merged = [...injectedReadyActions, ...merged];
    }
  }
  return merged.filter((action) => action && typeof action === 'object' && (action.name || action.description || action.useWhen));
}

function collectReadyTriggeredActions(sheet, activeToken = null) {
  const ready = Array.isArray(activeToken?.readyTriggerAbilities) ? activeToken.readyTriggerAbilities : [];
  if (!ready.length || !sheet?.actions || typeof sheet.actions !== 'object') return [];
  const readySet = new Set(ready);
  const categories = ABILITY_CATEGORIES.map((category) => category.key);
  const result = [];
  categories.forEach((categoryKey) => {
    const list = Array.isArray(sheet.actions?.[categoryKey]) ? sheet.actions[categoryKey] : [];
    list.forEach((action, index) => {
      if (!action || typeof action !== 'object') return;
      const stableId = action?._stableActionId || getStableActionId(action, categoryKey, index);
      if (!stableId || !readySet.has(stableId)) return;
      result.push({
        categoryKey,
        triggerId: stableId,
        action: {
          ...action,
          _stableActionId: stableId,
        },
      });
    });
  });
  return result;
}

function hasAbilityAutomation(automation) {
  return Boolean(
    automation &&
      typeof automation === 'object' &&
      Array.isArray(automation.cards) &&
      automation.cards.length > 0
  );
}

function getStableActionId(action, categoryKey, index) {
  const explicit = typeof action?.id === 'string' ? action.id.trim() : '';
  if (explicit) return explicit;
  const name = String(action?.name || 'ability')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'ability';
  return `${categoryKey || 'ability'}:${index}:${name}`;
}

function isFreeTriggeredActionLabel(label) {
  const text = String(label || '').toLowerCase();
  return text.includes('triggered') && text.includes('free');
}

function normalizeActionUsageKind(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'main' || text === 'mains' || text.includes('main')) return 'main';
  if (text === 'maneuver' || text === 'maneuvers' || text.includes('maneuver')) return 'maneuver';
  return '';
}

function normalizeAutomation(automation) {
  if (window.AbilityAutomationSchema?.normalizeAutomation) {
    return window.AbilityAutomationSchema.normalizeAutomation(automation);
  }
  return automation;
}

function getAttributeBonus(sheet, attribute) {
  const key = String(attribute || '').trim().toLowerCase();
  if (key === 'strongest') {
    return getStrongestAttribute(sheet).bonus;
  }
  return Number.parseInt(sheet?.hero?.stats?.[key] ?? 0, 10) || 0;
}

function getStrongestAttribute(sheet) {
  const stats = sheet?.hero?.stats && typeof sheet.hero.stats === 'object' ? sheet.hero.stats : {};
  const attributes = [
    { key: 'might', attribute: 'Might' },
    { key: 'agility', attribute: 'Agility' },
    { key: 'reason', attribute: 'Reason' },
    { key: 'intuition', attribute: 'Intuition' },
    { key: 'presence', attribute: 'Presence' },
  ];
  return attributes.reduce(
    (best, item) => {
      const bonus = Number.parseInt(stats[item.key] ?? 0, 10) || 0;
      return bonus > best.bonus ? { attribute: item.attribute, bonus } : best;
    },
    { attribute: 'Might', bonus: Number.parseInt(stats.might ?? 0, 10) || 0 }
  );
}

function getAutomationTraits(sheet) {
  const vitals = sheet?.hero?.vitals && typeof sheet.hero.vitals === 'object' ? sheet.hero.vitals : {};
  return {
    size: vitals.size || '',
    stability: vitals.stability || '',
  };
}

function startAbilityAutomation(sheet, action, categoryKey, sourceToken = null, options = {}) {
  if (!window.AbilityAutomationRunner || typeof window.AbilityAutomationRunner.open !== 'function') {
    console.warn('[VTT] Ability automation runner is not available.');
    return;
  }

  window.AbilityAutomationRunner.open({
    action: clonePlain(action),
    actionType: categoryKey,
    hero: clonePlain(sheet.hero || {}),
    automation: normalizeAutomation(action.automation),
    // Feature list with their automation (modifiers live here). Pre-roll
    // modifier collection walks this and folds matching bonuses into the
    // in-memory automation before any UI renders.
    features: Array.isArray(sheet.features) ? sheet.features.map(clonePlain) : [],
    sourceToken: clonePlain(sourceToken || {}),
    sourcePlacement: clonePlain(sourceToken || {}),
    sourceTraits: getAutomationTraits(sheet),
    // Pre-suggested target placement id (e.g. mover that triggered an
    // opp-attack). Runner threads this into every target picker config so
    // the board can flash it red.
    suggestedTargetId: options?.suggestedTargetId || '',
    // Firing-event snapshot from the trigger registry (damage amount, source,
    // damage type, etc.). Captured at mark-ready time and threaded here so
    // effects like halveTriggeringDamage can read the original damage value.
    triggerPayload: options?.triggerPayload || null,
    automationAnchor: options?.automationAnchor || null,
    manualTriggerResolution: Boolean(options?.manualTriggerResolution),
    getAttributeBonus: (attribute) => getAttributeBonus(sheet, attribute),
    getStrongestAttribute: () => getStrongestAttribute(sheet),
    postChat: postAutomationChat,
    selectTarget: requestAutomationTarget,
    selectAreaTarget: requestAutomationAreaTarget,
    cancelTargetSelection: cancelAutomationTarget,
    cancelAreaSelection: cancelAutomationArea,
    applyDamage: requestAutomationDamage,
    applyHeal: requestAutomationHeal,
    applyCondition: requestAutomationCondition,
    checkPotency: requestAutomationPotency,
    forceMove: requestAutomationForceMove,
    registerTrigger: requestAutomationRegisterTrigger,
    applyResourceGain: (payload) => applyAbilityResourceGain(sheet, payload, options),
    applySurgeGain: requestAutomationSurgeGain,
    applyTeleport: requestAutomationTeleport,
    applySwap: requestAutomationSwap,
    runFreeStrike: requestAutomationFreeStrike,
    getRecoveryValueForTarget: requestAutomationRecoveryValue,
    spendRecoveryForTarget: requestAutomationSpendRecovery,
    registerPersistentZone: requestAutomationRegisterZone,
    applyMark: requestAutomationApplyMark,
    endMark: requestAutomationEndMark,
    checkMark: requestAutomationCheckMark,
    fireTriggerEvent: requestAutomationFireTriggerEvent,
    checkScopedFlag: requestAutomationCheckScopedFlag,
    setScopedFlag: requestAutomationSetScopedFlag,
    setAura: requestAutomationSetAura,
    showFloatingText: requestAutomationFloatingText,
    startTurn: requestAutomationStartTurn,
    getPowerRollSuggestions: (payload) => (
      window.VTTBoardCallbacks && typeof window.VTTBoardCallbacks.getPowerRollSuggestions === 'function'
        ? window.VTTBoardCallbacks.getPowerRollSuggestions(payload)
        : []
    ),
    consumeRollRiders: (payload) => (
      window.VTTBoardCallbacks && typeof window.VTTBoardCallbacks.consumeRollRiders === 'function'
        ? window.VTTBoardCallbacks.consumeRollRiders(payload)
        : false
    ),
    getPlacementById: (placementId) => (
      window.VTTBoardCallbacks && typeof window.VTTBoardCallbacks.getPlacementById === 'function'
        ? window.VTTBoardCallbacks.getPlacementById(placementId)
        : null
    ),
    spendHeroicResource: (payload) => spendHeroicResource(sheet, payload, options),
    spendResource: (ability) => spendAbilityResource(sheet, ability, options),
    consumeTriggeredAction: requestAutomationConsumeTriggeredAction,
    getDistanceBetween: (idA, idB) => (
      window.VTTBoardCallbacks && typeof window.VTTBoardCallbacks.getDistanceBetween === 'function'
        ? window.VTTBoardCallbacks.getDistanceBetween(idA, idB)
        : null
    ),
  });
}

async function postAutomationChat(entry) {
  if (window.dashboardChat && typeof window.dashboardChat.sendMessage === 'function') {
    return window.dashboardChat.sendMessage({
      message: entry?.message || '',
      type: entry?.type || 'text',
      payload: entry?.payload || null,
    });
  }
  return false;
}

function requestAutomationTarget(targetConfig) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-select-target', {
        detail: {
          targetConfig: clonePlain(targetConfig || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationDamage(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-apply-damage', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationAreaTarget(targetConfig) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-select-area', {
        detail: {
          targetConfig: clonePlain(targetConfig || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationCondition(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-apply-condition', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationPotency(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-check-potency', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function cancelAutomationTarget() {
  document.dispatchEvent(new CustomEvent('vtt:automation-cancel-target'));
}

function cancelAutomationArea() {
  document.dispatchEvent(new CustomEvent('vtt:automation-cancel-area'));
}

function requestAutomationForceMove(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-force-move', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationHeal(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-apply-heal', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationRegisterTrigger(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-register-trigger', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationTeleport(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-apply-teleport', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationSwap(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-apply-swap', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationFreeStrike(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-run-free-strike', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationRecoveryValue(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-recovery-value', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationSpendRecovery(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-spend-recovery', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationRegisterZone(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-register-persistent-zone', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationApplyMark(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-apply-mark', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationEndMark(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-end-mark', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationCheckMark(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-check-mark', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationFireTriggerEvent(payload) {
  document.dispatchEvent(
    new CustomEvent('vtt:automation-fire-trigger-event', {
      detail: {
        payload: clonePlain(payload || {}),
      },
    })
  );
}

function requestAutomationCheckScopedFlag(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-check-scoped-flag', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationSetScopedFlag(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-set-scoped-flag', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationSetAura(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-set-aura', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationFloatingText(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-floating-text', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationStartTurn(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-start-turn', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationSurgeGain(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-apply-surge', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

function requestAutomationConsumeTriggeredAction(payload) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(
      new CustomEvent('vtt:automation-consume-triggered-action', {
        detail: {
          payload: clonePlain(payload || {}),
          resolve,
          reject,
        },
      })
    );
  });
}

// When the right-side chat panel is open it overlays the right edge of the
// viewport. Reserve that width so anchored automation dialogs never slide
// underneath it. Returns 0 when the chat is closed.
function getChatPanelReservedWidth() {
  if (typeof document === 'undefined' || !document.body) return 0;
  if (!document.body.classList.contains('chat-panel-is-open')) return 0;
  const styles = window.getComputedStyle(document.body);
  const width = parseFloat(styles.getPropertyValue('--chat-panel-width')) || 360;
  const offset = parseFloat(styles.getPropertyValue('--chat-panel-offset')) || 20;
  return width + offset + 8;
}

function clampAutomationDialogPosition(left, top, modal) {
  const rect = modal?.getBoundingClientRect?.() || {};
  const width = rect.width || 360;
  const height = rect.height || 190;
  const padding = 12;
  const reservedRight = getChatPanelReservedWidth();
  return {
    left: Math.min(Math.max(padding, left), Math.max(padding, window.innerWidth - reservedRight - width - padding)),
    top: Math.min(Math.max(padding, top), Math.max(padding, window.innerHeight - height - padding)),
  };
}

function positionAutomationDialog(modal, anchor = null) {
  if (!(modal instanceof HTMLElement)) return;
  window.requestAnimationFrame(() => {
    const anchorRect = anchor && typeof anchor === 'object' ? anchor : null;
    const left = Number.isFinite(anchorRect?.right) ? anchorRect.right + 12 : 24;
    const top = Number.isFinite(anchorRect?.top) ? anchorRect.top : 72;
    const pos = clampAutomationDialogPosition(left, top, modal);
    modal.style.left = `${pos.left}px`;
    modal.style.top = `${pos.top}px`;
  });
}

function makeAutomationDialogDraggable(host) {
  const modal = host?.querySelector?.('.vtt-automation-spend__modal');
  const header = host?.querySelector?.('.vtt-automation-spend__header');
  if (!(modal instanceof HTMLElement) || !(header instanceof HTMLElement)) return;
  let drag = null;
  const stop = () => {
    if (!drag) return;
    drag = null;
    modal.classList.remove('is-dragging');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', stop);
    document.removeEventListener('pointercancel', stop);
  };
  const move = (event) => {
    if (!drag) return;
    const pos = clampAutomationDialogPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY, modal);
    modal.style.left = `${pos.left}px`;
    modal.style.top = `${pos.top}px`;
  };
  header.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || target?.closest?.('button')) return;
    const rect = modal.getBoundingClientRect();
    drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    modal.classList.add('is-dragging');
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
    event.preventDefault();
  });
}

function showAutomationSpendDialog({
  title = 'Spend Resource',
  message = '',
  resource = 'Resource',
  current = 0,
  minAmount = 1,
  maxAmount = 1,
  anchor = null,
} = {}) {
  return new Promise((resolve) => {
    const variable = maxAmount > minAmount;
    const host = document.createElement('div');
    host.className = 'vtt-automation-spend';
    host.innerHTML = `
      <section class="dice-modal dice-modal--vtt vtt-automation-spend__modal" role="dialog" aria-modal="false" aria-labelledby="vtt-automation-spend-title">
        <header class="dice-modal-header vtt-automation-spend__header">
          <div class="dice-modal-heading-group">
            <h2 class="dice-modal-title" id="vtt-automation-spend-title">${escapeHtml(title)}</h2>
            <span class="dice-modal-project-label">${escapeHtml(resource)} ${current}</span>
          </div>
          <button class="dice-modal-close" type="button" data-spend-cancel aria-label="Cancel spend">&times;</button>
        </header>
        <div class="dice-modal-content vtt-automation-spend__body">
          <p class="vtt-automation-spend__message">${escapeHtml(message)}</p>
          ${variable ? `
            <label class="vtt-automation-spend__field">
              <span>Amount</span>
              <span class="vtt-automation-spend__stepper">
                <button type="button" class="dice-clear-btn" data-spend-step="-1" aria-label="Spend less">-</button>
                <input type="number" min="${minAmount}" max="${maxAmount}" step="1" value="${minAmount}" data-spend-input>
                <button type="button" class="dice-clear-btn" data-spend-step="1" aria-label="Spend more">+</button>
              </span>
            </label>
            <p class="vtt-automation-spend__hint">Choose ${minAmount}-${maxAmount}, or cancel to skip.</p>
          ` : `<p class="vtt-automation-spend__hint">Spend ${minAmount} ${escapeHtml(resource)}?</p>`}
          <div class="dice-actions__controls vtt-automation-spend__actions">
            <button type="button" class="dice-roll-btn" data-spend-confirm>${variable ? 'Spend' : 'OK'}</button>
            <button type="button" class="dice-clear-btn" data-spend-cancel>Cancel</button>
          </div>
        </div>
      </section>
    `;
    document.body?.appendChild(host);
    const modal = host.querySelector('.vtt-automation-spend__modal');
    const input = host.querySelector('[data-spend-input]');
    const cleanup = (result) => {
      host.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const getValue = () => {
      const parsed = Number.parseInt(input?.value ?? minAmount, 10);
      if (!Number.isFinite(parsed)) return minAmount;
      return Math.min(maxAmount, Math.max(minAmount, parsed));
    };
    const setValue = (value) => {
      if (input) input.value = String(Math.min(maxAmount, Math.max(minAmount, value)));
    };
    const onKey = (event) => {
      if (event.key === 'Escape') cleanup({ canceled: true });
    };
    host.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-spend-cancel]')) {
        cleanup({ canceled: true });
        return;
      }
      const step = target?.closest('[data-spend-step]');
      if (step) {
        const delta = Number.parseInt(step.getAttribute('data-spend-step') || '0', 10) || 0;
        setValue(getValue() + delta);
        input?.focus?.();
        return;
      }
      if (target?.closest('[data-spend-confirm]')) {
        cleanup({ amount: variable ? getValue() : minAmount });
      }
    });
    input?.addEventListener('input', () => setValue(getValue()));
    document.addEventListener('keydown', onKey);
    makeAutomationDialogDraggable(host);
    positionAutomationDialog(modal, anchor);
    input?.focus?.();
    input?.select?.();
  });
}

// resourceGain modifies the caster's heroic resource directly on their sheet.
// Mirrors spendAbilityResource but allows positive or negative amounts and
// doesn't enforce a per-ability cost match.
async function applyAbilityResourceGain(sheet, payload = {}, options = {}) {
  const amount = Number.parseInt(payload?.amount ?? 0, 10) || 0;
  if (!amount || !sheet) return { skipped: true, amount: 0 };
  const hero = sheet?.hero && typeof sheet.hero === 'object' ? sheet.hero : {};
  const resource = hero.resource && typeof hero.resource === 'object' ? hero.resource : {};
  const title = resource.title || sheet?.sidebar?.resource?.title || 'Resource';
  // If the JSON names a specific resource, only apply if it matches the
  // caster's resource bar. Otherwise, assume the caster's resource.
  const askedName = String(payload?.resource || '').trim().toLowerCase();
  if (askedName && askedName !== title.toLowerCase()) {
    return { skipped: true, reason: 'resource-mismatch', resource: title };
  }
  const current = Number.parseInt(resource.value ?? 0, 10) || 0;
  const floor = resourceFloor(hero, resource);
  // Allows negative-direction resourceGain ("lose 1 clarity") to push below
  // 0 down to the floor when the resource permits it. Positive gains are
  // unaffected since the floor is never above 0.
  const next = Math.max(floor, current + amount);
  resource.value = next;
  hero.resource = resource;
  if (sheet) sheet.hero = hero;
  await saveCharacterSummarySheet(sheet, options);
  // Signal that the sheet changed so visible panels and standalone sheet tabs
  // can refresh without a page reload.
  if (typeof document !== 'undefined' && options?.characterId) {
    document.dispatchEvent(new CustomEvent('vtt:character-sheet-updated', {
      detail: { characterId: options.characterId, change: 'resource' },
    }));
  }
  return { applied: amount, delta: next - current, resource: title, current: next };
}

async function spendHeroicResource(sheet, payload = {}, options = {}) {
  const minAmount = Math.max(1, Number.parseInt(payload?.amount ?? 1, 10) || 1);
  if (!sheet) return { skipped: true, reason: 'missing-sheet' };
  const hero = sheet?.hero && typeof sheet.hero === 'object' ? sheet.hero : {};
  const resource = hero.resource && typeof hero.resource === 'object' ? hero.resource : {};
  const title = resource.title || sheet?.sidebar?.resource?.title || 'Resource';
  const askedName = String(payload?.resource || '').trim().toLowerCase();
  if (askedName && askedName !== title.toLowerCase()) {
    return { skipped: true, reason: 'resource-mismatch', resource: title };
  }
  const current = Number.parseInt(resource.value ?? 0, 10) || 0;
  if (current < minAmount) {
    return { skipped: true, reason: 'insufficient', resource: title, current, required: minAmount };
  }
  const maxRaw = payload?.maxAmount;
  const requestedMax = String(maxRaw || '').trim().toLowerCase() === 'available'
    ? current
    : Math.max(0, Number.parseInt(maxRaw ?? 0, 10) || 0);
  const maxAmount = Math.max(minAmount, Math.min(current, requestedMax || minAmount));
  const promptText = String(payload?.prompt || `Spend ${minAmount} ${title}?`).trim();
  const choice = await showAutomationSpendDialog({
    title: payload?.abilityName || `Spend ${title}`,
    message: promptText,
    resource: title,
    current,
    minAmount,
    maxAmount,
    anchor: options?.automationAnchor || null,
  });
  if (choice?.canceled || !choice?.amount) {
    return { canceled: true, resource: title, current };
  }
  const spendAmount = Math.min(maxAmount, Math.max(minAmount, Number.parseInt(choice.amount, 10) || minAmount));
  const floor = resourceFloor(hero, resource);
  const next = Math.max(floor, current - spendAmount);
  resource.value = next;
  hero.resource = resource;
  if (sheet) sheet.hero = hero;
  await saveCharacterSummarySheet(sheet, options);
  if (typeof document !== 'undefined' && options?.characterId) {
    document.dispatchEvent(new CustomEvent('vtt:character-sheet-updated', {
      detail: { characterId: options.characterId, change: 'resource' },
    }));
  }
  return { spent: current - next, resource: title, current: next };
}

async function spendAbilityResource(sheet, ability, options = {}) {
  const cost = parseAbilityResourceCost(ability?.cost);
  if (!cost.amount) return { skipped: true };
  const hero = sheet?.hero && typeof sheet.hero === 'object' ? sheet.hero : {};
  const resource = hero.resource && typeof hero.resource === 'object' ? hero.resource : {};
  const title = resource.title || sheet?.sidebar?.resource?.title || 'Resource';
  const costName = cost.name.toLowerCase();
  if (costName && title.toLowerCase() !== costName) return { skipped: true };
  const current = Number.parseInt(resource.value ?? 0, 10) || 0;
  const floor = resourceFloor(hero, resource);
  // Talent's Clarity (`allowNegative: true`) lets the player push the
  // resource into negative territory, capped at -(1 + Reason). For every
  // other resource the floor is 0 and the old behavior (confirm prompt at
  // insufficient) is preserved.
  if (!resource.allowNegative && current < cost.amount) {
    const proceed = window.confirm(`${title} is ${current}, but ${ability?.name || 'this ability'} costs ${cost.amount}. Continue anyway?`);
    return proceed ? { continued: true, insufficient: true } : { canceled: true };
  }
  if (resource.allowNegative && current - cost.amount < floor) {
    const proceed = window.confirm(`${title} would drop to ${current - cost.amount}, past the floor of ${floor} (-(1 + Reason)). Cap at ${floor}?`);
    if (!proceed) return { canceled: true };
  }
  resource.value = Math.max(floor, current - cost.amount);
  hero.resource = resource;
  if (sheet) sheet.hero = hero;
  await saveCharacterSummarySheet(sheet, options);
  // Mirror applyAbilityResourceGain: tell the board its sheet cache is stale
  // and notify any open standalone sheet tab.
  if (typeof document !== 'undefined' && options?.characterId) {
    document.dispatchEvent(new CustomEvent('vtt:character-sheet-updated', {
      detail: { characterId: options.characterId, change: 'resource' },
    }));
  }
  return { spent: cost.amount, resource: title, remaining: resource.value };
}

// The floor a resource can drop to when paying a cost. `allowNegative`
// resources (Talent's Clarity) clamp at -(1 + Reason); everything else
// clamps at 0. Reason of 2 → floor of -3, etc. Stat may be null/undefined
// for fresh characters; treat as 0.
function resourceFloor(hero, resource) {
  if (!resource || !resource.allowNegative) return 0;
  const reason = Number(hero?.stats?.reason) || 0;
  return -(1 + reason);
}

function parseAbilityResourceCost(value) {
  const text = String(value || '').trim();
  if (!text) return { amount: 0, name: '' };
  // Format A: "<number> <resource name>" — explicit, e.g. "3 Clarity".
  // spendAbilityResource skips the deduction if the named resource doesn't
  // match the character's own bar title.
  const namedMatch = text.match(/^(\d+)\s+(.+)$/);
  if (namedMatch) {
    return {
      amount: Math.max(0, Number.parseInt(namedMatch[1], 10) || 0),
      name: namedMatch[2].trim(),
    };
  }
  // Format B: bare number — implies the character's own resource bar.
  // This is how the sheet's Cost field is normally typed (Cal's "3"/"5"/"7"
  // on the heroic abilities, etc.). spendAbilityResource sees `name = ''`
  // and falls through to the caster's resource without a name guard.
  const bareMatch = text.match(/^(\d+)$/);
  if (bareMatch) {
    return {
      amount: Math.max(0, Number.parseInt(bareMatch[1], 10) || 0),
      name: '',
    };
  }
  return { amount: 0, name: '' };
}

async function saveCharacterSummarySheet(sheet, options = {}) {
  const characterId = typeof options.characterId === 'string' ? options.characterId : '';
  if (!characterId || !sheet) return false;
  const routeConfig = options.routes && typeof options.routes === 'object' ? options.routes : {};
  const endpoint = typeof routeConfig.sheet === 'string' && routeConfig.sheet ? routeConfig.sheet : '/dnd/character_sheet/handler.php';
  const body = new URLSearchParams();
  body.set('action', 'save');
  body.set('character', characterId);
  body.set('data', JSON.stringify(sheet));
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => null);
  const saved = Boolean(response.ok && payload?.success !== false);
  if (saved && typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(CHARACTER_SHEET_SYNC_CHANNEL);
    channel.postMessage({
      type: 'character-sheet-sync',
      source: 'vtt',
      character: characterId,
      change: 'sheet',
    });
    channel.close();
  }
  return saved;
}

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function getAbilityAction(sheet, categoryKey, indexValue, opts = {}) {
  const index = Number.parseInt(indexValue, 10);
  if (!categoryKey || !Number.isInteger(index) || index < 0) {
    return null;
  }
  return getAbilityActions(sheet, categoryKey, opts)[index] || null;
}

function summarizeAbility(action, categoryKey) {
  const parts = [];
  const tags = Array.isArray(action?.tags) ? action.tags.filter(Boolean) : [];
  if (action?.actionLabel) {
    parts.push(action.actionLabel);
  } else {
    parts.push(getAbilityCategoryLabel(categoryKey));
  }
  // Cost is shown as its own prominent badge in the tray row (see
  // renderAbilityCostBadge), so omit it from the meta line to avoid clutter.
  // Keep it here only when it isn't a parseable resource cost.
  if (action?.cost && parseAbilityResourceCost(action.cost).amount <= 0) {
    parts.push(action.cost);
  }
  if (tags.length) {
    parts.push(tags.slice(0, 3).join(', '));
  }
  return parts.filter(Boolean).join(' - ');
}

function getAbilityCategoryLabel(categoryKey) {
  return ABILITY_CATEGORIES.find((category) => category.key === categoryKey)?.label || 'Ability';
}

function getAbilityIcon(categoryKey) {
  if (categoryKey === 'triggers') {
    return '!';
  }
  if (categoryKey === 'mains') {
    return '>';
  }
  return '+';
}

function formatRoll(rollMod) {
  if (rollMod === '' || rollMod === null || rollMod === undefined) {
    return '2d10';
  }
  const mod = String(rollMod).trim();
  if (!mod) {
    return '2d10';
  }
  return `2d10${mod.startsWith('-') ? '' : '+'}${mod}`;
}

function getSkillGroup(skill) {
  for (const [group, entries] of Object.entries(SKILL_GROUPS)) {
    if (entries.includes(skill)) {
      return group;
    }
  }
  return 'Other';
}

function computeRecoveryValue(vitals) {
  const raw = vitals?.recoveryValue;
  if (raw !== '' && raw !== null && raw !== undefined && Number(raw) !== 0) {
    return Math.floor(Number(raw)) || raw;
  }
  const staminaMax = Number(vitals?.staminaMax) || 0;
  if (staminaMax <= 0) {
    return '';
  }
  return Math.floor(staminaMax / 3);
}

function countReadyHeroTokens(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) {
    return 2;
  }
  return tokens.filter((spent) => !spent).length;
}

function normalizeHeroTokens(tokens) {
  return [Boolean(tokens?.[0]), Boolean(tokens?.[1])];
}

function promptForPositiveInt(message) {
  const raw = window.prompt(message, '');
  if (raw === null) {
    return 0;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function appendStaminaHistory(vitals, value) {
  if (!vitals || typeof vitals !== 'object') {
    return;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return;
  }
  const history = Array.isArray(vitals.staminaHistory) ? [...vitals.staminaHistory] : [];
  history.push(numeric);
  vitals.staminaHistory = history.slice(-4);
}

function parseAutoDice(value) {
  const match = String(value || '').trim().match(/^d(\d+)$/i);
  if (!match) {
    return 0;
  }
  const sides = Number.parseInt(match[1], 10);
  return Number.isFinite(sides) && sides > 0 ? sides : 0;
}

function parseStaticAutoResource(value) {
  const match = String(value || '').trim().match(/^\+?(\d+)$/);
  if (!match) {
    return 0;
  }
  const amount = Number.parseInt(match[1], 10);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function resolveAutoResourceGain(value) {
  const raw = String(value || '').trim();
  const sides = parseAutoDice(raw);
  if (sides) {
    const roll = Math.floor(Math.random() * sides) + 1;
    return { amount: roll, label: `rolled ${raw.toLowerCase()} = ${roll}` };
  }
  const staticAmount = parseStaticAutoResource(raw);
  if (staticAmount) {
    return { amount: staticAmount, label: `static +${staticAmount}` };
  }
  return null;
}

function showHeroTokenConfirmation(button) {
  return new Promise((resolve) => {
    document.querySelectorAll('.vtt-character-token-confirmation').forEach((el) => el.remove());
    const host = button?.parentElement;
    if (!host) {
      resolve(false);
      return;
    }
    const confirm = document.createElement('div');
    confirm.className = 'vtt-character-token-confirmation';
    confirm.innerHTML = `
      <div class="vtt-character-token-confirmation__text">Does everyone agree to use a hero token?</div>
      <div class="vtt-character-token-confirmation__actions">
        <button type="button" data-confirm-hero-token>Yes</button>
        <button type="button" data-cancel-hero-token>Cancel</button>
      </div>
    `;
    const finish = (value) => {
      confirm.remove();
      resolve(value);
    };
    confirm.querySelector('[data-confirm-hero-token]')?.addEventListener('click', () => finish(true));
    confirm.querySelector('[data-cancel-hero-token]')?.addEventListener('click', () => finish(false));
    host.appendChild(confirm);
  });
}

function formatSigned(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function valueOrDash(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return value;
}

function valueOrZero(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  return value;
}

function numberLike(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatCharacterName(characterId) {
  return String(characterId || '')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function stripHtml(html) {
  if (!html) {
    return '';
  }
  const div = document.createElement('div');
  div.innerHTML = String(html);
  return (div.textContent || div.innerText || '').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
