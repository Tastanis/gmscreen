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

export function mountCharacterSummaryPanel(routes = {}) {
  const panel = document.getElementById('vtt-character-summary-panel');
  if (!panel) {
    return;
  }

  let activeRequestId = 0;
  let activeCharacterId = null;
  const boardHeader = document.querySelector('.vtt-board__header');

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
    panel.classList.remove('vtt-character-summary--open');
    panel.classList.add('vtt-character-summary--closed');
    panel.setAttribute('aria-hidden', 'true');
    document.body?.classList.remove('vtt-character-summary-is-open');
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
    open();
  };

  const setError = () => {
    panel.innerHTML = '<div class="vtt-character-summary__error">Unable to load this character sheet.</div>';
    open();
  };

  async function showCharacter(detail = {}) {
    const characterId = normalizeCharacterId(detail.characterId);
    if (!characterId) {
      close();
      return;
    }

    activeCharacterId = characterId;
    const requestId = ++activeRequestId;
    const token = detail.token && typeof detail.token === 'object' ? detail.token : {};
    setLoading(token.name || characterId);

    try {
      const sheet = await fetchCharacterSummary(routes, characterId);
      if (requestId !== activeRequestId || activeCharacterId !== characterId) {
        return;
      }
      panel.innerHTML = renderCharacterCard(sheet, {
        characterId,
        token,
      });
      bindCharacterSummaryControls(panel);
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
