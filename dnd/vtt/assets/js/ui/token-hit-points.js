import {normalizeCombatTeam} from '../state/normalize/placements.js';
const DEFAULT_HP_PLACEHOLDER = '—';
const DEFAULT_HP_DISPLAY = `${DEFAULT_HP_PLACEHOLDER} / ${DEFAULT_HP_PLACEHOLDER}`;

export function shouldRevealPlacementHitPointValues(placement, options = {}) {
  if (options?.isGm === true) return true;
  if (!placement || typeof placement !== 'object') return true;
  const team = normalizeCombatTeam(
    placement.combatTeam ??
      placement.team ??
      placement?.tags?.team ??
      placement.faction ??
      placement.alignment ??
      null
  );
  return team !== 'enemy';
}

export function normalizeHitPointsValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    if (typeof value.value === 'number' && Number.isFinite(value.value)) {
      return String(Math.trunc(value.value));
    }
    if (typeof value.value === 'string') {
      return value.value.trim();
    }
  }

  return '';
}

export function normalizePlacementHitPoints(value, fallbackMax = '') {
  const normalized = { current: '', max: '' };

  if (value && typeof value === 'object') {
    const currentSource =
      value.current ?? value.value ?? value.hp ?? value.currentHp ?? value.hpCurrent ?? null;
    const maxSource =
      value.max ??
      value.maxHp ??
      value.total ??
      value.maximum ??
      value.value ??
      value.hp ??
      value.hitPoints ??
      null;

    normalized.current = normalizeHitPointsValue(currentSource);
    normalized.max = normalizeHitPointsValue(maxSource);
  } else {
    const parsed = normalizeHitPointsValue(value);
    normalized.current = parsed;
    normalized.max = parsed;
  }

  const fallback = normalizeHitPointsValue(fallbackMax);
  if (normalized.max === '' && fallback !== '') {
    normalized.max = fallback;
  }

  if (normalized.current === '' && normalized.max !== '') {
    normalized.current = normalized.max;
  }

  return normalized;
}

export function parseHitPointsNumber(value) {
  const normalized = normalizeHitPointsValue(value);
  if (normalized === '') {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function calculateHitPointsFillPercentage(value) {
  const hp = normalizePlacementHitPoints(value);
  const maxValue = parseHitPointsNumber(hp.max);
  const currentValue = parseHitPointsNumber(hp.current);

  if (maxValue === null || maxValue <= 0) {
    if (currentValue === null || currentValue <= 0) {
      return { percent: 0, negative: currentValue !== null && currentValue < 0, tempPercent: 0 };
    }
    return { percent: 100, negative: false, tempPercent: 0 };
  }

  const safeCurrent = currentValue === null ? maxValue : currentValue;
  const isNegative = safeCurrent < 0;

  // Temp HP: current exceeds max
  const hasTempHp = safeCurrent > maxValue;
  const baseHp = hasTempHp ? maxValue : Math.abs(safeCurrent);
  const tempHp = hasTempHp ? safeCurrent - maxValue : 0;

  const ratio = Math.min(baseHp / maxValue, 1);
  const tempRatio = Math.min(tempHp / maxValue, 1);
  return {
    percent: Math.round(ratio * 100),
    negative: isNegative,
    tempPercent: Math.round(tempRatio * 100),
  };
}

export function formatHitPointsDisplayParts(value) {
  const hp = normalizePlacementHitPoints(value);
  if (hp.current === '' && hp.max === '') {
    return { main: DEFAULT_HP_DISPLAY, temp: null };
  }
  const currentText =
    hp.current === '' ? (hp.max === '' ? DEFAULT_HP_PLACEHOLDER : hp.max) : hp.current;
  const maxText = hp.max === '' ? DEFAULT_HP_PLACEHOLDER : hp.max;

  const currentNum = parseHitPointsNumber(hp.current);
  const maxNum = parseHitPointsNumber(hp.max);
  if (currentNum !== null && maxNum !== null && currentNum > maxNum) {
    const tempAmount = currentNum - maxNum;
    return { main: `${maxText} / ${maxText}`, temp: `(+${tempAmount})` };
  }

  return { main: `${currentText} / ${maxText}`, temp: null };
}

export function syncTokenHitPoints(tokenElement, placement, {isGm = false} = {}) {
  const showHp = Boolean(placement.showHp);
  let hpBar = tokenElement.querySelector('.vtt-token__hp-bar');

  if (!showHp) {
    if (hpBar) {
      hpBar.remove();
    }
    return;
  }

  const showHpValues = shouldRevealPlacementHitPointValues(placement, {isGm});

  if (!hpBar) {
    hpBar = document.createElement('div');
    hpBar.className = 'vtt-token__hp-bar';
    tokenElement.appendChild(hpBar);
  }

  let track = hpBar.querySelector('.vtt-token__hp-track');
  if (!track) {
    track = document.createElement('div');
    track.className = 'vtt-token__hp-track';
    hpBar.insertBefore(track, hpBar.firstChild || null);
  }

  let fillElement = track.querySelector('.vtt-token__hp-fill');
  if (!fillElement) {
    fillElement = document.createElement('div');
    fillElement.className = 'vtt-token__hp-fill';
    track.appendChild(fillElement);
  }

  let valueElement = hpBar.querySelector('.vtt-token__hp-value');
  let tempValueElement = hpBar.querySelector('.vtt-token__hp-temp-value');
  if (showHpValues && !valueElement) {
    valueElement = document.createElement('span');
    valueElement.className = 'vtt-token__hp-value';
    hpBar.appendChild(valueElement);
  } else if (!showHpValues && valueElement) {
    valueElement.remove();
    valueElement = null;
  }

  const hp = normalizePlacementHitPoints(placement.hp);
  const displayParts = formatHitPointsDisplayParts(hp);

  if (valueElement && valueElement.textContent !== displayParts.main) {
    valueElement.textContent = displayParts.main;
  }

  // Handle temp HP as a separate line
  if (showHpValues && displayParts.temp) {
    if (!tempValueElement) {
      tempValueElement = document.createElement('span');
      tempValueElement.className = 'vtt-token__hp-temp-value';
      hpBar.appendChild(tempValueElement);
    }
    if (tempValueElement.textContent !== displayParts.temp) {
      tempValueElement.textContent = displayParts.temp;
    }
  } else if (tempValueElement) {
    tempValueElement.remove();
  }

  // Temp HP fill bar (overlaid on track, different color)
  let tempFillElement = track.querySelector('.vtt-token__hp-temp-fill');

  if (fillElement) {
    const { percent, negative, tempPercent } = calculateHitPointsFillPercentage(hp);
    fillElement.style.width = `${percent}%`;
    if (negative) {
      fillElement.classList.add('vtt-token__hp-fill--negative');
    } else {
      fillElement.classList.remove('vtt-token__hp-fill--negative');
    }

    // Show/hide temp HP bar
    if (tempPercent > 0) {
      if (!tempFillElement) {
        tempFillElement = document.createElement('div');
        tempFillElement.className = 'vtt-token__hp-temp-fill';
        track.appendChild(tempFillElement);
      }
      tempFillElement.style.width = `${tempPercent}%`;
    } else if (tempFillElement) {
      tempFillElement.remove();
    }
  }

  const isEmpty = !hp || (hp.current === '' && hp.max === '');
  hpBar.dataset.empty = isEmpty ? 'true' : 'false';
  const ariaLabel = isEmpty
    ? 'Hit points not set'
    : showHpValues
      ? `${displayParts.main}${displayParts.temp ? ' ' + displayParts.temp : ''} hit points`
      : 'Hit points';
  hpBar.setAttribute('aria-label', ariaLabel);
}
