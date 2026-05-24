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
    if (!isOpen) {
      renderAbilityTray(abilityTray, null);
      hideAbilityPreview(abilityPreview);
    } else if (activeSheet) {
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
      activeDisplayName = sheet?.hero?.name || token.name || formatCharacterName(characterId);
      panel.innerHTML = renderCharacterCard(sheet, {
        characterId,
        token,
      });
      bindCharacterSummaryControls(panel, { onTuck: tuckPanel });
      renderAbilityTray(abilityTray, sheet, { activeCategory: activeAbilityCategory, activeToken });
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

  document.addEventListener('vtt:token-selection-summary', (event) => {
    const detail = event?.detail ?? {};
    if (!detail.characterId) {
      clearActiveCharacter();
      return;
    }
    showCharacter(detail);
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
          renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
        }
        document.dispatchEvent(new CustomEvent('vtt:toggle-triggered-action', { detail: { placementId } }));
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
        const triggerPayload = triggerSnapshot && typeof triggerSnapshot === 'object'
          ? (triggerSnapshot.payload && typeof triggerSnapshot.payload === 'object' ? triggerSnapshot.payload : triggerSnapshot)
          : null;
        if (clearsTrigger && sourcePlacementId) {
          document.dispatchEvent(new CustomEvent('vtt:clear-trigger-ready', {
            detail: { placementId: sourcePlacementId, abilityId: clearsTrigger },
          }));
        }
        activeAbilityCategory = null;
        hideAbilityPreview(abilityPreview);
        renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
        startAbilityAutomation(activeSheet, action, abilityItem.dataset.abilityCategory, activeToken, {
          characterId: activeCharacterId,
          routes,
          suggestedTargetId,
          triggerPayload,
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

function bindCharacterSummaryControls(panel, { onTuck = null } = {}) {
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

  tray.innerHTML = `
    <nav class="vtt-character-ability-tray__inner" aria-label="Character abilities">
      ${ABILITY_CATEGORIES.map((category) => {
        const actions = getAbilityActions(sheet, category.key, { activeToken });
        const isActive = activeCategory === category.key;
        const isTrigger = category.key === 'triggers';
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
          : '';
        const readyHtml = isTrigger && hasReadyTrigger
          ? `<span
              class="vtt-character-ability-tab__trigger-ready"
              role="button"
              tabindex="0"
              data-character-trigger-clear
              data-placement-id="${escapeAttribute(triggerPlacementId)}"
              aria-label="Trigger condition met. Click to clear."
              title="Trigger condition met. Click to clear."
            >!</span>`
          : '';
        const tabClass = `vtt-character-ability-tab${isTrigger && hasReadyTrigger ? ' has-ready-trigger' : ''}`;
        return `
          <div class="vtt-character-ability-category${isActive ? ' is-active' : ''}">
            ${isActive ? renderAbilityList(category, actions) : ''}
            <button
              class="${tabClass}"
              type="button"
              data-character-ability-category="${escapeAttribute(category.key)}"
              aria-expanded="${isActive ? 'true' : 'false'}"
            >${dotHtml}${readyHtml}<span class="vtt-character-ability-tab__label">${escapeHtml(category.label)}</span></button>
          </div>
        `;
      }).join('')}
    </nav>
  `;
  tray.setAttribute('aria-hidden', 'false');
  tray.classList.add('vtt-character-ability-tray--open');
  document.body?.classList.add(ABILITY_TRAY_BODY_OPEN_CLASS);
}

function renderAbilityList(category, actions) {
  return `
    <div class="vtt-character-ability-list" role="menu" aria-label="${escapeAttribute(category.heading)}">
      <div class="vtt-character-ability-list__heading">${escapeHtml(category.heading)}</div>
      ${actions.length
        ? actions.map((action, index) => renderAbilityItem(action, category.key, index)).join('')
        : `<div class="vtt-character-ability-empty">${escapeHtml(category.empty)}</div>`}
    </div>
  `;
}

function renderAbilityItem(action, categoryKey, index) {
  const name = action?.name || 'Untitled Ability';
  const meta = summarizeAbility(action, categoryKey);
  const automated = hasAbilityAutomation(action?.automation);
  // When an ability is injected into the trigger list because a trigger
  // condition is met (e.g. opp-attack), render a blue "!" to the LEFT of
  // the icon and stash the trigger id so clicking it auto-clears.
  const triggerId = action?._injectedTriggerId || '';
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
      ${triggerId ? '<span class="vtt-character-ability-item__trigger-ready" aria-label="Trigger condition met">!</span>' : ''}
      <span class="vtt-character-ability-item__mark" aria-hidden="true">${escapeHtml(getAbilityIcon(categoryKey))}</span>
      <span class="vtt-character-ability-item__text">
        <span class="vtt-character-ability-item__name">${escapeHtml(name)}</span>
        ${meta ? `<span class="vtt-character-ability-item__meta">${escapeHtml(meta)}</span>` : ''}
      </span>
      ${automated ? '<span class="vtt-character-ability-item__auto" aria-label="Automated">Auto</span>' : ''}
    </button>
  `;
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
  const surges = valueOrZero(hero.surges);
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
          ${renderQuickBox('Hero Tokens', `${countReadyHeroTokens(heroTokens)} / ${heroTokens.length || 2}`)}
          ${renderQuickBox('Surges', surges)}
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
            ${renderResource(resourceTitle, resourceValue)}
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
            ? conditions.map((condition, index) => renderCondition(condition, token?.id, index)).join('')
            : '<span class="vtt-character-condition">No conditions</span>'}
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
      <div class="vtt-character-pill vtt-character-pill--damage">
        <span class="vtt-character-pill__label">DMG</span>
        <span class="vtt-character-pill__value">-</span>
      </div>
      <div class="vtt-character-pill">
        <span class="vtt-character-pill__value">${escapeHtml(staminaCurrent)} / ${escapeHtml(staminaMax)}</span>
      </div>
      <div class="vtt-character-pill">
        <span class="vtt-character-pill__label">Heal</span>
        <span class="vtt-character-pill__value">+</span>
      </div>
      <div class="vtt-character-pill vtt-character-recovery">
        <span class="vtt-character-pill__label">Recoveries</span>
        <span class="vtt-character-recovery__value">+${escapeHtml(recoveryValue)} &nbsp; ${escapeHtml(recoveriesCurrent)} / ${escapeHtml(recoveriesMax)}</span>
        ${renderRecoveryTicks(recoveriesCurrent, recoveriesMax)}
      </div>
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

function renderResource(label, value) {
  return `
    <div class="vtt-character-resource">
      <div class="vtt-character-resource__label">${escapeHtml(label)}</div>
      <div class="vtt-character-resource__value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderCondition(condition, placementId, index) {
  const removeButton = placementId
    ? `<button class="vtt-character-condition__remove" type="button" data-character-condition-remove data-placement-id="${escapeAttribute(placementId)}" data-condition-index="${escapeAttribute(index)}" aria-label="Remove ${escapeAttribute(condition)}">x</button>`
    : '';

  return `
    <span class="vtt-character-condition">
      <span class="vtt-character-condition__name">${escapeHtml(condition)}</span>
      ${removeButton}
    </span>
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
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry && typeof entry === 'object') {
        return String(entry.name ?? entry.label ?? entry.title ?? '').trim();
      }
      return '';
    })
    .filter(Boolean);
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
  const freeStrikes = Array.isArray(actions.freeStrikes) ? actions.freeStrikes : [];
  const activeToken = opts.activeToken || null;
  let merged = list;
  if (categoryKey === 'mains') {
    // Free strikes share the Main Action tab in the panel.
    merged = [...list, ...freeStrikes];
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
        merged = [{ ...fallback, _injectedTriggerId: '__opportunityAttack__' }, ...list];
      }
    }
  }
  return merged.filter((action) => action && typeof action === 'object' && (action.name || action.description || action.useWhen));
}

function hasAbilityAutomation(automation) {
  return Boolean(
    automation &&
      typeof automation === 'object' &&
      Array.isArray(automation.cards) &&
      automation.cards.length > 0
  );
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
    applyTeleport: requestAutomationTeleport,
    applySwap: requestAutomationSwap,
    runFreeStrike: requestAutomationFreeStrike,
    getRecoveryValueForTarget: requestAutomationRecoveryValue,
    registerPersistentZone: requestAutomationRegisterZone,
    applyMark: requestAutomationApplyMark,
    endMark: requestAutomationEndMark,
    checkMark: requestAutomationCheckMark,
    fireTriggerEvent: requestAutomationFireTriggerEvent,
    checkScopedFlag: requestAutomationCheckScopedFlag,
    setScopedFlag: requestAutomationSetScopedFlag,
    spendResource: (ability) => spendAbilityResource(sheet, ability, options),
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
  // Signal that the sheet changed so any visible panels can refresh. The
  // board listens for this, invalidates its sheet cache, and re-dispatches
  // the selection-summary event so the VTT character panel re-fetches and
  // re-renders the resource bar in real time. The standalone character
  // sheet page still needs a manual refresh (separate-page; out of scope).
  if (typeof document !== 'undefined' && options?.characterId) {
    document.dispatchEvent(new CustomEvent('vtt:character-sheet-updated', {
      detail: { characterId: options.characterId, change: 'resource' },
    }));
  }
  return { applied: amount, delta: next - current, resource: title, current: next };
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
  // so the visible resource bar repaints on the next selection-summary tick.
  // Without this the value-after-spend doesn't render until the user clicks
  // away and back.
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
  return Boolean(response.ok && payload?.success !== false);
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
  if (action?.cost) {
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
