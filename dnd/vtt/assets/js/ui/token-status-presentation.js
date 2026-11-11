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

/**
 * The squad badge in a token's bottom-left corner: "C" on a squad's captain (struck through once
 * it is down), a small chevron on a minion whose squad has a captain who is up. See squadBadge.
 */
export function syncSquadBadge(tokenElement, badge) {
  let badgeEl = tokenElement.querySelector('.vtt-token__squad-badge');
  if (!badge) {
    if (badgeEl) badgeEl.remove();
    delete tokenElement.dataset.squadRole;
    return;
  }
  if (!badgeEl) {
    badgeEl = document.createElement('span');
    badgeEl.className = 'vtt-token__squad-badge';
    tokenElement.appendChild(badgeEl);
  }
  const captain = badge.kind === 'captain';
  const role = captain ? (badge.down ? 'captain-down' : 'captain') : 'led';
  const title = captain
    ? (badge.down ? 'Captain, down: its squad has lost its bonus.' : `Captain of a squad of ${badge.minions} minion${badge.minions === 1 ? '' : 's'}.`)
    : `Led by ${badge.captainName}.`;
  tokenElement.dataset.squadRole = role;
  badgeEl.dataset.squadBadge = role;
  badgeEl.textContent = captain ? 'C' : '\u25B2';
  badgeEl.title = title;
  badgeEl.setAttribute('aria-label', title);
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

// markings: maintained persistent abilities shown with the conditions (November 11, 2026), each
// { key, text, title, endable }: an endable one has an × (data-token-maintained-end = key) that stops maintaining it.
export function paintTokenConditionLabel(tokenElement, conditions = [], {interactive = false, configureConditionTooltip = () => {}, detachConditionTooltip = () => {}, markings = []} = {}) {
  let label = tokenElement.querySelector('.vtt-token__condition');
  let hiddenBadge = tokenElement.querySelector('.vtt-token__hidden-effect');
  // A shown hidden effect (a buff) is on the token by its label; other hidden effects only as the FX badge.
  const isHiddenOnly = (condition) => (condition?.hidden || String(condition?.name || '').trim().toLowerCase() === 'hiddeneffect') && condition?.shown !== true;
  const hiddenConditions = conditions.filter(isHiddenOnly);
  const visibleConditions = conditions.filter((condition) => !isHiddenOnly(condition));
  tokenElement.classList.toggle('vtt-token--has-hidden-effects', hiddenConditions.length > 0);
  const marks = (Array.isArray(markings) ? markings : []).filter((mark) => mark && mark.key && mark.text);

  if (!visibleConditions.length && !marks.length) {
    if (label) {
      detachConditionTooltip(label);
      label.remove();
    }
  }

  const names = visibleConditions
    .map((condition) => (condition?.shown === true && typeof condition.label === 'string' && condition.label.trim()
      ? condition.label.trim()
      : condition && typeof condition.name === 'string' ? condition.name.trim() : ''))
    .filter(Boolean);
  const text = [...names, ...marks.map((mark) => mark.text)].join(' • ');

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

  // One line per condition, stacked (board.css .vtt-token__condition-line), not one line cut short.
  const lineKey = names.join('|') + (marks.length ? `#${marks.map((mark) => `${mark.key}:${mark.text}:${mark.endable && interactive ? 1 : 0}`).join('|')}` : '');
  if (label && text && label.dataset.conditionLines !== lineKey) {
    label.dataset.conditionLines = lineKey;
    const markLine = (mark) => {
      const line = document.createElement('span');
      line.className = 'vtt-token__condition-line vtt-token__condition-line--maintained';
      line.dataset.maintainedKey = mark.key;
      if (mark.title) line.title = mark.title;
      const words = document.createElement('span');
      words.textContent = mark.text;
      line.appendChild(words);
      if (mark.endable && interactive) {
        const end = document.createElement('button');
        end.type = 'button';
        end.className = 'vtt-token__maintained-end';
        end.setAttribute('data-token-maintained-end', mark.key);
        end.setAttribute('aria-label', `Stop maintaining ${mark.text}`);
        end.title = 'Stop maintaining it (no action)';
        end.textContent = '×';
        line.appendChild(end);
      }
      return line;
    };
    label.replaceChildren(...names.map((name) => { const line = document.createElement('span'); line.className = 'vtt-token__condition-line'; line.textContent = name; return line; }), ...marks.map(markLine));
  }
  if (label && text) {
    label.setAttribute('aria-label', text);
    label.removeAttribute('title');
    if (visibleConditions.length) configureConditionTooltip(label, visibleConditions, { delay: 500 });
    else detachConditionTooltip(label);
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
