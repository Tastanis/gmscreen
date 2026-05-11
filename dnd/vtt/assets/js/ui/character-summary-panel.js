const PC_CHARACTER_IDS = new Set(['frunk', 'sharon', 'indigo', 'zepha']);

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

export function mountCharacterSummaryPanel(routes = {}) {
  const panel = document.getElementById('vtt-character-summary-panel');
  if (!panel) {
    return;
  }

  let activeRequestId = 0;
  let activeCharacterId = null;
  let activeAbilityCategory = null;
  let activeSheet = null;
  let activeToken = null;
  const boardHeader = document.querySelector('.vtt-board__header');
  const abilityTray = ensureAbilityTray();
  const abilityPreview = ensureAbilityPreview();

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

  const close = () => {
    activeCharacterId = null;
    activeSheet = null;
    activeAbilityCategory = null;
    activeToken = null;
    panel.classList.remove('vtt-character-summary--open');
    panel.classList.add('vtt-character-summary--closed');
    panel.setAttribute('aria-hidden', 'true');
    document.body?.classList.remove('vtt-character-summary-is-open');
    renderAbilityTray(abilityTray, null);
    hideAbilityPreview(abilityPreview);
  };

  const open = () => {
    updatePanelTop();
    panel.classList.add('vtt-character-summary--open');
    panel.classList.remove('vtt-character-summary--closed');
    panel.setAttribute('aria-hidden', 'false');
    document.body?.classList.add('vtt-character-summary-is-open');
  };

  const setLoading = (name) => {
    panel.innerHTML = `<div class="vtt-character-summary__loading">Loading ${escapeHtml(name || 'character')}...</div>`;
    renderAbilityTray(abilityTray, null);
    hideAbilityPreview(abilityPreview);
    open();
  };

  const setError = () => {
    panel.innerHTML = '<div class="vtt-character-summary__error">Unable to load this character sheet.</div>';
    renderAbilityTray(abilityTray, null);
    hideAbilityPreview(abilityPreview);
    open();
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
      panel.innerHTML = renderCharacterCard(sheet, {
        characterId,
        token,
      });
      bindCharacterSummaryControls(panel);
      renderAbilityTray(abilityTray, sheet, { activeCategory: activeAbilityCategory, activeToken });
      open();
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
      close();
      return;
    }
    showCharacter(detail);
  });

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
      const action = getAbilityAction(activeSheet, abilityItem.dataset.abilityCategory, abilityItem.dataset.abilityIndex);
      if (action && hasAbilityAutomation(action.automation)) {
        event.preventDefault();
        event.stopPropagation();
        activeAbilityCategory = null;
        hideAbilityPreview(abilityPreview);
        renderAbilityTray(abilityTray, activeSheet, { activeCategory: activeAbilityCategory, activeToken });
        startAbilityAutomation(activeSheet, action, abilityItem.dataset.abilityCategory, activeToken, {
          characterId: activeCharacterId,
          routes,
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
    const action = getAbilityAction(activeSheet, item.dataset.abilityCategory, item.dataset.abilityIndex);
    if (action) {
      renderAbilityPreview(abilityPreview, action, item.dataset.abilityCategory);
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
    const action = getAbilityAction(activeSheet, item.dataset.abilityCategory, item.dataset.abilityIndex);
    if (action) {
      renderAbilityPreview(abilityPreview, action, item.dataset.abilityCategory);
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

function bindCharacterSummaryControls(panel) {
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
        const actions = getAbilityActions(sheet, category.key);
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
  return `
    <button
      class="vtt-character-ability-item${automated ? ' vtt-character-ability-item--automated' : ''}"
      type="button"
      role="menuitem"
      data-character-ability-item
      data-ability-category="${escapeAttribute(categoryKey)}"
      data-ability-index="${escapeAttribute(index)}"
    >
      <span class="vtt-character-ability-item__mark" aria-hidden="true">${escapeHtml(getAbilityIcon(categoryKey))}</span>
      <span class="vtt-character-ability-item__text">
        <span class="vtt-character-ability-item__name">${escapeHtml(name)}</span>
        ${meta ? `<span class="vtt-character-ability-item__meta">${escapeHtml(meta)}</span>` : ''}
      </span>
      ${automated ? '<span class="vtt-character-ability-item__auto" aria-label="Automated">Auto</span>' : ''}
    </button>
  `;
}

function renderAbilityPreview(preview, action, categoryKey) {
  if (!preview || !action) {
    return;
  }

  const title = action.name || 'Untitled Ability';
  const actionLabel = action.actionLabel || getAbilityCategoryLabel(categoryKey);
  const tags = Array.isArray(action.tags) ? action.tags.filter(Boolean) : [];
  const useWhen = typeof action.useWhen === 'string' ? action.useWhen.trim() : '';
  const descriptionBlocks = extractTextBlocks(action.description || '');
  const tests = Array.isArray(action.tests) ? action.tests : [];

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
      ${tests.length ? `<div class="vtt-character-ability-card__tests">${tests.map(renderAbilityTest).join('')}</div>` : ''}
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

function renderAbilityTest(test) {
  const tiers = test?.tiers && typeof test.tiers === 'object' ? test.tiers : {};
  return `
    <section class="vtt-character-ability-test">
      <header>
        <strong>${escapeHtml(test?.label || 'Power Roll')}</strong>
        <span>${escapeHtml(formatRoll(test?.rollMod))}</span>
      </header>
      ${test?.beforeEffect ? `<p>${escapeHtml(test.beforeEffect)}</p>` : ''}
      <div class="vtt-character-ability-test__tiers">
        ${Object.entries(TEST_TIER_LABELS).map(([key, label]) => renderAbilityTier(label, tiers[key])).join('')}
      </div>
      ${test?.additionalEffect ? `<p>${escapeHtml(test.additionalEffect)}</p>` : ''}
    </section>
  `;
}

function renderAbilityTier(label, tier = {}) {
  const parts = [];
  if (tier?.damage) {
    parts.push(`${tier.damage}${tier.damageType ? ` ${tier.damageType}` : ''}`);
  }
  if (tier?.notes) {
    parts.push(tier.notes);
  }
  if (tier?.attributeCheck?.enabled) {
    const attribute = tier.attributeCheck.attribute || 'Attribute';
    const threshold = tier.attributeCheck.threshold || '-';
    const effect = tier.attributeCheck.effect || '';
    parts.push(`${attribute} <= ${threshold}${effect ? `: ${effect}` : ''}`);
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

function getAbilityActions(sheet, categoryKey) {
  const actions = sheet?.actions && typeof sheet.actions === 'object' ? sheet.actions : {};
  const list = Array.isArray(actions[categoryKey]) ? actions[categoryKey] : [];
  return list.filter((action) => action && typeof action === 'object' && (action.name || action.description || action.useWhen));
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

async function spendAbilityResource(sheet, ability, options = {}) {
  const cost = parseAbilityResourceCost(ability?.cost);
  if (!cost.amount) return { skipped: true };
  const hero = sheet?.hero && typeof sheet.hero === 'object' ? sheet.hero : {};
  const resource = hero.resource && typeof hero.resource === 'object' ? hero.resource : {};
  const title = resource.title || sheet?.sidebar?.resource?.title || 'Resource';
  const costName = cost.name.toLowerCase();
  if (costName && title.toLowerCase() !== costName) return { skipped: true };
  const current = Number.parseInt(resource.value ?? 0, 10) || 0;
  if (current < cost.amount) {
    const proceed = window.confirm(`${title} is ${current}, but ${ability?.name || 'this ability'} costs ${cost.amount}. Continue anyway?`);
    return proceed ? { continued: true, insufficient: true } : { canceled: true };
  }
  resource.value = Math.max(0, current - cost.amount);
  hero.resource = resource;
  if (sheet) sheet.hero = hero;
  await saveCharacterSummarySheet(sheet, options);
  return { spent: cost.amount, resource: title, remaining: resource.value };
}

function parseAbilityResourceCost(value) {
  const match = String(value || '').trim().match(/^(\d+)\s+(.+)$/);
  if (!match) return { amount: 0, name: '' };
  return {
    amount: Math.max(0, Number.parseInt(match[1], 10) || 0),
    name: match[2].trim(),
  };
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

function getAbilityAction(sheet, categoryKey, indexValue) {
  const index = Number.parseInt(indexValue, 10);
  if (!categoryKey || !Number.isInteger(index) || index < 0) {
    return null;
  }
  return getAbilityActions(sheet, categoryKey)[index] || null;
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
