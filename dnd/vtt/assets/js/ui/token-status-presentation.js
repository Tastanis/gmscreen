import {normalizeCombatTeam} from '../state/normalize/placements.js';

export function syncTokenTeamAffiliation(tokenElement, placement) {
  const team = normalizeCombatTeam(placement.team ?? placement.combatTeam ?? null);
  if (team) {
    tokenElement.dataset.combatTeam = team;
  } else {
    delete tokenElement.dataset.combatTeam;
  }

  // Mark tokens that are part of a minion squad so CSS / display logic can react.
  if (placement?.squad?.id) {
    tokenElement.dataset.squad = 'true';
  } else {
    delete tokenElement.dataset.squad;
  }
}

export function paintTokenMarkIndicator(tokenElement, mark, {interactive = false} = {}) {
  let markEl = tokenElement.querySelector('.vtt-token__judgment-mark');
  if (!mark) {
    if (markEl) markEl.remove();
    return;
  }
  if (!markEl) {
    markEl = document.createElement('button');
    markEl.type = 'button';
    markEl.className = 'vtt-token__judgment-mark';
    if (interactive) markEl.setAttribute('data-token-judgment-mark', 'true');
    markEl.textContent = 'J';
    tokenElement.appendChild(markEl);
  }
  if (!interactive) markEl.removeAttribute('data-token-judgment-mark');
  const sourceName = mark.sourceName || 'censor';
  const action = interactive ? ' Click to end.' : '';
  markEl.title = `Judged by ${sourceName}.${action}`;
  markEl.setAttribute('aria-label', `Judged by ${sourceName}.${action}`);
}

export function paintTokenConditionLabel(tokenElement, conditions = [], {interactive = false, configureConditionTooltip = () => {}, detachConditionTooltip = () => {}} = {}) {
  let label = tokenElement.querySelector('.vtt-token__condition');
  let hiddenBadge = tokenElement.querySelector('.vtt-token__hidden-effect');
  const hiddenConditions = conditions.filter((condition) => condition?.hidden || String(condition?.name || '').trim().toLowerCase() === 'hiddeneffect');
  const visibleConditions = conditions.filter((condition) => !(condition?.hidden || String(condition?.name || '').trim().toLowerCase() === 'hiddeneffect'));
  tokenElement.classList.toggle('vtt-token--has-hidden-effects', hiddenConditions.length > 0);

  if (!visibleConditions.length) {
    if (label) {
      detachConditionTooltip(label);
      label.remove();
    }
  }

  const text = visibleConditions
    .map((condition) => (condition && typeof condition.name === 'string' ? condition.name.trim() : ''))
    .filter(Boolean)
    .join(' • ');

  if (!text) {
    if (label) {
      detachConditionTooltip(label);
      label.remove();
    }
  } else if (!label) {
    label = document.createElement('div');
    label.className = 'vtt-token__condition';
    tokenElement.appendChild(label);
  }

  if (label && text && label.textContent !== text) {
    label.textContent = text;
  }
  if (label && text) {
    label.setAttribute('aria-label', text);
    label.removeAttribute('title');
    configureConditionTooltip(label, visibleConditions, { delay: 500 });
  }

  if (!hiddenConditions.length) {
    if (hiddenBadge) hiddenBadge.remove();
    return;
  }

  const hiddenText = hiddenConditions
    .map((condition) => condition.label || condition.sourceAbility || condition.name || 'Effect')
    .filter(Boolean)
    .join(', ');
  if (!hiddenBadge) {
    hiddenBadge = document.createElement('div');
    hiddenBadge.className = 'vtt-token__hidden-effect';
    if (interactive) hiddenBadge.setAttribute('data-token-hidden-effect', '');
    if (interactive) hiddenBadge.setAttribute('role', 'button');
    if (interactive) hiddenBadge.setAttribute('tabindex', '0');
    if (interactive) hiddenBadge.style.cursor = 'pointer';
    tokenElement.appendChild(hiddenBadge);
  }
  if (!interactive) {
    for (const attr of ['data-token-hidden-effect','role','tabindex']) hiddenBadge.removeAttribute(attr);
    hiddenBadge.style.cursor = '';
  }
  const action = interactive ? ' (click to remove)' : '';
  hiddenBadge.textContent = 'FX';
  hiddenBadge.setAttribute('aria-label', `Hidden effects: ${hiddenText}${action}`);
  hiddenBadge.title = `Hidden effects: ${hiddenText}${interactive ? '\n(click to remove)' : ''}`;
}
