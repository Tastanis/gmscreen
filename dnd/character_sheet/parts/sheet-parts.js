// The sheet's parts as HTML: the status bar, the tab bar, Skills & traits, Abilities, Features and Record.
// Shared by the full sheet (character_sheet/app.js) and the map's side panel (vtt character-summary-panel.js), which
// draws the same parts at panel width with no Abilities tab (the board's ability bar has them).
// Design: the approved mock-up (table/sheet-mock.*, Brandon, five rounds, October 2026).
//
// Clickable parts carry data-* hooks; the page that draws them binds them. The status bar uses the side panel's
// hook names (data-character-stamina-action, data-character-recovery, ...) on both pages, so one vocabulary.

import { staminaBarView, recoveryValueOf } from './stamina-math.js';
import { SKILL_GROUPS, getSkillGroup, normalizeSkillsState, effectiveKit, KIT_FIELD_LABELS, hasAbilityAutomation, ACTION_TYPES } from './sheet-model.js';
import { PICKER_CONDITION_NAMES, conditionOptionLabel, conditionChipLabel, durationShort, durationLong, normalizeSheetConditions, MAX_CONDITION_NAME } from './conditions.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Plain words from sheet text: markup and &nbsp; gone, intended line breaks kept as " · ". */
export const words = (s) => String(s ?? '').replace(/<br\s*\/?>/gi, ' · ').replace(/<\/(p|div|li)>/gi, ' · ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').replace(/( · )+/g, ' · ').replace(/^( · )+|( · )+$/g, '').replace(/^·\s*|\s*·$/g, '').trim();
export const plain = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const sign = (n) => (n > 0 ? '+' + n : String(n));
/** The post-to-chat button on a card header: a gold speech bubble. */
export const CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/></svg>';
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------------------------------------------------------------- theme (Diablo by default; this browser's choice)
export const THEME_KEY = 'sheet-theme';
export function readTheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try { return storage?.getItem(THEME_KEY) === 'parchment' ? 'parchment' : 'diablo'; } catch (_) { return 'diablo'; }
}
export function writeTheme(theme, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const value = theme === 'parchment' ? 'parchment' : 'diablo';
  try { storage?.setItem(THEME_KEY, value); } catch (_) { /* no storage: the choice lasts this page only */ }
  return value;
}
export const themeToggleHtml = (theme) => `<button type="button" class="sp-theme-toggle" data-sheet-theme-toggle title="Switch between the Diablo and Parchment looks">${theme === 'diablo' ? '☀ Parchment' : '☾ Diablo'}</button>`;

// ---------------------------------------------------------------- portraits
/** A stored picture path as a URL from this page: paths under dnd/ ("portraits/x.png") get the dnd/ folder's URL
 *  (base, e.g. "/dnd/"); full URLs, absolute paths and data: URLs stay as they are. */
export function mediaUrl(path, base = '/dnd/') {
  const p = String(path ?? '').trim();
  if (!p) return '';
  if (/^(https?:)?\/\//i.test(p) || p.startsWith('/') || p.startsWith('data:') || p.startsWith('blob:')) return p;
  return `${String(base || '').replace(/\/?$/, '/')}${p.replace(/^(\.\/)+/, '')}`;
}
/** The first picture there is, as a URL: candidates in order (the campaign record's portrait, the heroes list's,
 *  the hero's map token image). '' when none: the header shows initials. */
export function pickPortrait(candidates, base = '/dnd/') {
  for (const c of candidates || []) { const url = mediaUrl(c, base); if (url) return url; }
  return '';
}
/** Up to two initials for a name ("Cal" -> "C", "Nora Ann Vu" -> "NV"). */
export function initialsOf(name) {
  const bits = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!bits.length) return '?';
  return (bits.length > 1 ? bits[0][0] + bits[bits.length - 1][0] : bits[0][0]).toUpperCase();
}

// ---------------------------------------------------------------- text into parts
/** A flavour line and labelled parts ("Effect:", "Strained:", "Spend 2 Clarity:") from sheet text. */
export function parts(html) {
  const lines = String(html || '').split(/<br\s*\/?>|<\/p>|<\/div>|\n/i).map((l) => l.replace(/&nbsp;/g, ' ').trim()).filter((l) => l && l !== ' ');
  const flavour = [], labelled = [];
  for (const raw of lines) {
    const text = decode(raw.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const m = text.match(/^([A-Z][A-Za-z0-9 '+\-]{1,28}):\s*(.*)$/);
    if (m) labelled.push([m[1], m[2]]);
    else if (labelled.length) labelled[labelled.length - 1][1] += ' ' + text;
    else flavour.push(text);
  }
  return { flavour: flavour.join(' '), labelled };
}

/** A cost worth a pill: not empty and not a stand-in for "no cost" ("None", "—", "-", "n/a"). */
export function costLabel(cost) {
  const c = String(cost ?? '').trim();
  return !c || /^(none|no cost|n\/?a|[-—–]+)$/i.test(c) ? '' : c;
}

const FLAVOUR_MAX = 160;
/**
 * An ability's text split for reading: the flavour (one short opening line, italic), the rules text that is not
 * labelled (roman), and the labelled parts. A long first line is rules text, not flavour.
 */
export function abilityText(html) {
  const lines = String(html || '').split(/<br\s*\/?>|<\/p>|<\/div>|\n/i).map((l) => l.replace(/&nbsp;/g, ' ').trim()).filter(Boolean);
  const unlabelled = [];
  for (const raw of lines) {
    const text = decode(raw.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (/^([A-Z][A-Za-z0-9 '+\-]{1,28}):\s*(.*)$/.test(text)) break;
    unlabelled.push(text);
  }
  const { labelled } = parts(html);
  if (!unlabelled.length) return { flavour: '', effect: '', labelled };
  const [first, ...rest] = unlabelled;
  return first.length <= FLAVOUR_MAX
    ? { flavour: first, effect: rest.join(' '), labelled }
    : { flavour: '', effect: unlabelled.join(' '), labelled };
}

/** Rules text longer than this is clamped to about four lines with a "More" toggle. */
export const CLAMP_CHARS = 300;

/** The "More" / "Show all" toggle on a long ability or feature card (both pages bind it to this). */
export function toggleMore(button) {
  const card = button?.closest?.('.sp-ft, .sp-ab');
  if (!card) return;
  const open = card.classList.toggle('open');
  button.setAttribute('aria-expanded', String(open));
  button.textContent = card.classList.contains('sp-ab') ? (open ? 'Less' : 'More') : (open ? 'Show less' : 'Show all');
}

// ---------------------------------------------------------------- conditions (sheet and side panel alike)
/**
 * Condition chips. chips: [{label, short (SE / EOT), title, detail, hidden, removeAttrs (the × button's data-*)}].
 * The duration shows small after the name; the × is there only when the chip can be taken off.
 */
export function conditionChipsHtml(chips, { emptyText = '' } = {}) {
  const list = Array.isArray(chips) ? chips : [];
  if (!list.length) return emptyText ? `<span class="sp-cond-none">${esc(emptyText)}</span>` : '';
  return list.map((chip) => {
    const label = String(chip.label || 'Effect');
    return `<span class="sp-cond${chip.hidden ? ' sp-cond--hidden' : ''}"${chip.title ? ` title="${esc(chip.title)}"` : ''}><b class="sp-cond__name">${esc(label)}</b>`
      + (chip.short ? `<small class="sp-cond__dur">${esc(chip.short)}</small>` : '')
      + (chip.detail ? `<small class="sp-cond__detail">${esc(chip.detail)}</small>` : '')
      + (chip.removeAttrs ? `<button type="button" class="sp-cond__x" ${chip.removeAttrs} aria-label="Remove ${esc(label)}" title="Remove ${esc(label)}">×</button>` : '')
      + '</span>';
  }).join('');
}

/** The sheet's own list as chips: hero.conditions (structured), × by index. */
export function sheetConditionChips(conditions, { canEdit = false } = {}) {
  return normalizeSheetConditions(conditions).map((condition, index) => {
    const label = conditionChipLabel(condition);
    return {
      label, short: durationShort(condition.duration.type), title: [label, durationLong(condition.duration.type)].filter(Boolean).join(' — '),
      removeAttrs: canEdit ? `data-sheet-condition-remove="${index}"` : '',
    };
  });
}

/**
 * The "+ condition" button and its themed menu (no native select): SE / EOT first (save ends unless changed), then
 * the conditions of the shared list, then "Other…" (a name typed in the menu). wireConditionPicker binds it.
 */
export function conditionPickerHtml({ title = 'Add a condition' } = {}) {
  const durations = [['save-ends', 'SE', 'Save ends'], ['end-of-turn', 'EOT', 'End of turn']]
    .map(([value, short, long], i) => `<button type="button" role="radio" aria-checked="${i === 0}" class="${i === 0 ? 'on' : ''}" data-condition-duration="${value}" title="${long}">${short}</button>`).join('');
  return `<span class="sp-cond-picker" data-character-condition-picker>
      <button type="button" class="sp-cond sp-cond--add" data-character-condition-menu aria-haspopup="menu" aria-expanded="false" title="${esc(title)}">+ condition</button>
      <span class="sp-cond-menu" role="menu" aria-label="Add condition" hidden>
        <span class="sp-cond-durs" role="radiogroup" aria-label="Duration">${durations}</span>
        ${PICKER_CONDITION_NAMES.map((name) => `<button type="button" role="menuitem" data-character-condition-pick="${esc(name)}">${esc(conditionOptionLabel(name))}</button>`).join('')}
        <button type="button" role="menuitem" class="sp-cond-menu__other" data-character-condition-other>Other…</button>
        <span class="sp-cond-other" data-condition-other-form hidden><input type="text" maxlength="${MAX_CONDITION_NAME}" placeholder="Condition name" aria-label="Condition name" data-condition-other-text><button type="button" data-condition-other-add>Add</button></span>
      </span>
    </span>`;
}

/** Binds every condition picker under root: onPick({name, duration: 'save-ends' | 'end-of-turn'}). */
export function wireConditionPicker(root, onPick) {
  root?.querySelectorAll?.('[data-character-condition-picker]').forEach((picker) => {
    if (picker.dataset.wired === '1') return;
    picker.dataset.wired = '1';
    const toggle = picker.querySelector('[data-character-condition-menu]');
    const menu = picker.querySelector('[role="menu"]');
    if (!toggle || !menu) return;
    const doc = picker.ownerDocument;
    const items = () => [...menu.querySelectorAll('[data-character-condition-pick], [data-character-condition-other]')];
    const form = menu.querySelector('[data-condition-other-form]');
    const input = menu.querySelector('[data-condition-other-text]');
    const duration = () => menu.querySelector('[data-condition-duration].on')?.dataset.conditionDuration || 'save-ends';
    const onOutside = (event) => { if (!picker.contains(event.target)) setOpen(false); };
    function setOpen(open, { focus = false } = {}) {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      picker.classList.toggle('is-open', open);
      if (!open && form) { form.hidden = true; if (input) input.value = ''; }
      // Each opening starts at save ends: EOT is chosen for the pick it is wanted for.
      if (open) menu.querySelectorAll('[data-condition-duration]').forEach((button, i) => { button.classList.toggle('on', i === 0); button.setAttribute('aria-checked', String(i === 0)); });
      if (open && focus) items()[0]?.focus();
      if (open) doc.addEventListener('pointerdown', onOutside, true);
      else doc.removeEventListener('pointerdown', onOutside, true);
    }
    const pick = (name) => {
      const text = String(name || '').trim();
      if (!text) return;
      const chosen = { name: text, duration: duration() };
      setOpen(false);
      onPick?.(chosen);
    };
    toggle.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); setOpen(menu.hidden, { focus: event.detail === 0 }); });
    toggle.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true, { focus: true }); } });
    menu.addEventListener('keydown', (event) => {
      if (input && event.target === input) {
        if (event.key === 'Enter') { event.preventDefault(); pick(input.value); }
        else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); toggle.focus(); }
        return;
      }
      const list = items();
      const at = list.indexOf(doc.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); toggle.focus(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); list[(at + 1) % list.length]?.focus(); }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
    });
    menu.addEventListener('click', (event) => {
      const t = event.target && typeof event.target.closest === 'function' ? event.target : null;
      if (!t || (input && t === input)) return;
      event.preventDefault();
      event.stopPropagation();
      const dur = t.closest('[data-condition-duration]');
      if (dur) {
        menu.querySelectorAll('[data-condition-duration]').forEach((b) => { const on = b === dur; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        return;
      }
      if (t.closest('[data-character-condition-other]')) { if (form) { form.hidden = false; input?.focus(); } return; }
      if (t.closest('[data-condition-other-add]')) { pick(input?.value); return; }
      const choice = t.closest('[data-character-condition-pick]');
      if (choice) pick(choice.dataset.characterConditionPick);
    });
  });
}

// ---------------------------------------------------------------- status bar
const STATS = [['might', 'Might'], ['agility', 'Agility'], ['reason', 'Reason'], ['intuition', 'Intuition'], ['presence', 'Presence']];

/** The stamina bar: green from the left, temporary Stamina blue from the right, an unlabelled tick at half (its title
 *  says "Winded at N"). The state pill is the bar's one label: "winded" or "dying", with "N temp" first while
 *  temporary Stamina is held; a healthy hero with none shows no pill. --sp-temp (the blue segment's width) keeps the
 *  pill clear of the blue stripe. */
export function staminaBarHtml(vitals) {
  const view = staminaBarView(vitals || {});
  const state = view.dying ? 'dying' : view.winded ? 'winded' : 'stamina';
  const pill = [view.temp ? `${view.temp} temp` : '', state === 'stamina' ? '' : state].filter(Boolean).join(' · ');
  const history = Array.isArray(vitals?.staminaHistory) && vitals.staminaHistory.length > 1 ? ` · last: ${vitals.staminaHistory.slice(-4).join(' → ')}` : '';
  return `<div class="sp-stam sp-stam--${state}"${view.bluePct ? ` style="--sp-temp:${view.bluePct}%"` : ''} title="${view.windedAt !== null ? `Winded at ${view.windedAt}` : 'No Stamina maximum'}${view.temp ? ` · ${view.temp} temporary Stamina (taken first)` : ''}${esc(history)}" data-sp-stamina>
    <div class="sp-stam__fill" style="width:${view.greenPct}%"></div>
    ${view.negativePct ? `<div class="sp-stam__neg" style="width:${view.negativePct}%"></div>` : ''}
    ${view.bluePct ? `<div class="sp-stam__temp" style="width:${view.bluePct}%" data-sp-temp-fill></div>` : ''}
    <div class="sp-stam__winded"${view.windedAt !== null ? ` title="Winded at ${view.windedAt}"` : ''}></div>
    <div class="sp-stam__txt"><span class="vtt-character-healthbar__text">${view.current} / ${view.max ?? '—'}${view.temp ? ` <small class="sp-stam__tempnum">+${view.temp}</small>` : ''}</span>${pill ? `<small class="sp-stam__state">${pill}</small>` : ''}</div>
  </div>`;
}

/** The "+2" / "+D3" chip by the Heroic Resource: the hero's start-of-turn gain (hero.resource.autoDice). */
export function resourceGainTip(autoDice, resTitle = 'Resource') {
  const gain = String(autoDice || '').trim();
  const dice = /d/i.test(gain);
  return `Start-of-turn ${resTitle} gain: ${dice ? `roll ${gain.toUpperCase()} and add it to ${resTitle}` : `add ${gain} ${resTitle}`}. Press at the start of your turn.`;
}

/**
 * ctx: { characterId, portrait, panel (bool), conditionsHtml (the panel's own chips), conditions (the sheet's list:
 * hero.conditions, structured), conditionsTitle, canEdit, headerExtra, saveStatus }
 */
export function statusHtml(sheet, ctx = {}) {
  const h = sheet?.hero || {}, vit = h.vitals || {};
  const max = num(vit.staminaMax, 0);
  const recMax = Math.max(0, Math.min(16, num(vit.recoveriesMax))), rec = num(vit.currentRecoveries, recMax);
  // A recovery heals a third of max Stamina, rounded down (Brandon, October 2026: "It should just be 1/3 health").
  // An old stored recoveryValue on a sheet is ignored.
  const recVal = recoveryValueOf(vit);
  const res = h.resource || {}, resTitle = res.title || sheet?.sidebar?.resource?.title || 'Resource';
  const tokens = [Boolean(h.heroTokens?.[0]), Boolean(h.heroTokens?.[1])];
  const s = h.stats || {};
  const portrait = String(ctx.portrait || '').trim();
  const pic = portrait ? `background-image:url('${esc(portrait.replace(/'/g, '%27'))}')` : '';
  const autoDice = String(res.autoDice || '').trim();
  // The sheet's list (hero.conditions: the token's while the hero is on the map), or the panel's own chips.
  const conds = ctx.conditionsHtml !== undefined
    ? ctx.conditionsHtml
    : `${conditionChipsHtml(sheetConditionChips(ctx.conditions, { canEdit: ctx.canEdit }), { emptyText: ctx.canEdit ? '' : 'No conditions' })}${ctx.canEdit ? conditionPickerHtml({ title: ctx.conditionsTitle || 'Add a condition' }) : ''}`;
  const trackLine = [h.level ? `L${esc(h.level)}` : '', esc(h.class || ''), h.classTrack ? esc(h.classTrack) : '', esc(h.ancestry || '')].filter(Boolean).join(' · ');
  return `<div class="sp-status" data-sp-status>
    ${ctx.headerExtra || ''}
    <div class="sp-who"><div class="sp-pic${portrait ? '' : ' sp-pic--initials'}" style="${pic}" role="img" aria-label="${esc(h.name || ctx.fallbackName || 'Hero')}">${portrait ? '' : esc(initialsOf(h.name || ctx.fallbackName || 'Hero'))}</div>
      <div class="sp-name"><b>${esc(h.name || ctx.fallbackName || 'Hero')}</b><span>${trackLine}</span>${ctx.openSheetHtml || ''}</div>
      <div class="sp-counters">
        <div class="sp-ctr" title="Hero tokens (the party's)"><small>Tokens</small><span class="sp-tokens">${tokens.map((spent, i) => `<button type="button" class="sp-token${spent ? ' is-spent' : ' is-ready'}" data-character-hero-token="${i}" aria-label="${spent ? 'Reset' : 'Spend'} hero token ${i + 1}" title="${spent ? 'Reset hero token' : 'Spend hero token'}"></button>`).join('')}</span></div>
        <div class="sp-ctr" title="Surges"><small>Surges</small><span class="sp-step"><button type="button" class="sp-mini" data-character-surge-delta="-1" aria-label="Spend a surge">−</button><b data-character-counter="surges">${Math.max(0, num(h.surges))}</b><button type="button" class="sp-mini" data-character-surge-delta="1" aria-label="Add a surge">+</button></span></div>
        <div class="sp-ctr" title="Victories"><small>Victories</small><span class="sp-step"><button type="button" class="sp-mini" data-character-victory-delta="-1" aria-label="Remove a victory">−</button><b data-character-counter="victories">${num(h.victories)}</b><button type="button" class="sp-mini" data-character-add-victory aria-label="Add a victory">+</button></span></div>
      </div>
    </div>
    ${ctx.saveStatus || ''}
    <div class="sp-vitals">
      ${staminaBarHtml(vit)}
      <div class="sp-vbtns"><button type="button" class="sp-dmg" data-character-stamina-action="damage" title="Take damage (temporary Stamina goes first)">− Dmg</button><button type="button" class="sp-heal" data-character-stamina-action="heal" title="Heal (up to your maximum)">+ Heal</button><button type="button" class="sp-tmp" data-character-stamina-action="temp" title="Temporary Stamina: keeps the higher of what you have and what you gain">Temp</button></div>
    </div>
    <div class="sp-row2">
      <div class="sp-res"><span class="sp-lbl">${esc(resTitle)}</span><button type="button" data-character-resource-delta="-1" aria-label="Decrease ${esc(resTitle)}">−</button><b data-character-counter="resource">${num(res.value)}</b><button type="button" data-character-resource-delta="1" aria-label="Increase ${esc(resTitle)}">+</button>${autoDice ? `<button type="button" class="sp-roll" data-character-resource-roll title="${esc(resourceGainTip(autoDice, resTitle))}" aria-label="${esc(resourceGainTip(autoDice, resTitle))}">+${esc(autoDice)}</button>` : ''}</div>
      <div class="sp-rec"><span class="sp-lbl">Recoveries</span><span class="sp-pips">${Array.from({ length: recMax }, (_, i) => `<i class="${i < rec ? '' : 'used'}"></i>`).join('')}</span><b>${rec}/${num(vit.recoveriesMax)}</b><button type="button" data-character-recovery title="Spend one recovery: heal ${recVal} (⅓ of max Stamina ${max || '—'}, rounded down)">Spend recovery +${recVal}</button></div>
      <div class="sp-conds">${conds}</div>
    </div>
    <div class="sp-statboxes">${STATS.map(([k, l]) => `<div class="sp-sb"><b>${sign(num(s[k]))}</b><small>${l}</small></div>`).join('')}</div>
    <div class="sp-vline"><span>Speed <b>${esc(vit.speed ?? '—')}</b></span><span>Stability <b>${esc(ctx.stabilityText ?? vit.stability ?? '—')}</b></span><span>Disengage <b>${esc(vit.disengage ?? '—')}</b></span><span>Size <b>${esc(vit.size ?? '—')}</b></span><span>Save <b>${esc(vit.save || '—')}${vit.save && !/\+/.test(String(vit.save)) ? '+' : ''}</b></span></div>
  </div>`;
}

// ---------------------------------------------------------------- tabs
/** tabs: [[key, label, count]]; tools: extra HTML at the right (theme switch, edit toggle). */
export function tabsHtml(tabs, active, tools = '') {
  return `<nav class="sp-tabs" role="tablist">${tabs.map(([k, t, n]) => `<button type="button" role="tab" aria-selected="${k === active}" data-sheet-tab="${k}" class="${k === active ? 'on' : ''}">${esc(t)}${n !== '' && n !== undefined ? `<i>${n}</i>` : ''}</button>`).join('')}<span class="sp-tab-tools">${tools}</span></nav>`;
}

// ---------------------------------------------------------------- ability cards
export const TYPE = { mains: ['main', 'Main action'], maneuvers: ['maneuver', 'Maneuver'], triggers: ['trigger', 'Triggered action'], freeStrikes: ['free', 'Free strike'] };
export const AB_GROUPS = [['mains', 'Main actions'], ['maneuvers', 'Maneuvers'], ['triggers', 'Triggered'], ['freeStrikes', 'Free strikes']];
const ICON = {
  range: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L20 4M20 4h-7M20 4v7M4 20h7M4 20v-7"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/></svg>',
  trigger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
};

function tierRow(badge, cls, t) {
  if (!t) return '';
  const bits = [
    t.damage ? `<b>${esc(t.damage)}${t.damageType ? ' ' + esc(t.damageType) : ''}</b>${/damage/i.test(t.notes || '') ? '' : ' damage'}` : '',
    t.notes ? esc(t.notes) : '',
    t.attributeCheck?.enabled ? `<span class="sp-chk">${esc(t.attributeCheck.attribute)} &lt; ${esc(t.attributeCheck.threshold)}</span> ${esc(t.attributeCheck.effect)}` : '',
  ].filter(Boolean);
  const joined = bits.reduce((acc, b, i) => acc + (i ? (/^[+\-]/.test(b.replace(/<[^>]+>/g, '').trim()) ? ' ' : '; ') : '') + b, '');
  return `<div class="sp-tr"><span class="sp-tb ${cls}">${badge}</span><span>${joined || '—'}</span></div>`;
}

const editTools = (ctx) => (ctx.editing ? '<span class="sp-grip" title="Drag to move" aria-hidden="true">⋮⋮</span>' : '');
const editBtns = (ctx, what) => (ctx.editing
  ? `<button type="button" class="sp-ic" data-sheet-edit title="Edit this ${what}" aria-label="Edit">✎</button><button type="button" class="sp-ic" data-sheet-export title="Copy this ${what} as JSON" aria-label="Copy as JSON">⤓</button><button type="button" class="sp-ic" data-sheet-del title="Delete this ${what}" aria-label="Delete">🗑</button>`
  : '');

/** One ability as a game card. ctx: { editing, lockedBy } */
export function abilityCard(a, kind, index = 0, ctx = {}) {
  const [cls, label] = TYPE[kind] || ['main', a.actionLabel || ''];
  const tests = Array.isArray(a.tests) ? a.tests : [];
  const { flavour, effect, labelled } = abilityText(a.description);
  const desc = plain(a.description);
  // Effect text repeated in a test's "additional effect" is shown once.
  const extras = [];
  tests.forEach((test) => {
    for (const field of ['beforeEffect', 'additionalEffect']) {
      const text = test?.[field];
      if (!text || desc.includes(plain(text).slice(0, 40))) continue;
      const p = parts(text);
      extras.push(...(p.flavour ? [[field === 'beforeEffect' ? 'Before' : 'Effect', p.flavour]] : []), ...p.labelled);
    }
  });
  const seen = new Set();
  const allLabelled = labelled.concat(extras).filter(([k, v]) => { const key = `${k}:${plain(v)}`; if (seen.has(key)) return false; seen.add(key); return true; });
  // A main action with no cost is a signature ability (Draw Steel).
  const sig = !String(a.cost || '').trim() && kind === 'mains' ? 'Signature ability' : '';
  const auto = hasAbilityAutomation(a.automation);
  const cost = costLabel(a.cost);
  // Rules text (unlabelled effect, then labelled parts) in roman; clamped to about four lines when long.
  const fx = `${effect ? `<p class="sp-effect">${esc(effect)}</p>` : ''}${allLabelled.map(([k, v]) => `<p class="sp-lab"><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}`;
  const fxLong = (effect.length + allLabelled.reduce((n, [k, v]) => n + k.length + v.length + 2, 0)) > CLAMP_CHARS;
  return `<article class="sp-card sp-ab ${cls}${fxLong ? ' long' : ''}${ctx.lockedBy ? ' is-locked' : ''}" data-kind="${kind}" data-i="${index}" data-id="${esc(a.id || '')}"${ctx.editing ? ' draggable="true"' : ''}>
    <header>${editTools(ctx)}<h4>${esc(a.name || 'New ability')}</h4>${cost ? `<span class="sp-cost">${esc(cost)}</span>` : ''}${ctx.editing ? editBtns(ctx, 'ability') : `<button type="button" class="sp-use" data-sheet-use title="${auto ? 'Use it (posts the card to chat; it runs on the board from the ability bar)' : 'Use it: posts the card to chat'}">Use</button>`}</header>
    ${ctx.lockedBy ? `<div class="sp-lockline">🔒 ${esc(ctx.lockedBy)} is editing</div>` : ''}
    <div class="sp-body">
      ${sig ? `<div class="sp-sig">${sig}</div>` : ''}
      ${flavour ? `<p class="sp-flavour">${esc(flavour)}</p>` : ''}
      <div class="sp-kwline"><span>${(a.tags || []).map(esc).join(', ')}</span><span class="sp-atype">${esc(a.actionLabel || label)}</span></div>
      ${a.range || a.target ? `<div class="sp-rt">${a.range ? `<span title="Range">${ICON.range}${esc(a.range)}</span>` : ''}${a.target ? `<span title="Target">${ICON.target}<em>${esc(a.target)}</em></span>` : ''}</div>` : ''}
      ${a.trigger ? `<div class="sp-trig">${ICON.trigger}<span><b>Trigger:</b> ${esc(a.trigger)}</span></div>` : ''}
      ${tests.map((test) => (test?.tiers ? `<div class="sp-roll">${esc(test.label || 'Power Roll').replace(/^Power Roll/i, '<b>Power Roll</b>')}${test.rollMod !== '' && test.rollMod !== undefined && test.rollMod !== null && !/[+\-]\s*\w/.test(test.label || '') ? ` + ${esc(String(test.rollMod).replace(/^\+/, ''))}` : ''}</div>${tierRow('≤11', 't1', test.tiers.low)}${tierRow('12–16', 't2', test.tiers.mid)}${tierRow('17+', 't3', test.tiers.high)}` : '')).join('')}
      ${fx ? `<div class="sp-fx${fxLong ? ' sp-clamp' : ''}">${fx}</div>${fxLong ? '<button type="button" class="sp-more sp-more--inline" data-sheet-more aria-expanded="false">More</button>' : ''}` : ''}
      ${a.useWhen ? `<p class="sp-usewhen">Use when ${esc(words(a.useWhen))}</p>` : ''}
    </div></article>`;
}

/** The Abilities tab: sub-tabs All / Main actions / Maneuvers / Triggered / Free strikes (with counts). */
export function abilitiesHtml(sheet, ctx = {}) {
  const A = sheet?.actions || {};
  const abTab = ctx.abTab || 'all';
  const total = AB_GROUPS.reduce((n, [k]) => n + (A[k] || []).length, 0);
  const sub = `<div class="sp-subtabs" role="tablist">${[['all', 'All', total], ...AB_GROUPS.map(([k, l]) => [k, l, (A[k] || []).length])].map(([k, l, n]) => `<button type="button" data-sheet-ab-tab="${k}" class="${abTab === k ? 'on' : ''}" aria-selected="${abTab === k}">${esc(l)}<i>${n}</i></button>`).join('')}</div>`;
  const shown = AB_GROUPS.filter(([k]) => abTab === 'all' || abTab === k);
  return sub + shown.map(([k, label]) => `<section class="sp-sect" data-ab-group="${k}">${abTab === 'all' ? `<h3>${esc(label)}<span>${(A[k] || []).length}</span></h3>` : ''}<div class="sp-cards" data-list="${k}">${(A[k] || []).map((a, i) => abilityCard(a, k, i, { ...ctx, lockedBy: ctx.lockOf?.(`actions.${k}`) })).join('')}${ctx.editing ? `<button type="button" class="sp-add-card" data-sheet-add="${k}">+ Add ${esc(label.toLowerCase().replace(/s$/, '').replace('triggered', 'triggered action'))}</button>` : ''}${!(A[k] || []).length && !ctx.editing ? '<p class="sp-none">None.</p>' : ''}</div></section>`).join('');
}

/** Which abilities a sub-tab shows (for tests and the counts). */
export function abilitiesForTab(sheet, abTab = 'all') {
  const A = sheet?.actions || {};
  return AB_GROUPS.filter(([k]) => abTab === 'all' || abTab === k).flatMap(([k]) => (A[k] || []).map((a) => ({ kind: k, ability: a })));
}

// ---------------------------------------------------------------- features
export function featureCard(f, index = 0, ctx = {}) {
  const { flavour, labelled } = parts(f.text);
  const long = plain(f.text).length > 260;
  const tags = (f.tags || []);
  return `<article class="sp-card sp-ft${long ? ' long' : ''}${f.isWide ? ' wide' : ''}${ctx.lockedBy ? ' is-locked' : ''}" data-kind="features" data-i="${index}" data-id="${esc(f.id || '')}"${ctx.editing ? ' draggable="true"' : ''}>
    <header>${editTools(ctx)}<h4>${esc(f.title || 'Untitled feature')}</h4>${tags.length ? `<span class="sp-tags">${tags.map(esc).join(' · ')}</span>` : ''}${ctx.editing ? editBtns(ctx, 'feature') : (ctx.chat ? `<button type="button" class="sp-ic sp-chat" data-sheet-chat="feature:${esc(f.id || '')}" title="Post this feature to the chat" aria-label="Post ${esc(f.title || 'this feature')} to chat">${CHAT_ICON}</button>` : '')}</header>
    ${ctx.lockedBy ? `<div class="sp-lockline">🔒 ${esc(ctx.lockedBy)} is editing</div>` : ''}
    <div class="sp-body">${flavour ? `<p>${esc(flavour)}</p>` : ''}${labelled.map(([k, v]) => `<p class="sp-lab"><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}${!flavour && !labelled.length ? '<p class="sp-none">No text.</p>' : ''}
      ${f.useWhen && !/type about this/i.test(f.useWhen) ? `<p class="sp-usewhen">Use when ${esc(words(f.useWhen))}</p>` : ''}</div>
    ${long ? '<button type="button" class="sp-more" data-sheet-more aria-expanded="false">Show all</button>' : ''}</article>`;
}

export function featuresHtml(sheet, ctx = {}) {
  const features = sheet?.features || [];
  const lockedBy = ctx.lockOf?.('features');
  return `<div class="sp-cards" data-list="features">${features.map((f, i) => featureCard(f, i, { ...ctx, lockedBy })).join('') || (ctx.editing ? '' : '<p class="sp-none">No features.</p>')}${ctx.editing ? '<button type="button" class="sp-add-card" data-sheet-add="features">+ Add feature</button>' : ''}</div>`;
}

// ---------------------------------------------------------------- Skills & traits
const list = (arr) => (arr || []).map((x) => (typeof x === 'string' ? x : x?.title || '')).filter(Boolean);
const chips = (arr, cls = '') => (arr.length ? `<div class="sp-chips">${arr.map((x) => `<span class="sp-chip ${cls}">${esc(x)}</span>`).join('')}</div>` : '<p class="sp-none">None</p>');

/**
 * The weaknesses shown: the sheet's list (sidebar.lists.vulnerability) with an old sheet's leftover "weaknesses" key,
 * one chip per damage type. Indigo's sheet held both ["Corruption 5"] and the old ["Corruption"], and both showed:
 * the one with a value is kept, in the first one's place.
 */
export function weaknessList(lists = {}) {
  const all = list(lists.vulnerability).concat(list(lists.weaknesses), list(lists.vulnerabilities).filter(() => !lists.immunity));
  const byType = new Map();
  for (const raw of all) {
    const text = String(raw).trim().replace(/\s+/g, ' ');
    if (!text) continue;
    const [, name, value] = text.match(/^(.*?)(?:\s+(\d+))?$/);
    const key = name.replace(/\s+weakness$/i, '').trim().toLowerCase();
    const had = byType.get(key);
    if (!had || (!had.value && value)) byType.set(key, { text, value });
  }
  return [...byType.values()].map((w) => w.text);
}

/** A card. tools: { edit: section key, chat: chat kind, lockedBy } */
function traitCard(title, inner, cls = '', tools = {}, ctx = {}) {
  const editBtn = ctx.editing && tools.edit ? `<button type="button" class="sp-ic" data-sheet-edit-section="${tools.edit}" title="Edit ${esc(title)}" aria-label="Edit ${esc(title)}"${tools.lockedBy ? ' disabled' : ''}>✎</button>` : '';
  const chatBtn = !ctx.editing && ctx.chat && tools.chat ? `<button type="button" class="sp-ic sp-chat" data-sheet-chat="${tools.chat}" title="Post this to the chat" aria-label="Post ${esc(title.replace(/<[^>]+>/g, ''))} to chat">${CHAT_ICON}</button>` : '';
  return `<article class="sp-card sp-tr-card ${cls}${tools.lockedBy ? ' is-locked' : ''}"${tools.edit ? ` data-section="${tools.edit}"` : ''}><header><h4>${title}</h4>${chatBtn}${editBtn}</header>${tools.lockedBy ? `<div class="sp-lockline">🔒 ${esc(tools.lockedBy)} is editing</div>` : ''}<div class="sp-body">${inner}</div></article>`;
}

/** A skill's bonus as shown on its chip: "1" -> "+1", "+2"/"-1" as they are, other text as typed; '' for none. */
export function skillBonus(bonus) {
  const b = String(bonus ?? '').trim();
  if (!b || b === '0' || b === '+0') return '';
  return /^\d+$/.test(b) ? `+${b}` : b;
}

/** Skills by Draw Steel skill group: [[group, [[name, {bonus}]]]] in the book's order, "Other" last. */
export function groupSkills(skills) {
  const groups = {};
  Object.entries(normalizeSkillsState(skills)).forEach(([n, v]) => { (groups[getSkillGroup(n)] ||= []).push([n, v]); });
  return [...Object.keys(SKILL_GROUPS), 'Other'].filter((g) => groups[g]).map((g) => [g, groups[g].sort(([a], [b]) => a.localeCompare(b))]);
}

export function traitsHtml(sheet, ctx = {}) {
  const sk = sheet?.sidebar?.skills || {}, L = sheet?.sidebar?.lists || {}, h = sheet?.hero || {};
  const lockOf = ctx.lockOf || (() => '');
  const out = [];
  const grouped = groupSkills(sk);
  out.push(traitCard('Skills', grouped.map(([g, arr]) => `<div class="sp-sg"><span class="sp-sgl">${esc(g)}</span><div class="sp-chips">${arr.map(([n, v]) => `<span class="sp-chip skill">${esc(n)}${skillBonus(v.bonus) ? `<small title="Skill bonus ${esc(skillBonus(v.bonus))}">${esc(skillBonus(v.bonus))}</small>` : ''}</span>`).join('')}</div></div>`).join('') || '<p class="sp-none">No skills.</p>', 'wide sp-skills', { edit: 'skills', chat: 'skills', lockedBy: lockOf('sidebar.skills') }, ctx));
  out.push(traitCard('Languages', chips(list(L.languages)), '', { edit: 'lists', chat: 'languages', lockedBy: lockOf('sidebar.lists') }, ctx));
  out.push(traitCard('Weaknesses &amp; vulnerabilities', chips(weaknessList(L), 'bad'), '',{ edit: 'lists', chat: 'vuln', lockedBy: lockOf('sidebar.lists') }, ctx));
  out.push(traitCard('Immunities', chips(list(L.immunity), 'good'), '', { edit: 'lists', chat: 'vuln', lockedBy: lockOf('sidebar.lists') }, ctx));
  if ((h.bonuses || []).length || ctx.editing) out.push(traitCard('Bonuses', (h.bonuses || []).map((b) => `<p class="sp-lab"><b>${esc(words(b.source) || 'Bonus')}:</b> ${esc(words(b.bonus))}</p>`).join('') || '<p class="sp-none">None</p>', '', { edit: 'bonuses', lockedBy: lockOf('hero.bonuses') }, ctx));
  (L.common || []).forEach((c) => {
    const { flavour, labelled } = parts(c.details);
    out.push(traitCard(esc(c.title || 'Common thing'), (flavour ? `<p>${esc(flavour)}</p>` : '') + labelled.map(([k, v]) => `<p class="sp-lab"><b>${esc(k)}:</b> ${esc(v)}</p>`).join('') || '<p class="sp-none">No details.</p>', '', { edit: 'common', chat: `common:${c.id || ''}`, lockedBy: lockOf('sidebar.lists.common') }, ctx));
  });
  if (ctx.editing && !(L.common || []).length) out.push(traitCard('Common lists', '<p class="sp-none">Triggered-action reminders and other common lists.</p>', '', { edit: 'common', lockedBy: lockOf('sidebar.lists.common') }, ctx));
  const kit = effectiveKit(sheet);
  const kitRows = KIT_FIELD_LABELS.filter(([k]) => String(kit.values[k] ?? '').trim()).map(([k, l]) => `<span class="sp-kv${k in kit.fromCard ? ' from-card' : ''}"${k in kit.fromCard ? ` title="From the kit card: ${esc(kit.card?.title || '')}"` : ''}><small>${esc(l)}</small><b>${esc(kit.values[k])}</b></span>`).join('');
  if (kitRows || ctx.editing) out.push(traitCard(`Kit${kit.card ? ` <span class="sp-from">from ${esc(kit.card.title || 'the kit card')}</span>` : ''}`, kitRows ? `<div class="sp-kit">${kitRows}</div>` : '<p class="sp-none">No kit.</p>', '', { edit: 'kit', lockedBy: lockOf('hero.kit') }, ctx));
  if ((h.hirelings || []).length || ctx.editing) {
    out.push(traitCard('Hirelings', (h.hirelings || []).map((x) => `<div class="sp-hire">${x.image ? `<img src="${esc(x.image)}" alt="${esc(x.name || 'Hireling')}" data-sheet-lightbox>` : ''}<p class="sp-lab"><b>${esc(words(x.name) || 'Unnamed hireling')}</b>${Number(x.bonus) ? ` <span class="sp-chip">+${esc(x.bonus)}</span>` : ''}<br>${esc((Array.isArray(x.skills) ? x.skills : []).join(', ') || words(x.skills || ''))}${x.notes ? `<br><span class="sp-dim">${esc(words(x.notes))}</span>` : ''}</p></div>`).join('') || '<p class="sp-none">None</p>', '', { edit: 'hirelings', lockedBy: lockOf('hero.hirelings') }, ctx));
  }
  const rtext = sheet?.sidebar?.resource?.text;
  if (rtext || ctx.editing) {
    const p = parts(rtext);
    out.push(traitCard(esc(sheet?.sidebar?.resource?.title || h.resource?.title || 'Heroic resource'), (p.flavour ? `<p>${esc(p.flavour)}</p>` : '') + p.labelled.map(([k, v]) => `<p class="sp-lab"><b>${esc(k)}:</b> ${esc(v)}</p>`).join('') || '<p class="sp-none">No rules text.</p>', 'resource', { edit: 'resource', lockedBy: lockOf('sidebar.resource') }, ctx));
  }
  return `<div class="sp-cards sp-traits">${out.join('')}</div>`;
}

// ---------------------------------------------------------------- Record
export const RECORD_FIELDS = [['player_name', 'Player'], ['college', 'College'], ['minor', 'Minor'], ['extra_curricular', 'Extra-curricular'], ['boon', 'Boon'], ['other', 'Notes']];

/**
 * Background and progress from the sheet; the campaign record (player, college, minor, extra-curricular, boon,
 * notes, portrait) from the campaign API. info: that record or null (not available: "—"). ctx: { canEditInfo,
 * canEdit, lockOf, editing, panel }
 */
export function recordHtml(sheet, info, ctx = {}) {
  const h = sheet?.hero || {}, c = h.culture || {}, k = h.career || {};
  const lockOf = ctx.lockOf || (() => '');
  const line = (label, value) => `<p class="sp-lab"><b>${esc(label)}:</b> ${esc(words(value)) || '<span class="sp-dim">—</span>'}</p>`;
  const bg = [line('Ancestry', h.ancestry), line('Culture', [c.culture, c.environment, c.organization, c.upbringing].filter(Boolean).join(', ')),
    line('Career', [k.career, k.incitingIncident ? `(${k.incitingIncident})` : ''].filter(Boolean).join(' ')), line('Complication', h.complication)].join('');
  const progress = `<div class="sp-kit"><span class="sp-kv"><small>Wealth</small><b>${esc(h.wealth || '—')}</b></span><span class="sp-kv"><small>Renown</small><b>${esc(h.renown || '—')}</b></span><span class="sp-kv"><small>XP</small><b>${esc(h.xp || '0')}</b></span><span class="sp-kv"><small>Level</small><b>${esc(h.level || 1)}</b></span></div>${ctx.canEdit && !ctx.panel ? '<button type="button" class="sp-btn" data-sheet-respite title="Victories become XP; Recoveries and Stamina return to full">Respite</button>' : ''}`;
  const field = ([key, label]) => {
    const value = info ? String(info[key] ?? '') : null;
    const locked = lockOf(`info.${key}`);
    if (ctx.canEditInfo && info) {
      const input = key === 'other'
        ? `<textarea data-sheet-info="${key}" rows="4"${locked ? ' disabled' : ''} placeholder="${locked ? `${esc(locked)} is editing` : ''}">${esc(value)}</textarea>`
        : `<input type="text" data-sheet-info="${key}" value="${esc(value)}"${locked ? ' disabled' : ''} placeholder="${locked ? `${esc(locked)} is editing` : ''}">`;
      return `<label class="sp-field${key === 'other' ? ' wide' : ''}"><small>${esc(label)}${locked ? ` · 🔒 ${esc(locked)}` : ''}</small>${input}</label>`;
    }
    return key === 'other'
      ? `<div class="sp-field wide"><small>${esc(label)}</small><p class="sp-notes">${value ? esc(value).replace(/\n/g, '<br>') : '<span class="sp-dim">—</span>'}</p></div>`
      : `<div class="sp-field"><small>${esc(label)}</small><b>${value ? esc(value) : '<span class="sp-dim">—</span>'}</b></div>`;
  };
  const portrait = info?.portrait ? `<img class="sp-portrait" src="${esc(info.portrait)}" alt="Portrait">` : '<div class="sp-portrait sp-portrait--none">No portrait</div>';
  const campaign = `<div class="sp-record">${portrait}<div class="sp-fields">${RECORD_FIELDS.map(field).join('')}</div></div>${ctx.canEditPortrait && info ? '<label class="sp-btn sp-file">Upload portrait<input type="file" accept="image/*" data-sheet-portrait hidden></label>' : ''}${info ? '' : '<p class="sp-none">The campaign record is not available right now.</p>'}`;
  return `<div class="sp-cards">
    ${traitCard('Background', bg, '', { edit: 'background', chat: 'background', lockedBy: lockOf('hero.culture') || lockOf('hero.career') }, ctx)}
    ${traitCard('Progress', progress, '', { edit: 'core', lockedBy: lockOf('hero.xp') }, ctx)}
    ${traitCard('Campaign record', campaign, 'wide', {}, ctx)}
  </div>`;
}

export { ACTION_TYPES };
