// The sheet's edit forms: a side panel per card or section, covering everything the classic sheet's Edit mode could
// edit (hero fields, vitals maxima, stats, the heroic resource with its automation JSON, skills, the lists, bonuses,
// hirelings, the kit, background, features and abilities with their tests, tiers and automation), plus Import JSON.
//
// Each form works on a copy (a draft) and hands it back with onSave(draft); the page applies it and saves through
// handler.php (save-fields). onSave answers true when the save went in; the form stays open (with the reason) when not.

import {
  ATTRIBUTES, TEST_TIERS, ACTION_LABELS, ALL_SKILLS, SKILL_GROUPS, KIT_FIELD_LABELS, MAX_HIRELING_SKILLS, MAX_HIRELING_BONUS,
  deepClone, createId, defaultTest, normalizeTest, normalizeAutomationBlock, hasAbilityAutomation, effectiveKit,
  sanitizeRichText, normalizeRichText, parseImport, IMPORT_GROUP_LABELS, getSkillGroup,
} from './sheet-model.js';
import { recoveryValueOf } from './stamina-math.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- field markup
export const fText = (key, label, value, extra = '') => `<label class="sp-f ${extra}"><span>${esc(label)}</span><input type="text" data-f="${key}" value="${esc(value)}"></label>`;
export const fNum = (key, label, value, extra = '') => `<label class="sp-f ${extra}"><span>${esc(label)}</span><input type="number" data-f="${key}" data-num value="${esc(value)}"></label>`;
export const fArea = (key, label, value, extra = 'wide', cls = '') => `<label class="sp-f ${extra}"><span>${esc(label)}</span><textarea data-f="${key}" rows="3" class="${cls}">${esc(value)}</textarea></label>`;
export const fCheck = (key, label, checked, title = '') => `<label class="sp-f check" title="${esc(title)}"><input type="checkbox" data-f="${key}" data-bool${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
export const fSelect = (key, label, value, options, extra = '') => `<label class="sp-f ${extra}"><span>${esc(label)}</span><select data-f="${key}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
export const fRich = (key, label, value, doc) => `<div class="sp-f wide sp-rich"><span>${esc(label)}</span><div class="sp-rich-tools"><button type="button" data-rich="bold" title="Bold"><b>B</b></button><button type="button" data-rich="underline" title="Underline"><u>U</u></button></div><div contenteditable="true" data-f="${key}" data-richtext>${sanitizeRichText(normalizeRichText(value || ''), doc)}</div></div>`;

/** Reads a form's fields into an object keyed by data-f (dots make nested keys). */
export function readFields(root, doc = root.ownerDocument) {
  const out = {};
  root.querySelectorAll('[data-f]').forEach((el) => {
    if (el.closest('[data-row]') && !root.matches('[data-row]')) return;   // rows are read by their own list
    const key = el.dataset.f;
    let value;
    if (el.hasAttribute('data-bool')) value = Boolean(el.checked);
    else if (el.hasAttribute('data-richtext')) value = sanitizeRichText(normalizeRichText(el.innerHTML), doc);
    else if (el.hasAttribute('data-num')) value = el.value === '' ? '' : Number(el.value);
    else value = el.value;
    const steps = key.split('.');
    let at = out;
    steps.slice(0, -1).forEach((step) => { at = at[step] ||= {}; });
    at[steps[steps.length - 1]] = value;
  });
  return out;
}

const tags = (value) => String(value || '').split(',').map((t) => t.trim()).filter(Boolean);

// ---------------------------------------------------------------- the panel
/**
 * Opens a side panel. build(body) fills it; save() answers the draft (or throws an Error with a message for the
 * reader). onSave(result) answers true when stored. Answers {el, close}.
 */
export function openPanel({ title, html = '', build = null, save = null, onSave = null, onClose = null, onActivity = null, dark = false, center = false, saveLabel = 'Save', footerExtra = '', doc = document }) {
  const el = doc.createElement('div');
  el.className = `sp-modal${center ? ' sp-modal--center' : ''}${dark ? ' sp-dark' : ''}`;
  el.innerHTML = `<div class="sp-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h4>${esc(title)}</h4><button type="button" data-x aria-label="Close">×</button></header>
    <div class="sp-panel-body">${html}</div><p class="sp-err" data-err hidden style="padding:0 12px"></p>
    <footer>${footerExtra}<button type="button" data-x>Cancel</button>${save ? `<button type="button" class="primary" data-go>${esc(saveLabel)}</button>` : ''}</footer></div>`;
  doc.body.append(el);
  const body = el.querySelector('.sp-panel-body');
  const err = el.querySelector('[data-err]');
  let closed = false;
  const close = () => { if (closed) return; closed = true; el.remove(); onClose?.(); };
  el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', close));
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  ['input', 'pointerdown', 'keydown'].forEach((type) => el.addEventListener(type, () => onActivity?.(), { passive: true }));
  el.addEventListener('click', (e) => {
    const rich = e.target.closest('[data-rich]');
    if (!rich) return;
    e.preventDefault();
    const editor = rich.closest('.sp-rich')?.querySelector('[contenteditable]');
    editor?.focus();
    try { doc.execCommand(rich.dataset.rich, false, null); } catch (_) { /* old browsers */ }
  });
  build?.(body, el);
  el.querySelector('[data-go]')?.addEventListener('click', async () => {
    err.hidden = true;
    let result;
    try { result = save(body, el); } catch (error) { err.hidden = false; err.textContent = error.message; return; }
    const button = el.querySelector('[data-go]');
    button.disabled = true;
    try {
      const ok = onSave ? await onSave(result) : true;
      if (ok === false || (ok && ok.ok === false)) { err.hidden = false; err.textContent = (ok && ok.error) || 'Not saved. Try again.'; return; }
      close();
    } finally { button.disabled = false; }
  });
  (body.querySelector('input, textarea, select, [contenteditable]'))?.focus?.();
  return { el, close, body };
}

// ---------------------------------------------------------------- automation section (abilities and features)
function automationSection(automation) {
  const json = hasAbilityAutomation(automation) ? JSON.stringify(automation, null, 2) : '';
  return `<fieldset class="sp-fs"><legend>Automation</legend>
    <p class="sp-hint" data-auto-status>${hasAbilityAutomation(automation) ? 'Automated.' : 'Not automated.'}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="sp-fbtn" data-auto-paste>Paste / build automation…</button><button type="button" class="sp-fbtn" data-auto-inspect>Inspect</button><button type="button" class="sp-fbtn" data-auto-clear>Clear</button></div>
    <label class="sp-f wide"><span>Automation JSON (advanced)</span><textarea class="code" data-auto-json rows="6" spellcheck="false" placeholder="{ &quot;schema&quot;: &quot;ability-automation/v2&quot;, &quot;cards&quot;: [...] }">${esc(json)}</textarea></label></fieldset>`;
}

function readAutomation(body) {
  const raw = body.querySelector('[data-auto-json]')?.value.trim() || '';
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`Automation JSON is not valid: ${error.message}`); }
  return normalizeAutomationBlock(parsed);
}

function wireAutomation(body, { id, type, draft, hero, onPasted }) {
  const area = body.querySelector('[data-auto-json]');
  const status = body.querySelector('[data-auto-status]');
  const set = (automation) => {
    area.value = hasAbilityAutomation(automation) ? JSON.stringify(automation, null, 2) : '';
    status.textContent = hasAbilityAutomation(automation) ? 'Automated.' : 'Not automated.';
  };
  body.querySelector('[data-auto-paste]')?.addEventListener('click', () => {
    const builder = window.AbilityAutomation;
    let current = null;
    try { current = area.value.trim() ? JSON.parse(area.value) : null; } catch (_) { current = draft.automation; }
    if (!builder || typeof builder.open !== 'function') { status.textContent = 'The automation builder is not loaded on this page; edit the JSON below.'; return; }
    builder.open(id, type, current, async (automation) => {
      const normalized = normalizeAutomationBlock(automation);
      set(normalized);
      // As on the classic sheet, a pasted automation is saved at once (the paste box shows whether it was).
      return onPasted ? await onPasted(normalized) : true;
    });
  });
  body.querySelector('[data-auto-inspect]')?.addEventListener('click', () => {
    const inspector = window.AbilityAutomationInspector;
    let automation = null;
    try { automation = area.value.trim() ? JSON.parse(area.value) : null; } catch (_) { status.textContent = 'The JSON below is not valid.'; return; }
    if (!inspector || typeof inspector.open !== 'function') { status.textContent = 'The inspector is not loaded on this page.'; return; }
    inspector.open({ action: { ...draft, automation, name: draft.name || draft.title || 'Ability', description: draft.description || draft.text || '' }, hero });
  });
  body.querySelector('[data-auto-clear]')?.addEventListener('click', () => set(null));
}

// ---------------------------------------------------------------- ability
function tierHtml(prefix, tier, label) {
  const a = tier.attributeCheck || {};
  return `<div class="sp-tier"><b>${esc(label)}</b><div class="sp-grid">${fText(`${prefix}.damage`, 'Damage', tier.damage)}${fText(`${prefix}.damageType`, 'Damage type', tier.damageType)}${fText(`${prefix}.notes`, 'Other info', tier.notes, 'wide')}
    ${fCheck(`${prefix}.attributeCheck.enabled`, 'Attribute check', a.enabled)}${fSelect(`${prefix}.attributeCheck.attribute`, 'Attribute', a.attribute, [['', '—'], ...ATTRIBUTES.map((x) => [x, x])])}${fText(`${prefix}.attributeCheck.threshold`, 'Below (threshold)', a.threshold)}${fText(`${prefix}.attributeCheck.effect`, 'Effect', a.effect)}</div></div>`;
}

function testHtml(test, index) {
  return `<div class="sp-row" data-row="test" data-test-id="${esc(test.id)}"><button type="button" class="sp-fbtn sp-row-x" data-remove-row title="Remove this power roll">×</button>
    <div class="sp-grid">${fText('label', 'Label', test.label || 'Power Roll')}${fText('rollMod', 'Roll modifier (2d10 + …)', test.rollMod)}</div>
    ${fArea('beforeEffect', 'Effect before the roll', test.beforeEffect)}
    <div class="sp-tiers">${TEST_TIERS.map(({ key, label }) => tierHtml(`tiers.${key}`, test.tiers?.[key] || {}, label)).join('')}</div>
    ${fArea('additionalEffect', 'Effect after the roll', test.additionalEffect)}</div>`;
}

function readTests(body) {
  return [...body.querySelectorAll('[data-row="test"]')].map((row) => {
    const f = readFields(row);
    return normalizeTest({ ...f, id: row.dataset.testId || createId('test') });
  });
}

/** kind: mains|maneuvers|triggers|freeStrikes. onSave({ability, kind}) */
export function openAbilityEditor({ ability, kind, isNew = false, hero = null, onSave, onAutomationSaved, onActivity, onClose, dark, doc = document }) {
  const draft = deepClone(ability);
  draft.tests = (draft.tests || []).map(normalizeTest);
  return openPanel({
    title: isNew ? 'New ability' : `Edit ${draft.name || 'ability'}`, dark, doc, onActivity, onClose,
    html: `<fieldset class="sp-fs"><legend>Card</legend><div class="sp-grid">
        ${fText('name', 'Name', draft.name, 'wide')}${fSelect('kind', 'Group', kind, Object.entries({ mains: 'Main actions', maneuvers: 'Maneuvers', triggers: 'Triggered', freeStrikes: 'Free strikes' }))}
        <label class="sp-f"><span>Action type</span><input type="text" data-f="actionLabel" value="${esc(draft.actionLabel)}" list="sp-action-labels"></label>
        ${fText('cost', 'Cost (e.g. 3 Clarity)', draft.cost)}${fText('tags', 'Keywords (comma separated)', (draft.tags || []).join(', '), 'wide')}
        ${fText('range', 'Range / distance', draft.range)}${fText('target', 'Target', draft.target)}
        ${fText('trigger', 'Trigger (triggered actions)', draft.trigger || '', 'wide')}${fText('useWhen', 'Use when…', draft.useWhen, 'wide')}
      </div><datalist id="sp-action-labels">${Object.values(ACTION_LABELS).concat(['No Action', 'Free Triggered Action', 'Free Maneuver']).map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
      ${fRich('description', 'Text (flavour, Effect:, Strained:, Spend N: …)', draft.description, doc)}</fieldset>
      <fieldset class="sp-fs"><legend>Power rolls</legend><div class="sp-rowlist" data-tests>${draft.tests.map(testHtml).join('')}</div><button type="button" class="sp-fbtn" data-add-test>+ Add power roll</button></fieldset>
      ${automationSection(draft.automation)}`,
    build(body) {
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-test]')) { body.querySelector('[data-tests]').insertAdjacentHTML('beforeend', testHtml(defaultTest())); }
        const x = e.target.closest('[data-remove-row]');
        if (x && x.closest('[data-row="test"]')) x.closest('[data-row]').remove();
      });
      wireAutomation(body, { id: draft.id, type: kind, draft, hero, onPasted: onAutomationSaved ? (automation) => onAutomationSaved(draft.id, kind, automation) : null });
    },
    save(body) {
      const f = readFields(body);
      if (!String(f.name || '').trim()) throw new Error('An ability needs a name.');
      const next = {
        ...draft, name: f.name.trim(), actionLabel: f.actionLabel || ACTION_LABELS[f.kind] || '', cost: f.cost, tags: tags(f.tags), range: f.range, target: f.target,
        useWhen: f.useWhen, description: f.description, tests: readTests(body), automation: readAutomation(body),
      };
      if (f.kind === 'triggers' || String(f.trigger || '').trim()) next.trigger = f.trigger; else delete next.trigger;
      return { ability: next, kind: f.kind };
    },
    onSave,
  });
}

// ---------------------------------------------------------------- feature
export function openFeatureEditor({ feature, isNew = false, hero = null, onSave, onAutomationSaved, onActivity, onClose, dark, doc = document }) {
  const draft = deepClone(feature);
  return openPanel({
    title: isNew ? 'New feature' : `Edit ${draft.title || 'feature'}`, dark, doc, onActivity, onClose,
    html: `<fieldset class="sp-fs"><legend>Feature</legend><div class="sp-grid">${fText('title', 'Title', draft.title, 'wide')}${fText('tags', 'Tags (comma separated)', (draft.tags || []).join(', '), 'wide')}${fText('useWhen', 'Use when…', draft.useWhen, 'wide')}${fCheck('isWide', 'Double width card', draft.isWide)}</div>
      ${fRich('text', 'Text', draft.text, doc)}</fieldset>${automationSection(draft.automation)}`,
    build(body) { wireAutomation(body, { id: draft.id, type: 'feature', draft: { ...draft, name: draft.title }, hero, onPasted: onAutomationSaved ? (automation) => onAutomationSaved(draft.id, 'features', automation) : null }); },
    save(body) {
      const f = readFields(body);
      if (!String(f.title || '').trim()) throw new Error('A feature needs a title.');
      return { ...draft, title: f.title.trim(), tags: tags(f.tags), useWhen: f.useWhen, isWide: f.isWide, text: f.text, automation: readAutomation(body) };
    },
    onSave,
  });
}

// ---------------------------------------------------------------- hero & vitals
/** Hero, characteristics, vitals and counters. onSave(patch) where patch is {hero: {...}} to merge. */
export function openCoreEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  const h = sheet.hero, v = h.vitals || {}, s = h.stats || {};
  const third = recoveryValueOf(v);
  return openPanel({
    title: 'Hero & vitals', dark, doc, onActivity, onClose,
    html: `<fieldset class="sp-fs"><legend>Hero</legend><div class="sp-grid">${fText('name', 'Name', h.name)}${fNum('level', 'Level', h.level)}${fText('class', 'Class', h.class)}${fText('classTrack', 'Class track / subclass', h.classTrack)}</div></fieldset>
      <fieldset class="sp-fs"><legend>Characteristics</legend><div class="sp-grid">${['might', 'agility', 'reason', 'intuition', 'presence'].map((k) => fNum(`stats.${k}`, k[0].toUpperCase() + k.slice(1), s[k] ?? 0)).join('')}</div></fieldset>
      <fieldset class="sp-fs"><legend>Vitals</legend><div class="sp-grid">${fNum('vitals.staminaMax', 'Stamina maximum', v.staminaMax)}${fNum('vitals.currentStamina', 'Current Stamina', v.currentStamina)}${fNum('vitals.tempStamina', 'Temporary Stamina', v.tempStamina ?? 0)}
        ${fNum('vitals.recoveriesMax', 'Recoveries maximum', v.recoveriesMax)}${fNum('vitals.currentRecoveries', 'Current recoveries', v.currentRecoveries)}<label class="sp-f"><span>Recovery value (a third of max Stamina)</span><input type="text" value="${third || '—'}" readonly disabled aria-readonly="true"></label>
        ${fText('vitals.size', 'Size', v.size)}${fText('vitals.speed', 'Speed', v.speed)}${fText('vitals.stability', 'Stability', v.stability)}${fText('vitals.disengage', 'Disengage', v.disengage)}${fText('vitals.save', 'Save', v.save)}</div>
        <p class="sp-hint">A recovery heals a third of the Stamina maximum, rounded down (${third || '—'}): it follows the maximum.</p></fieldset>
      <fieldset class="sp-fs"><legend>Counters &amp; progress</legend><div class="sp-grid">${fNum('victories', 'Victories', h.victories)}${fNum('surges', 'Surges', h.surges)}${fText('wealth', 'Wealth', h.wealth)}${fText('renown', 'Renown', h.renown)}${fText('xp', 'XP', h.xp)}</div></fieldset>`,
    save(body) {
      const f = readFields(body);
      if (f.level !== '' && (!Number.isFinite(f.level) || f.level < 1)) throw new Error('Level must be 1 or more.');
      return { hero: { ...f, stats: { ...f.stats }, vitals: { ...f.vitals, tempStamina: Math.max(0, Number(f.vitals.tempStamina) || 0) } } };
    },
    onSave,
  });
}

export function openBackgroundEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  const h = sheet.hero, c = h.culture || {}, k = h.career || {};
  return openPanel({
    title: 'Background', dark, doc, onActivity, onClose,
    html: `<fieldset class="sp-fs"><legend>Background</legend><div class="sp-grid">${fText('ancestry', 'Ancestry', h.ancestry)}${fText('complication', 'Complication', h.complication, 'wide')}</div></fieldset>
      <fieldset class="sp-fs"><legend>Culture</legend><div class="sp-grid">${fText('culture.culture', 'Culture', c.culture)}${fText('culture.environment', 'Environment', c.environment)}${fText('culture.organization', 'Organization', c.organization)}${fText('culture.upbringing', 'Upbringing', c.upbringing)}</div></fieldset>
      <fieldset class="sp-fs"><legend>Career</legend><div class="sp-grid">${fText('career.career', 'Career', k.career)}${fText('career.incitingIncident', 'Inciting incident', k.incitingIncident, 'wide')}</div></fieldset>`,
    save(body) { return { hero: readFields(body) }; },
    onSave,
  });
}

export function openKitEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  const kit = effectiveKit(sheet), own = sheet.hero.kit || {};
  return openPanel({
    title: 'Kit', dark, doc, onActivity, onClose,
    html: `${kit.card ? `<p class="sp-hint">Fields marked "from the card" come from the kit's feature card (${esc(kit.card.title || '')}); change the card to change them.</p>` : ''}
      <div class="sp-grid">${KIT_FIELD_LABELS.map(([key, label]) => (key in kit.fromCard
        ? `<label class="sp-f"><span>${esc(label)} (from the card)</span><input type="text" value="${esc(kit.fromCard[key])}" disabled></label>`
        : fText(`kit.${key}`, label, own[key] ?? ''))).join('')}</div>`,
    save(body) { return { hero: { kit: { ...own, ...(readFields(body).kit || {}) } } }; },
    onSave,
  });
}

// ---------------------------------------------------------------- heroic resource
export function openResourceEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  const r = sheet.hero.resource || {}, sr = sheet.sidebar?.resource || {};
  const auto = r.automation && typeof r.automation === 'object' ? JSON.stringify(r.automation, null, 2) : '';
  return openPanel({
    title: 'Heroic resource', dark, doc, onActivity, onClose,
    html: `<fieldset class="sp-fs"><legend>Resource</legend><div class="sp-grid">${fText('title', 'Name (e.g. Clarity)', r.title || sr.title || 'Resource')}${fNum('value', 'Current value', r.value ?? 0)}${fText('autoDice', 'Start-of-turn gain (d3, +2…)', r.autoDice)}
      ${fCheck('allowNegative', 'Allow negative (Talent)', r.allowNegative, "For Talent's Clarity: spends go below 0 down to -(1 + Reason).")}${fCheck('discountOnPowerRollEdge', 'Edge costs 1 less (Shadow)', r.discountOnPowerRollEdge, "For Shadow's Insight: refund 1 after a heroic ability resolves with an edge.")}</div>
      ${fRich('text', 'Rules text', sr.text, doc)}</fieldset>
      <fieldset class="sp-fs"><legend>Resource automation</legend><p class="sp-hint">heroic-resource/v1 JSON with a "rules" list. Empty clears it.</p>
      <label class="sp-f wide"><span>Automation JSON</span><textarea class="code" data-res-auto rows="10" spellcheck="false" placeholder='{ "schema": "heroic-resource/v1", "rules": [] }'>${esc(auto)}</textarea></label></fieldset>`,
    save(body) {
      const f = readFields(body);
      const raw = body.querySelector('[data-res-auto]').value.trim();
      let automation = null;
      if (raw) {
        try { automation = JSON.parse(raw); } catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
        automation = Array.isArray(automation?.rules) && automation.rules.length ? automation : null;
      }
      const title = String(f.title || '').trim() || 'Resource';
      return {
        hero: { resource: { ...r, title, value: f.value === '' ? 0 : f.value, autoDice: f.autoDice, allowNegative: f.allowNegative, discountOnPowerRollEdge: f.discountOnPowerRollEdge, automation } },
        sidebar: { resource: { ...sr, title, text: f.text } },
      };
    },
    onSave,
  });
}

// ---------------------------------------------------------------- skills
export function openSkillsEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  const skills = deepClone(sheet.sidebar?.skills || {});
  const row = (name, data) => `<div class="sp-row" data-row="skill" data-skill="${esc(name)}" style="grid-template-columns:1fr 120px auto;align-items:center"><b>${esc(name)} <small class="sp-hint">${esc(getSkillGroup(name))}</small></b>${fText('bonus', 'Bonus', data?.bonus ?? '')}<button type="button" class="sp-fbtn" data-remove-row>Remove</button></div>`;
  const picker = () => `<div class="sp-skillpick">${Object.entries(SKILL_GROUPS).map(([group, list]) => `<div><b>${esc(group)}</b>${list.filter((s) => !skills[s]).map((s) => `<button type="button" data-pick="${esc(s)}">+ ${esc(s)}</button>`).join('') || '<span class="sp-hint">All taken.</span>'}</div>`).join('')}</div>`;
  return openPanel({
    title: 'Skills', dark, doc, onActivity, onClose,
    html: `<div class="sp-rowlist" data-skills>${Object.entries(skills).map(([n, d]) => row(n, d)).join('')}</div><fieldset class="sp-fs"><legend>Add a skill</legend><div data-picker>${picker()}</div></fieldset>`,
    build(body) {
      body.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-pick]');
        if (pick) { skills[pick.dataset.pick] = { level: 'Trained', bonus: '' }; body.querySelector('[data-skills]').insertAdjacentHTML('beforeend', row(pick.dataset.pick, {})); body.querySelector('[data-picker]').innerHTML = picker(); }
        const x = e.target.closest('[data-remove-row]');
        if (x) { delete skills[x.closest('[data-row]').dataset.skill]; x.closest('[data-row]').remove(); body.querySelector('[data-picker]').innerHTML = picker(); }
      });
    },
    save(body) {
      const out = {};
      body.querySelectorAll('[data-row="skill"]').forEach((r) => { out[r.dataset.skill] = { level: 'Trained', bonus: r.querySelector('[data-f="bonus"]').value }; });
      return { sidebar: { skills: out } };
    },
    onSave,
  });
}

// ---------------------------------------------------------------- languages, vulnerabilities, immunities
export function openListsEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  const L = sheet.sidebar?.lists || {};
  const area = (key, label) => `<label class="sp-f wide"><span>${esc(label)} (one per line)</span><textarea data-list="${key}" rows="4">${esc((L[key] || []).join('\n'))}</textarea></label>`;
  return openPanel({
    title: 'Languages, weaknesses & immunities', dark, doc, onActivity, onClose,
    html: `${area('languages', 'Languages')}${area('vulnerability', 'Weaknesses & vulnerabilities')}${area('immunity', 'Immunities')}`,
    save(body) {
      const lists = {};
      body.querySelectorAll('[data-list]').forEach((t) => { lists[t.dataset.list] = t.value.split('\n').map((x) => x.trim()).filter(Boolean); });
      return { sidebar: { lists } };
    },
    onSave,
  });
}

// ---------------------------------------------------------------- list editors (common things, bonuses, hirelings)
function rowListPanel({ title, items, rowHtml, blank, readRow, wrap, onSave, onActivity, onClose, dark, doc, build: extraBuild }) {
  return openPanel({
    title, dark, doc, onActivity, onClose,
    html: `<div class="sp-rowlist" data-rows>${items.map(rowHtml).join('')}</div><button type="button" class="sp-fbtn" data-add-row>+ Add</button>`,
    build(body, el) {
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-row]')) body.querySelector('[data-rows]').insertAdjacentHTML('beforeend', rowHtml(blank()));
        const x = e.target.closest('[data-remove-row]');
        if (x) x.closest('[data-row]').remove();
        const up = e.target.closest('[data-move-row]');
        if (up) {
          const r = up.closest('[data-row]');
          if (up.dataset.moveRow === 'up' && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling);
          if (up.dataset.moveRow === 'down' && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r);
        }
      });
      extraBuild?.(body, el);
    },
    save(body) { return wrap([...body.querySelectorAll('[data-rows] > [data-row]')].map(readRow)); },
    onSave,
  });
}

const rowTools = '<div style="display:flex;gap:4px;justify-content:flex-end"><button type="button" class="sp-fbtn" data-move-row="up" title="Move up">▲</button><button type="button" class="sp-fbtn" data-move-row="down" title="Move down">▼</button><button type="button" class="sp-fbtn" data-remove-row title="Remove">×</button></div>';

export function openCommonEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  return rowListPanel({
    title: 'Common lists', items: sheet.sidebar?.lists?.common || [], dark, doc, onActivity, onClose, onSave,
    blank: () => ({ id: createId('common'), title: '', details: '' }),
    rowHtml: (c) => `<div class="sp-row" data-row="common" data-id="${esc(c.id)}">${rowTools}${fText('title', 'Title', c.title, 'wide')}${fRich('details', 'Details', c.details, doc)}</div>`,
    readRow: (r) => ({ id: r.dataset.id || createId('common'), ...readFields(r) }),
    wrap: (common) => ({ sidebar: { lists: { common } } }),
  });
}

export function openBonusesEditor({ sheet, onSave, onActivity, onClose, dark, doc = document }) {
  return rowListPanel({
    title: 'Bonuses', items: sheet.hero.bonuses || [], dark, doc, onActivity, onClose, onSave,
    blank: () => ({ id: createId('bonus'), bonus: '', source: '' }),
    rowHtml: (b) => `<div class="sp-row" data-row="bonus" data-id="${esc(b.id)}">${rowTools}${fRich('source', 'Source', b.source, doc)}${fRich('bonus', 'Bonus', b.bonus, doc)}</div>`,
    readRow: (r) => ({ id: r.dataset.id || createId('bonus'), ...readFields(r) }),
    wrap: (bonuses) => ({ hero: { bonuses } }),
  });
}

/** upload(file, hirelingId) answers the stored image path (upload_hireling_image.php) or throws. */
export function openHirelingsEditor({ sheet, onSave, upload, onActivity, onClose, dark, doc = document }) {
  const rowHtml = (x) => `<div class="sp-row" data-row="hireling" data-id="${esc(x.id)}" data-image="${esc(x.image || '')}">${rowTools}
    <div class="sp-grid">${fText('name', 'Name', x.name)}${fNum('bonus', `Bonus (0–${MAX_HIRELING_BONUS})`, x.bonus ?? 0)}
      <div class="sp-f"><span>Picture</span><div style="display:flex;gap:6px;align-items:center">${x.image ? `<img src="${esc(x.image)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px" data-preview>` : '<span data-preview class="sp-hint">none</span>'}<label class="sp-fbtn">Upload<input type="file" accept="image/*" data-upload hidden></label></div></div></div>
    <div class="sp-f wide"><span>Skills (up to ${MAX_HIRELING_SKILLS})</span><div class="sp-checkgrid">${ALL_SKILLS.map((s) => `<label><input type="checkbox" data-hskill="${esc(s)}"${(x.skills || []).includes(s) ? ' checked' : ''}> ${esc(s)}</label>`).join('')}</div></div>
    ${fRich('notes', 'Notes', x.notes, doc)}</div>`;
  return rowListPanel({
    title: 'Hirelings', items: sheet.hero.hirelings || [], dark, doc, onActivity, onClose, onSave, rowHtml,
    blank: () => ({ id: createId('hireling'), name: '', image: '', skills: [], bonus: 0, notes: '' }),
    readRow: (r) => {
      const f = readFields(r);
      return {
        id: r.dataset.id || createId('hireling'), name: f.name, image: r.dataset.image || '', notes: f.notes,
        bonus: Math.min(Math.max(Number.parseInt(f.bonus, 10) || 0, 0), MAX_HIRELING_BONUS),
        skills: [...r.querySelectorAll('[data-hskill]:checked')].map((c) => c.dataset.hskill).slice(0, MAX_HIRELING_SKILLS),
      };
    },
    wrap: (hirelings) => ({ hero: { hirelings } }),
    build(body) {
      body.addEventListener('change', async (e) => {
        if (e.target.matches('[data-hskill]')) {
          const r = e.target.closest('[data-row]');
          const count = r.querySelectorAll('[data-hskill]:checked').length;
          r.querySelectorAll('[data-hskill]:not(:checked)').forEach((c) => { c.disabled = count >= MAX_HIRELING_SKILLS; });
        }
        if (e.target.matches('[data-upload]') && e.target.files[0] && upload) {
          const r = e.target.closest('[data-row]');
          try {
            const path = await upload(e.target.files[0], r.dataset.id);
            r.dataset.image = path;
            r.querySelector('[data-preview]').outerHTML = `<img src="${esc(path)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px" data-preview>`;
          } catch (error) { r.querySelector('[data-preview]').textContent = error.message; }
        }
      });
    },
  });
}

// ---------------------------------------------------------------- import JSON
/** onImport(result of parseImport) answers true when stored. */
export function openImportDialog({ preset = '', onImport, onActivity, onClose, dark, doc = document }) {
  return openPanel({
    title: 'Import JSON', dark, doc, center: true, saveLabel: 'Import', onActivity, onClose,
    html: `<p class="sp-hint">Paste one ability, a list, or {"abilities": […]} — or choose a .json file. Each lands in its group by its action type (actionLabel / type), unless you pick a group. Cards with a "title" and no "name" are features.</p>
      <label class="sp-f wide"><span>JSON</span><textarea class="code" data-import-text rows="10" spellcheck="false" placeholder='{ "name": "Mind Spike", "actionLabel": "Main action", "tags": ["Psionic"], "range": "Ranged 10" }'></textarea></label>
      <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><label class="sp-fbtn">Choose file…<input type="file" accept=".json,application/json" data-import-file hidden></label>
      ${fSelect('group', 'Put in', preset, [['', 'by its action type'], ...Object.entries(IMPORT_GROUP_LABELS).map(([k, l]) => [k, l + (k === 'features' ? 's' : 's')])])}</div>`,
    build(body) {
      body.querySelector('[data-import-file]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) body.querySelector('[data-import-text]').value = await file.text();
      });
    },
    save(body) {
      const result = parseImport(body.querySelector('[data-import-text]').value, body.querySelector('[data-f="group"]').value);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSave: onImport,
  });
}

/** A small one-question form (amount, condition). Answers the text, or null. */
export function askText({ title, label, value = '', type = 'text', dark, doc = document }) {
  return new Promise((resolve) => {
    let answered = false;
    const panel = openPanel({
      title, dark, doc, center: true, saveLabel: 'OK',
      html: `<label class="sp-f wide"><span>${esc(label)}</span><input type="${type === 'number' ? 'number' : 'text'}" data-ask value="${esc(value)}"${type === 'number' ? ' min="0" inputmode="numeric"' : ''}></label>`,
      build(body) { body.querySelector('[data-ask]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.closest('.sp-panel').querySelector('[data-go]').click(); } }); },
      save(body) { return body.querySelector('[data-ask]').value; },
      onSave: (text) => { answered = true; resolve(text); return true; },
      onClose: () => { if (!answered) resolve(null); },
    });
    setTimeout(() => panel.body.querySelector('[data-ask]')?.select?.(), 0);
  });
}

/** A yes/no question in the sheet's look. */
export function askConfirm({ title, text, yes = 'Yes', no = 'Cancel', dark, doc = document }) {
  return new Promise((resolve) => {
    let answered = false;
    openPanel({
      title, dark, doc, center: true, saveLabel: yes, html: `<p style="margin:0">${esc(text)}</p>`,
      save: () => true, onSave: () => { answered = true; resolve(true); return true; },
      onClose: () => { if (!answered) resolve(false); },
    }).el.querySelector('footer [data-x]').textContent = no;
  });
}
