import { normalizeMonsterSnapshot } from '../state/store.js';

let dialog = null;
let currentOptions = {};
let isOpen = false;

export function open(monster, options = {}) {
  if (typeof document === 'undefined') {
    return null;
  }

  const sanitized = normalizeMonsterSnapshot(monster) ?? null;
  if (!sanitized) {
    close();
    return null;
  }

  const instance = ensureDialog();
  if (!instance) {
    return null;
  }

  currentOptions = { ...options };

  renderDialog(instance, sanitized, currentOptions);

  instance.element.hidden = false;
  instance.element.dataset.open = 'true';
  isOpen = true;

  return instance.element;
}

export function close() {
  if (!dialog || !isOpen) {
    return;
  }

  const { element } = dialog;
  element.hidden = true;
  element.dataset.open = 'false';
  element.classList.remove('is-dragging');
  isOpen = false;

  const options = currentOptions;
  currentOptions = {};

  if (typeof options?.onClose === 'function') {
    try {
      options.onClose(options.placementId ?? null);
    } catch (error) {
      console.error('[VTT] Failed to notify stat block close handler', error);
    }
  }
}

function ensureDialog() {
  if (dialog && dialog.element?.isConnected) {
    return dialog;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const element = document.createElement('div');
  element.className = 'vtt-monster-stat-block';
  element.hidden = true;
  element.dataset.open = 'false';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');
  element.tabIndex = -1;
  element.style.left = element.style.left || '96px';
  element.style.top = element.style.top || '96px';

  const header = document.createElement('div');
  header.className = 'vtt-monster-stat-block__header';
  element.appendChild(header);

  const heading = document.createElement('div');
  heading.className = 'vtt-monster-stat-block__heading';
  header.appendChild(heading);

  const title = document.createElement('h2');
  title.className = 'vtt-monster-stat-block__title';
  heading.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'vtt-monster-stat-block__subtitle';
  subtitle.hidden = true;
  heading.appendChild(subtitle);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'vtt-monster-stat-block__close';
  closeButton.setAttribute('aria-label', 'Close monster stat block');
  closeButton.textContent = '×';
  header.appendChild(closeButton);

  const content = document.createElement('div');
  content.className = 'vtt-monster-stat-block__content';
  element.appendChild(content);

  document.body.appendChild(element);

  const dragHandlers = createDragHandlers(element, header);
  header.addEventListener('pointerdown', dragHandlers.handlePointerDown);
  closeButton.addEventListener('click', () => close());

  dialog = { element, header, title, subtitle, closeButton, content, dragHandlers };
  return dialog;
}

function renderDialog(instance, monster, options = {}) {
  const { element, title, subtitle, content } = instance;

  title.textContent = monster.name || 'Monster';

  const tokenName = typeof options.tokenName === 'string' ? options.tokenName.trim() : '';
  if (tokenName && tokenName.toLowerCase() !== (monster.name || '').toLowerCase()) {
    subtitle.textContent = tokenName;
    subtitle.hidden = false;
  } else {
    subtitle.textContent = '';
    subtitle.hidden = true;
  }

  element.setAttribute('aria-label', `${monster.name || 'Monster'} stat block`);

  const portraitMarkup = renderPortrait(monster);
  const coreStatsMarkup = renderCoreStats(monster);
  const defensesMarkup = renderDefenses(monster);
  const attributesMarkup = renderAttributes(monster);
  const abilitiesMarkup = renderAbilities(monster);

  const sections = [coreStatsMarkup, defensesMarkup, attributesMarkup, abilitiesMarkup]
    .filter(Boolean)
    .join('');

  content.innerHTML = `
    ${portraitMarkup}
    <div class="vtt-monster-stat-block__sections">
      ${sections || '<p class="vtt-monster-stat-block__empty">No additional stats available.</p>'}
    </div>
  `;
}

function renderPortrait(monster) {
  const url = typeof monster.imageUrl === 'string' ? monster.imageUrl.trim() : '';
  if (!url) {
    return '';
  }

  return `
    <div class="vtt-monster-stat-block__portrait">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(monster.name || 'Monster portrait')}" />
    </div>
  `;
}

function renderCoreStats(monster) {
  const entries = [];

  if (monster.level !== undefined && monster.level !== null) {
    entries.push(['Level', String(monster.level)]);
  }

  if (monster.role) {
    entries.push(['Role', monster.role]);
  }

  if (monster.size) {
    entries.push(['Size', monster.size]);
  }

  if (monster.footprint) {
    entries.push(['Footprint', monster.footprint]);
  }

  const hpValue = monster.hp ?? monster.stamina;
  if (hpValue !== undefined && hpValue !== null && hpValue !== '') {
    entries.push(['HP', String(hpValue)]);
  }

  if (monster.movement) {
    entries.push(['Movement', monster.movement]);
  }

  if (monster.ev !== undefined && monster.ev !== null) {
    entries.push(['EV', String(monster.ev)]);
  }

  if (monster.speed !== undefined && monster.speed !== null) {
    entries.push(['Speed', String(monster.speed)]);
  }

  if (!entries.length) {
    return '';
  }

  const items = entries
    .map(([label, value]) => `
      <div class="vtt-monster-stat-block__stat">
        <dt class="vtt-monster-stat-block__stat-label">${escapeHtml(label)}</dt>
        <dd class="vtt-monster-stat-block__stat-value">${escapeHtml(value)}</dd>
      </div>
    `)
    .join('');

  return `
    <section class="vtt-monster-stat-block__section">
      <h3 class="vtt-monster-stat-block__section-title">Core Stats</h3>
      <dl class="vtt-monster-stat-block__stat-grid">
        ${items}
      </dl>
    </section>
  `;
}

function renderDefenses(monster) {
  const defenses = monster.defenses && typeof monster.defenses === 'object' ? monster.defenses : {};
  const entries = [];

  if (defenses.immunity?.type || defenses.immunity?.value) {
    const type = defenses.immunity?.type ? `${defenses.immunity.type}` : '';
    const value = defenses.immunity?.value ? `${defenses.immunity.value}` : '';
    entries.push(['Immunity', [type, value].filter(Boolean).join(' – ')]);
  }

  if (defenses.weakness?.type || defenses.weakness?.value) {
    const type = defenses.weakness?.type ? `${defenses.weakness.type}` : '';
    const value = defenses.weakness?.value ? `${defenses.weakness.value}` : '';
    entries.push(['Weakness', [type, value].filter(Boolean).join(' – ')]);
  }

  if (defenses.stability !== undefined && defenses.stability !== null) {
    entries.push(['Stability', String(defenses.stability)]);
  } else if (monster.stability !== undefined && monster.stability !== null) {
    entries.push(['Stability', String(monster.stability)]);
  }

  if (defenses.free_strike !== undefined && defenses.free_strike !== null) {
    entries.push(['Free Strike', String(defenses.free_strike)]);
  } else if (monster.free_strike !== undefined && monster.free_strike !== null) {
    entries.push(['Free Strike', String(monster.free_strike)]);
  }

  if (!entries.length) {
    return '';
  }

  const items = entries
    .map(([label, value]) => `
      <div class="vtt-monster-stat-block__stat">
        <dt class="vtt-monster-stat-block__stat-label">${escapeHtml(label)}</dt>
        <dd class="vtt-monster-stat-block__stat-value">${escapeHtml(value)}</dd>
      </div>
    `)
    .join('');

  return `
    <section class="vtt-monster-stat-block__section">
      <h3 class="vtt-monster-stat-block__section-title">Resistances</h3>
      <dl class="vtt-monster-stat-block__stat-grid">
        ${items}
      </dl>
    </section>
  `;
}

function renderAttributes(monster) {
  const attributes = monster.attributes && typeof monster.attributes === 'object' ? monster.attributes : {};
  const keys = ['might', 'agility', 'reason', 'intuition', 'presence'];
  const items = keys
    .map((key) => {
      const value = attributes[key];
      if (value === undefined || value === null) {
        return '';
      }
      return `
        <li class="vtt-monster-stat-block__attribute-item">
          <span class="vtt-monster-stat-block__attribute-label">${escapeHtml(capitalize(key))}</span>
          <span class="vtt-monster-stat-block__attribute-value">${escapeHtml(String(value))}</span>
        </li>
      `;
    })
    .filter(Boolean)
    .join('');

  if (!items) {
    return '';
  }

  return `
    <section class="vtt-monster-stat-block__section">
      <h3 class="vtt-monster-stat-block__section-title">Attributes</h3>
      <ul class="vtt-monster-stat-block__attribute-list">
        ${items}
      </ul>
    </section>
  `;
}

function renderAbilities(monster) {
  const abilities = monster.abilities && typeof monster.abilities === 'object' ? monster.abilities : {};
  const categories = [
    ['passive', 'Passive Abilities'],
    ['maneuver', 'Maneuvers'],
    ['action', 'Actions'],
    ['triggered_action', 'Triggered Actions'],
    ['villain_action', 'Villain Actions'],
    ['malice', 'Malice'],
  ];

  const sections = categories
    .map(([key, label]) => {
      const list = Array.isArray(abilities[key]) ? abilities[key] : [];
      if (!list.length) {
        return '';
      }

      const items = list
        .map((ability) => renderAbility(ability, key))
        .filter(Boolean)
        .join('');

      if (!items) {
        return '';
      }

      return `
        <section class="vtt-monster-stat-block__section">
          <h3 class="vtt-monster-stat-block__section-title">${escapeHtml(label)}</h3>
          <ul class="vtt-monster-stat-block__ability-list">
            ${items}
          </ul>
        </section>
      `;
    })
    .filter(Boolean)
    .join('');

  return sections;
}

function renderAbility(ability, category) {
  if (!ability || typeof ability !== 'object') {
    return '';
  }

  const name = typeof ability.name === 'string' ? ability.name.trim() : '';
  if (!name) {
    return '';
  }

  const keywords = typeof ability.keywords === 'string' ? ability.keywords.trim() : '';
  const range = typeof ability.range === 'string' ? ability.range.trim() : '';
  const targets = typeof ability.targets === 'string' ? ability.targets.trim() : '';
  const effect = typeof ability.effect === 'string' ? ability.effect.trim() : '';
  const additional =
    typeof ability.additional_effect === 'string' ? ability.additional_effect.trim() : '';
  const trigger = typeof ability.trigger === 'string' ? ability.trigger.trim() : '';
  const resourceCost =
    typeof ability.resource_cost === 'string' ? ability.resource_cost.trim() : '';

  const metaParts = [keywords, range, targets].filter(Boolean);
  const metaMarkup = metaParts.length
    ? `<p class="vtt-monster-stat-block__ability-meta">${escapeHtml(metaParts.join(' • '))}</p>`
    : '';

  const sections = [];
  if (trigger && category === 'triggered_action') {
    sections.push(
      `<p class="vtt-monster-stat-block__ability-trigger"><strong>Trigger:</strong> ${formatText(trigger)}</p>`
    );
  }

  if (effect) {
    sections.push(
      `<p class="vtt-monster-stat-block__ability-text">${formatText(effect)}</p>`
    );
  }

  if (additional) {
    sections.push(
      `<p class="vtt-monster-stat-block__ability-text">${formatText(additional)}</p>`
    );
  }

  if (resourceCost && (category === 'villain_action' || category === 'malice')) {
    sections.push(
      `<p class="vtt-monster-stat-block__ability-resource"><strong>Cost:</strong> ${formatText(
        resourceCost
      )}</p>`
    );
  }

  if (ability.has_test && ability.test) {
    const testMarkup = renderAbilityTest(ability.test);
    if (testMarkup) {
      sections.push(testMarkup);
    }
  }

  return `
    <li class="vtt-monster-stat-block__ability">
      <h4 class="vtt-monster-stat-block__ability-name">${escapeHtml(name)}</h4>
      ${metaMarkup}
      ${sections.join('')}
    </li>
  `;
}

function renderAbilityTest(test) {
  if (!test || typeof test !== 'object') {
    return '';
  }

  const tiers = ['tier1', 'tier2', 'tier3'];
  const entries = tiers
    .map((tier) => {
      const data = test[tier];
      if (!data || typeof data !== 'object') {
        return '';
      }

      const parts = [];
      if (data.damage_amount) {
        parts.push(`Damage: ${data.damage_amount}`);
      }
      if (data.damage_type) {
        parts.push(`Type: ${data.damage_type}`);
      }
      if (data.has_attribute_check) {
        const checkParts = ['Check:'];
        if (data.attribute) {
          checkParts.push(String(data.attribute));
        }
        if (data.attribute_threshold !== undefined && data.attribute_threshold !== null) {
          checkParts.push(String(data.attribute_threshold));
        }
        parts.push(checkParts.join(' ').replace(/\s+/g, ' ').trim());
      }
      if (data.attribute_effect) {
        parts.push(data.attribute_effect);
      }

      if (!parts.length) {
        return '';
      }

      return `
        <li class="vtt-monster-stat-block__test-item">
          <span class="vtt-monster-stat-block__test-tier">${escapeHtml(capitalize(tier))}</span>
          <span class="vtt-monster-stat-block__test-details">${escapeHtml(parts.join(' • '))}</span>
        </li>
      `;
    })
    .filter(Boolean)
    .join('');

  if (!entries) {
    return '';
  }

  return `
    <div class="vtt-monster-stat-block__ability-test">
      <h5 class="vtt-monster-stat-block__ability-test-title">Test</h5>
      <ul class="vtt-monster-stat-block__test-list">
        ${entries}
      </ul>
    </div>
  `;
}

function createDragHandlers(container, handle) {
  const dragState = { active: false, pointerId: null, offsetX: 0, offsetY: 0 };

  const handlePointerDown = (event) => {
    if (!event || event.button !== 0) {
      return;
    }

    dragState.active = true;
    dragState.pointerId = event.pointerId;

    const rect = container.getBoundingClientRect();
    dragState.offsetX = event.clientX - rect.left;
    dragState.offsetY = event.clientY - rect.top;

    handle.setPointerCapture?.(event.pointerId);
    handle.addEventListener('pointermove', handlePointerMove);
    handle.addEventListener('pointerup', handlePointerUp);
    handle.addEventListener('pointercancel', handlePointerUp);

    container.classList.add('is-dragging');
  };

  const handlePointerMove = (event) => {
    if (!dragState.active || event.pointerId !== dragState.pointerId) {
      return;
    }

    const left = event.clientX - dragState.offsetX;
    const top = event.clientY - dragState.offsetY;

    const clampedLeft = Math.max(8, Math.round(left));
    const clampedTop = Math.max(8, Math.round(top));

    container.style.left = `${clampedLeft}px`;
    container.style.top = `${clampedTop}px`;
  };

  const handlePointerUp = (event) => {
    if (!dragState.active || event.pointerId !== dragState.pointerId) {
      return;
    }

    dragState.active = false;
    dragState.pointerId = null;
    container.classList.remove('is-dragging');

    handle.removeEventListener('pointermove', handlePointerMove);
    handle.removeEventListener('pointerup', handlePointerUp);
    handle.removeEventListener('pointercancel', handlePointerUp);
    handle.releasePointerCapture?.(event.pointerId);
  };

  return { handlePointerDown };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatText(value = '') {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function capitalize(value = '') {
  if (!value) {
    return '';
  }
  return (
    value.charAt(0).toUpperCase() +
    value
      .slice(1)
      .replace(/_/g, ' ')
      .replace(/(\d+)/g, ' $1')
  ).trim();
}
