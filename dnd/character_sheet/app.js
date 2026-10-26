// The character sheet page (October 2026 rebuild; design approved by Brandon over five rounds of mock-ups:
// table/sheet-mock.*). Status first (stamina, the heroic resource, characteristics, vitals, tokens, surges,
// victories, recoveries, conditions), then tabs: Skills & traits (default), Abilities, Features, Inventory, Record.
// Diablo look by default, Parchment on the switch. Edit mode: drag to reorder, edit forms, copy as JSON, delete,
// add, Import JSON. Live between people: changes show at once, a field being edited is locked elsewhere, a stale
// save is refused and the sheet reloads.
//
// Saves use the same handler.php requests as before: save-fields (only what changed, field by field; counters as
// amounts), sync-vitals for damage, healing, temporary Stamina and recoveries, sync-hero-tokens, respite. The map's
// token hears of Stamina on the 'vtt-stamina-sync' channel; other pages of this browser on 'vtt-character-sheet-sync'.
// Conditions (October 2026) are one list with the hero's token, kept in step by deltas: while the hero has a token on
// the map a change here goes to the token and the same change to the sheet's list (parts/condition-edits.js); a
// change on the token comes back the same way. The sheet shows its own list; with no token it changes only that.
// The classic page (classic.php and its sheet.js) was retired when this sheet was approved (October 2026).

import { diffSheet, applyChanges, sameValue, WHOLE_FIELDS } from './sheet-changes.mjs';
import {
  mergeWithDefaults, deepClone, actionDefaults, normalizeAction, normalizeFeature, normalizeAutomationBlock, heroResourceFloor, resolveAutoResourceGain,
  formatActionForChat, formatFeatureForChat, formatSectionForChat, ACTION_TYPES, IMPORT_GROUP_LABELS, reorder,
} from './parts/sheet-model.js';
import { statusHtml, tabsHtml, traitsHtml, abilitiesHtml, featuresHtml, recordHtml, themeToggleHtml, readTheme, writeTheme, esc, toggleMore, mediaUrl, pickPortrait, wireConditionPicker } from './parts/sheet-parts.js';
import { normalizeSheetConditions } from './parts/conditions.js';
import { editHeroCondition, readTokenConditions, CONDITION_SYNC_CHANNEL } from './parts/condition-edits.js';
import * as Editor from './parts/sheet-editor.js';
import { createSheetLive } from './parts/sheet-live.js';
import { staminaState, damageStamina, healStamina, gainTempStamina, recoveryValueOf } from './parts/stamina-math.js';
import { makeSheetExports, sheetExportFileBase, downloadTextFile } from './parts/sheet-export.js';

const HANDLER = 'handler.php';
const CAMPAIGN_API = '/dnd/api/campaign.php';
const CHAT_API = window.chatHandlerUrl || '/dnd/chat_handler.php';
const STAMINA_CHANNEL = 'vtt-stamina-sync';
const SHEET_CHANNEL = 'vtt-character-sheet-sync';
const HERO_TOKEN_CHANNEL = 'vtt-hero-token-sync';
// The dnd/ folder's URL path from this page (character_sheet/index.php): stored pictures ("portraits/x.png") live under it.
const DND_BASE = (() => { try { return new URL('../', window.location.href).pathname; } catch (_) { return '/dnd/'; } })();

const body = document.body;
const root = document.getElementById('sheet-app');
const character = String(body.dataset.character || '').toLowerCase();
const user = String(body.dataset.user || '').toLowerCase();
const isGm = body.dataset.isGm === '1';
const canEdit = isGm || (character && character === user);

const host = (name) => root.querySelector(`[data-host="${name}"]`);
const inventoryPane = document.getElementById('inventory-pane');

const state = {
  sheet: null, baseline: null, loaded: false,
  tab: 'skills', abTab: 'all', editing: false, theme: readTheme(),
  info: undefined,            // undefined: loading; null: not available; object: the campaign record
  portrait: '',               // the header picture as a URL: the record's portrait, the heroes list's, the map token's
  pendingWrites: 0, writeEpoch: 0, saveQueue: Promise.resolve(true),
  dragging: false, openForms: 0, reloadWanted: false, locksKey: '',
  token: null,                // the hero's token as last read: {onMap, placementId, entityRevision}; null: not known
  conditionQueue: Promise.resolve(),
};

// ---------------------------------------------------------------- small helpers
const getAt = (obj, path) => path.reduce((at, step) => (at == null ? undefined : at[step]), obj);
const opId = () => globalThis.crypto?.randomUUID?.() || `sheet-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const dark = () => state.theme === 'diablo';

function flash(text, bad = false) {
  document.querySelectorAll('.sp-flash').forEach((n) => n.remove());
  const note = document.createElement('div');
  note.className = `sp-flash${bad ? ' bad' : ''}`;
  note.setAttribute('role', bad ? 'alert' : 'status');
  note.textContent = text;
  document.body.append(note);
  window.setTimeout(() => note.remove(), bad ? 6000 : 2600);
}

function channel(name) {
  if (typeof BroadcastChannel !== 'function') return null;
  channel.cache ||= {};
  return (channel.cache[name] ||= new BroadcastChannel(name));
}

function broadcastSheet(change = 'sheet') {
  channel(SHEET_CHANNEL)?.postMessage({ type: 'character-sheet-sync', source: 'sheet', character, change });
}

function broadcastStamina() {
  const v = state.sheet?.hero?.vitals || {};
  channel(STAMINA_CHANNEL)?.postMessage({
    type: 'stamina-sync', source: 'sheet', character,
    currentStamina: Number.isFinite(Number(v.currentStamina)) ? Number(v.currentStamina) : 0,
    staminaMax: Number.isFinite(Number(v.staminaMax)) ? Number(v.staminaMax) : 0,
    tempStamina: Math.max(0, Number.parseInt(v.tempStamina, 10) || 0),
  });
}

async function postForm(url, fields, extra = {}) {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(fields), credentials: 'same-origin', ...extra });
  return response.json();
}

/** A request the server works out from the record it holds (respite, a recovery, damage). Answer or null. */
async function askServer(action, fields = {}) {
  try {
    const answer = await postForm(HANDLER, { action, character, ...fields });
    if (!answer?.success) { flash(`NOT SAVED: ${answer?.error || 'the server did not take the change.'}`, true); return null; }
    return answer;
  } catch (error) {
    flash('NOT SAVED: no answer from the server.', true);
    return null;
  }
}

// ---------------------------------------------------------------- load and save
async function load({ quiet = false } = {}) {
  const epoch = state.writeEpoch;
  try {
    const response = await fetch(`${HANDLER}?action=load&character=${encodeURIComponent(character)}`, { credentials: 'same-origin', cache: 'no-store' });
    const answer = await response.json();
    if (!answer?.success || !answer.data) throw new Error(answer?.error || 'The server did not return the sheet.');
    if (state.loaded && (epoch !== state.writeEpoch || state.pendingWrites)) { state.reloadWanted = true; return false; }
    state.sheet = mergeWithDefaults(answer.data);
    state.baseline = deepClone(state.sheet);
    if (Number.isFinite(answer.revision)) live.revision = answer.revision;
    state.loaded = true;
    state.reloadWanted = false;
    render();
    followToken();
    return true;
  } catch (error) {
    if (!state.loaded) showLoadError(error.message);
    else if (!quiet) flash(`Could not reload the sheet: ${error.message}`, true);
    return false;
  }
}

function showLoadError(message) {
  host('status').innerHTML = '';
  host('tabs').innerHTML = '';
  host('pane').innerHTML = `<div class="sp-card" style="margin:20px"><div class="sp-body"><h2 style="margin:0 0 6px">Could not load this character sheet.</h2><p>${esc(message)}</p><p>Sign in as the Director or as this character, then reopen the sheet.</p></div></div>`;
}

async function sheetSaveWasStored(operationId) {
  try {
    const response = await fetch(`${HANDLER}?action=operation-status&character=${encodeURIComponent(character)}&operationId=${encodeURIComponent(operationId)}`, { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    return result?.success === true ? result.recorded === true : null;
  } catch (_) { return null; }
}

/**
 * Sends what this page changed (save-fields), with the revision the page last read. Counters pressed up or down are
 * sent as amounts; what is typed in a form is sent as typed. Answers true when stored.
 */
function saveSheet({ typed = false, keepalive = false } = {}) {
  if (!state.loaded) return Promise.resolve(false);
  const changes = diffSheet(state.baseline, state.sheet, [], !typed);
  if (!changes.length) return Promise.resolve(true);
  const operationId = opId();
  const held = changes.map(({ path }) => ({ path, value: getAt(state.baseline, path) }));
  applyChanges(state.baseline, changes);
  state.pendingWrites++;
  state.writeEpoch++;
  const send = async () => {
    const baseRevision = live.revision;
    try {
      const result = await postForm(HANDLER, { action: 'save-fields', character, operationId, changes: JSON.stringify(changes), baseRevision: baseRevision ?? '' }, { keepalive });
      if (!result?.success) {
        applyChanges(state.baseline, held);
        if (result?.stale || result?.locked) {
          flash(result.error || 'Someone else changed this. The sheet has been reloaded.', true);
          state.reloadWanted = true;
        } else {
          flash(`NOT SAVED: ${result?.error || 'The server did not take the change.'} Your next change will try again.`, true);
        }
        return false;
      }
      if (Number.isFinite(result.revision)) {
        // Somebody else wrote between the revision this page had and this save: read the sheet again.
        if (Number.isFinite(baseRevision) && result.revision > baseRevision + 1) state.reloadWanted = true;
        live.revision = result.revision;
      }
      broadcastSheet('sheet');
      return true;
    } catch (error) {
      const stored = await sheetSaveWasStored(operationId);
      if (stored === true) { broadcastSheet('sheet'); state.reloadWanted = true; return true; }
      applyChanges(state.baseline, stored === false ? held : held.filter((_, index) => !('from' in changes[index])));
      flash('NOT SAVED: no answer from the server. Your next change will try again.', true);
      return false;
    }
  };
  const saving = keepalive ? send() : (state.saveQueue = state.saveQueue.catch(() => false).then(send));
  return saving.finally(() => {
    state.pendingWrites--;
    state.writeEpoch++;
    if (!state.pendingWrites && state.reloadWanted && !state.dragging) load({ quiet: true });
  });
}

// ---------------------------------------------------------------- live (other people)
const live = createSheetLive({
  character, endpoint: HANDLER,
  onRevision: async () => {
    if (state.pendingWrites || state.dragging) { state.reloadWanted = true; return; }
    await load({ quiet: true });
  },
  onLocks: (locks) => {
    const key = JSON.stringify(locks.filter((l) => !l.mine).map((l) => [l.field, l.user]));
    if (key === state.locksKey) return;
    state.locksKey = key;
    if (state.loaded && !state.dragging) renderPane();
  },
  onLockLost: (field, holder) => flash(`${holder?.name || 'Someone'} took over ${field}. Save may be refused.`, true),
});
const lockOf = (path) => live.lockOf(path);

/** Opens a form after taking its fields' locks; releases them when the form closes. */
async function withLocks(fields, open) {
  const taken = await live.acquire(fields);
  if (!taken.ok) { flash(`${taken.holder?.name || 'Someone'} is editing this right now.`, true); return null; }
  state.openForms++;
  let released = false;
  const release = () => { if (released) return; released = true; state.openForms--; live.release(fields); if (state.reloadWanted && !state.pendingWrites) load({ quiet: true }); };
  try {
    return open({ onActivity: () => live.touch(), onClose: release, dark: dark() });
  } catch (error) {
    release();
    throw error;
  }
}

// ---------------------------------------------------------------- render
function render() {
  if (!state.loaded) return;
  root.dataset.sheetTheme = state.theme;
  document.documentElement.dataset.sheetTheme = state.theme;
  root.classList.toggle('sp-editing', state.editing);
  document.title = `${state.sheet.hero.name || 'Hero'} · Sheet`;
  renderStatus();
  renderTabs();
  renderPane();
  measure();
}

function renderStatus() {
  host('status').innerHTML = statusHtml(state.sheet, {
    characterId: character, portrait: state.portrait, canEdit, conditions: state.sheet.hero.conditions || [], fallbackName: character,
    conditionsTitle: state.token?.onMap ? 'Add a condition to this hero (and their token on the map)' : 'Add a condition',
  });
  wireConditionPicker(host('status'), (choice) => changeCondition('add', choice));
}

// ---------------------------------------------------------------- conditions (one list with the token)
function holdConditions(list) {
  for (const held of [state.sheet, state.baseline]) if (held?.hero) held.hero.conditions = normalizeSheetConditions(list);
}

/**
 * Reads where the hero's token is (for the picker's words). Nothing is written and the sheet's list stays its own:
 * a page opening, like a map opening, sends no signal (Brandon, late October 2026: "If a map just gets turned on and
 * then turned back off, no signals go out"). A token's old conditions reach the sheet only when one of them changes.
 */
async function followToken() {
  const view = await readTokenConditions(character);
  if (!view || !state.loaded) return;
  const was = Boolean(state.token?.onMap);
  state.token = view.onMap ? { onMap: true, placementId: view.placementId, entityRevision: view.entityRevision } : { onMap: false };
  if (was !== Boolean(view.onMap)) renderStatus();
}

/** Adds or takes off one condition: on the token while the hero is on the map, else on the sheet. One at a time. */
function changeCondition(op, condition) {
  if (!canEdit || !state.loaded) return Promise.resolve(false);
  state.conditionQueue = state.conditionQueue.catch(() => false).then(async () => {
    state.pendingWrites++; state.writeEpoch++;
    let result;
    try {
      result = await editHeroCondition({ character, op, condition, currentList: state.sheet.hero.conditions, baseRevision: live.revision, sheetEndpoint: HANDLER });
    } finally { state.pendingWrites--; state.writeEpoch++; }
    if (!result.ok) {
      flash(`NOT SAVED: ${result.error}`, true);
      if (result.stale) state.reloadWanted = true;
    } else {
      holdConditions(result.conditions);
      if (result.onMap !== undefined) state.token = { ...(state.token || {}), onMap: result.onMap };
      if (Number.isFinite(result.revision)) {
        if (Number.isFinite(live.revision) && result.revision > live.revision + 1) state.reloadWanted = true;
        live.revision = result.revision;
      }
      renderStatus();
      channel(CONDITION_SYNC_CHANNEL)?.postMessage({ type: 'conditions-sync', source: 'sheet', character, conditions: state.sheet.hero.conditions, onMap: Boolean(result.onMap) });
      broadcastSheet('conditions');
    }
    if (!state.pendingWrites && state.reloadWanted && !state.dragging) load({ quiet: true });
    return result.ok;
  });
  return state.conditionQueue;
}

function renderTabs() {
  const A = state.sheet.actions || {};
  const count = ACTION_TYPES.reduce((n, k) => n + (A[k] || []).length, 0);
  const tabs = [['skills', 'Skills & traits', ''], ['abilities', 'Abilities', count], ['features', 'Features', (state.sheet.features || []).length], ['inventory', 'Inventory', ''], ['record', 'Record', '']];
  const tools = `<button type="button" class="sp-dice" data-sheet-dice title="Open the dice roller">🎲 Dice</button>${themeToggleHtml(state.theme)}${canEdit ? `<button type="button" class="sp-edit-toggle${state.editing ? ' on' : ''}" data-sheet-edit-toggle title="Edit mode: move, edit, add, import and delete">${state.editing ? '✓ Done editing' : '✎ Edit'}</button>` : ''}`;
  host('tabs').innerHTML = tabsHtml(tabs, state.tab, tools);
  host('banner').innerHTML = state.editing ? `<div class="sp-edit-banner"><span>Edit mode — drag cards by ⋮⋮ to reorder; ✎ edits, ⤓ copies a card as JSON, 🗑 deletes.</span>
    <button type="button" class="sp-btn" data-sheet-edit-section="core"${lockOf('hero.vitals') ? ' disabled' : ''}>✎ Hero &amp; vitals</button><button type="button" class="sp-btn" data-sheet-edit-section="resource">✎ Resource</button><button type="button" class="sp-btn" data-sheet-edit-section="background">✎ Background</button><button type="button" class="sp-btn" data-sheet-edit-section="kit">✎ Kit</button>
    <button type="button" class="sp-btn sp-import-btn" data-sheet-import>⇪ Import JSON</button>${isGm ? '<button type="button" class="sp-btn" data-sheet-print>Print sheet</button><button type="button" class="sp-btn" data-sheet-export-llm>Export skills (JSON)</button>' : ''}</div>` : '';
}

function renderPane() {
  if (!state.loaded) return;
  const ctx = { editing: state.editing, canEdit, lockOf, chat: true, abTab: state.abTab };
  const pane = host('pane');
  const onInventory = state.tab === 'inventory';
  inventoryPane?.classList.toggle('is-hidden', !onInventory);
  pane.hidden = onInventory;
  if (onInventory) return;
  const scroll = window.scrollY;
  if (state.tab === 'abilities') pane.innerHTML = abilitiesHtml(state.sheet, ctx);
  else if (state.tab === 'features') pane.innerHTML = featuresHtml(state.sheet, ctx);
  else if (state.tab === 'record') pane.innerHTML = recordHtml(state.sheet, state.info === undefined ? { player_name: '…' } : (state.info && { ...state.info, portrait: mediaUrl(state.info.portrait, DND_BASE) }), { ...ctx, canEditInfo: isGm && state.info, canEditPortrait: canEdit && state.info });
  else pane.innerHTML = traitsHtml(state.sheet, ctx);
  if (state.editing) wireDrag(pane);
  window.scrollTo(0, scroll);
}

function measure() {
  const status = root.querySelector('[data-sp-status]');
  if (!status) return;
  const sticky = getComputedStyle(status).position === 'sticky' && status.offsetHeight < window.innerHeight * 0.45 && root.offsetWidth < 980;
  status.style.position = root.offsetWidth >= 980 ? '' : (sticky ? '' : 'static');
  root.style.setProperty('--sp-status-h', `${sticky ? status.offsetHeight : 0}px`);
  syncScrollEnd();
}
window.addEventListener('resize', measure);

// More below: a fade at the bottom of the window (app.css, the hero panel's pattern) while rows are still below its
// edge, so a box cut by the window (Languages in a Table window) reads as fading out, never as sliced. Gone at the end.
function syncScrollEnd() {
  const page = document.scrollingElement || document.documentElement;
  root.classList.toggle('sp-at-end', page.scrollHeight - page.scrollTop - page.clientHeight <= 4);
}
window.addEventListener('scroll', syncScrollEnd, { passive: true });
if (typeof ResizeObserver === 'function') new ResizeObserver(() => syncScrollEnd()).observe(root);

// ---------------------------------------------------------------- the counters and vitals
function setCounter(path, value) {
  let at = state.sheet;
  path.slice(0, -1).forEach((step) => { at = at[step]; });
  at[path[path.length - 1]] = value;
}

async function changeStamina(mode) {
  const question = mode === 'damage' ? 'How much damage?' : mode === 'temp' ? 'How much temporary Stamina? (keeps the higher)' : 'How much healing?';
  const raw = await Editor.askText({ title: 'Stamina', label: question, type: 'number', dark: dark() });
  const amount = Number.parseInt(raw, 10);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const before = staminaState(state.sheet.hero.vitals);
  const after = mode === 'damage' ? damageStamina(before, amount) : mode === 'temp' ? gainTempStamina(before, amount) : healStamina(before, amount);
  if (mode === 'heal' && after.current === before.current) { flash('Stamina is already at its maximum.'); return; }
  await saveSheet();                                         // anything not yet saved goes first
  // Drawn at once (not a change of this page's to save: the server works it out from the record it holds, and its
  // answer is what stays).
  for (const held of [state.sheet.hero.vitals, state.baseline.hero.vitals]) Object.assign(held, { currentStamina: after.current, tempStamina: after.temp });
  renderStatus();
  state.pendingWrites++; state.writeEpoch++;
  let answer = null;
  try {
    answer = await askServer('sync-vitals', mode === 'temp' ? { gainTemp: amount } : { staminaDelta: mode === 'damage' ? -amount : amount, operationId: opId() });
  } finally { state.pendingWrites--; state.writeEpoch++; }
  if (!answer) { await load({ quiet: true }); return; }
  for (const held of [state.sheet, state.baseline]) {
    held.hero.vitals = { ...held.hero.vitals, currentStamina: answer.currentStamina, tempStamina: answer.tempStamina ?? held.hero.vitals.tempStamina };
  }
  pushHistory(answer.currentStamina);
  renderStatus();
  broadcastStamina();
  broadcastSheet('stamina');
}

function pushHistory(value) {
  const v = state.sheet.hero.vitals;
  const history = Array.isArray(v.staminaHistory) ? [...v.staminaHistory] : [];
  if (!history.length || history[history.length - 1] !== Number(value)) history.push(Number(value));
  v.staminaHistory = history.slice(-4);
  state.baseline.hero.vitals.staminaHistory = [...v.staminaHistory];
}

async function spendRecovery() {
  const v = state.sheet.hero.vitals;
  if ((Number(v.currentRecoveries) || 0) <= 0) { flash('No recoveries left.'); return; }
  const recoveryVal = recoveryValueOf(v);
  const staminaRoom = (Number(v.staminaMax) || 0) > 0 ? Math.max(0, Number(v.staminaMax) - (Number(v.currentStamina) || 0)) : recoveryVal;
  const willHeal = Math.min(recoveryVal, staminaRoom);
  const ok = await Editor.askConfirm({ title: 'Spend recovery', text: willHeal > 0 ? `Spend 1 recovery to heal ${willHeal} Stamina?` : 'Stamina is already at its maximum. Spend 1 recovery anyway?', yes: 'Spend', dark: dark() });
  if (!ok) return;
  await saveSheet();
  state.pendingWrites++; state.writeEpoch++;
  let used = null;
  try { used = await askServer('sync-vitals', { useRecovery: 1 }); } finally { state.pendingWrites--; state.writeEpoch++; }
  if (!used) return;
  for (const held of [state.sheet, state.baseline]) {
    held.hero.vitals = { ...held.hero.vitals, currentStamina: used.currentStamina, currentRecoveries: used.currentRecoveries, ...(Number.isFinite(used.tempStamina) ? { tempStamina: used.tempStamina } : {}) };
  }
  if (!used.spent && used.reason) flash(used.reason);
  pushHistory(used.currentStamina);
  renderStatus();
  broadcastSheet('sheet');
  broadcastStamina();
}

async function toggleHeroToken(index) {
  const tokens = [Boolean(state.sheet.hero.heroTokens?.[0]), Boolean(state.sheet.hero.heroTokens?.[1])];
  if (!tokens[index]) {
    const ok = await Editor.askConfirm({ title: 'Hero token', text: 'Does everyone agree to use a hero token?', yes: 'Yes', dark: dark() });
    if (!ok) return;
  }
  const answer = await askServer('sync-hero-tokens', { tokenIndex: String(index), tokenState: tokens[index] ? '0' : '1' });
  if (!answer) return;
  state.sheet.hero.heroTokens = [Boolean(answer.heroTokens?.[0]), Boolean(answer.heroTokens?.[1])];
  state.baseline.hero.heroTokens = [...state.sheet.hero.heroTokens];
  renderStatus();
  channel(HERO_TOKEN_CHANNEL)?.postMessage({ type: 'hero-token-sync', heroTokens: answer.heroTokens });
}

async function respite() {
  const ok = await Editor.askConfirm({ title: 'Respite', text: 'Take a respite? Victories will convert to XP, recoveries will be restored, and Stamina will return to full.', yes: 'Take a respite', dark: dark() });
  if (!ok) return;
  await saveSheet();
  state.pendingWrites++; state.writeEpoch++;
  let rested = null;
  try { rested = await askServer('respite'); } finally { state.pendingWrites--; state.writeEpoch++; }
  if (!rested?.data) return;
  state.sheet = mergeWithDefaults(rested.data);
  state.baseline = deepClone(state.sheet);
  render();
  if (Array.isArray(rested.notes) && rested.notes.length) flash(rested.notes.join(' '));
  broadcastSheet('sheet');
  broadcastStamina();
}

// ---------------------------------------------------------------- chat
async function postChat(text) {
  if (!text) { flash('Nothing to post'); return false; }
  if (window.dashboardChat && typeof window.dashboardChat.sendMessage === 'function') {
    try { const ok = await window.dashboardChat.sendMessage({ message: text, type: 'text' }); flash(ok === false ? 'Failed to post' : 'Posted to chat', ok === false); return ok !== false; } catch (_) { /* fall back to the chat endpoint */ }
  }
  try {
    const result = await postForm(CHAT_API, { action: 'chat_send', message: text });
    flash(result?.success ? 'Posted to chat' : 'Failed to post', !result?.success);
    return Boolean(result?.success);
  } catch (_) { flash('Failed to post', true); return false; }
}

// ---------------------------------------------------------------- edit forms
const isPlainMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// A group that is one field (the skills: WHOLE_FIELDS) is replaced, not merged: a skill taken off stays off.
function mergePatch(target, patch, path = []) {
  for (const [key, value] of Object.entries(patch || {})) {
    const at = [...path, key];
    if (isPlainMap(value) && isPlainMap(target[key]) && !WHOLE_FIELDS.has(at.join('.'))) mergePatch(target[key], value, at);
    else target[key] = value;
  }
  return target;
}

/**
 * What a form changed: the fields of its answer that differ from the sheet as the form opened with it. A form holds a
 * whole section (Hero & vitals has the Stamina in it) and the page reloads behind an open form when the map hits the
 * hero; the numbers the form opened with were written back over the newer ones and the token followed (October 2026).
 */
function changedByForm(patch, opened, path = []) {
  const out = {};
  for (const [key, value] of Object.entries(patch || {})) {
    const at = [...path, key];
    const was = opened?.[key];
    if (isPlainMap(value) && isPlainMap(was) && !WHOLE_FIELDS.has(at.join('.'))) {
      const inner = changedByForm(value, was, at);
      if (Object.keys(inner).length) out[key] = inner;
    } else if (!sameValue(value, was)) out[key] = value;
  }
  return out;
}

const SECTION_LOCKS = {
  core: ['hero.name', 'hero.level', 'hero.class', 'hero.classTrack', 'hero.stats', 'hero.vitals', 'hero.victories', 'hero.surges', 'hero.wealth', 'hero.renown', 'hero.xp'],
  background: ['hero.ancestry', 'hero.culture', 'hero.career', 'hero.complication'],
  kit: ['hero.kit'], resource: ['hero.resource', 'sidebar.resource'], skills: ['sidebar.skills'],
  lists: ['sidebar.lists.languages', 'sidebar.lists.vulnerability', 'sidebar.lists.immunity'], common: ['sidebar.lists.common'],
  bonuses: ['hero.bonuses'], hirelings: ['hero.hirelings'],
};
const SECTION_FORMS = {
  core: Editor.openCoreEditor, background: Editor.openBackgroundEditor, kit: Editor.openKitEditor, resource: Editor.openResourceEditor,
  skills: Editor.openSkillsEditor, lists: Editor.openListsEditor, common: Editor.openCommonEditor, bonuses: Editor.openBonusesEditor, hirelings: Editor.openHirelingsEditor,
};

async function applyAndSave(mutate) {
  mutate(state.sheet);
  render();
  return saveSheet({ typed: true });
}

function editSection(section) {
  const open = SECTION_FORMS[section];
  if (!open) return;
  const opened = deepClone(state.sheet);
  withLocks(SECTION_LOCKS[section], (hooks) => open({
    ...hooks, sheet: deepClone(opened), upload: uploadHirelingImage,
    onSave: (patch) => applyAndSave((sheet) => mergePatch(sheet, changedByForm(patch, opened))),
  }));
}

async function uploadHirelingImage(file, hirelingId) {
  const form = new FormData();
  form.append('image', file);
  form.append('character', character);
  form.append('hireling_id', hirelingId);
  const response = await fetch('upload_hireling_image.php', { method: 'POST', body: form, credentials: 'same-origin' });
  const result = await response.json();
  if (!result?.success) throw new Error(result?.error || 'Upload failed');
  return result.image_path;
}

/** A pasted automation is saved at once, onto the ability or feature as it stands now (the classic sheet did). */
async function saveAutomation(id, kind, automation) {
  const list = kind === 'features' ? state.sheet.features : state.sheet.actions[kind];
  const target = (list || []).find((item) => item.id === id);
  if (!target) return false;
  target.automation = normalizeAutomationBlock(automation);
  render();
  return saveSheet({ typed: true });
}

function editCard(kind, index, isNew = false) {
  if (kind === 'features') {
    const feature = isNew ? normalizeFeature({}) : state.sheet.features[index];
    if (!feature) return;
    withLocks(['features'], (hooks) => Editor.openFeatureEditor({
      ...hooks, feature, isNew, hero: state.sheet.hero, onAutomationSaved: isNew ? null : saveAutomation,
      onSave: (draft) => applyAndSave((sheet) => {
        const at = sheet.features.findIndex((f) => f.id === draft.id);
        if (at >= 0) sheet.features[at] = normalizeFeature(draft); else sheet.features.push(normalizeFeature(draft));
      }),
    }));
    return;
  }
  const ability = isNew ? actionDefaults(kind) : state.sheet.actions[kind]?.[index];
  if (!ability) return;
  withLocks(ACTION_TYPES.map((k) => `actions.${k}`), (hooks) => Editor.openAbilityEditor({
    ...hooks, ability, kind, isNew, hero: state.sheet.hero, onAutomationSaved: isNew ? null : saveAutomation,
    onSave: ({ ability: draft, kind: toKind }) => applyAndSave((sheet) => {
      const card = normalizeAction(draft, toKind);
      for (const k of ACTION_TYPES) {
        const at = sheet.actions[k].findIndex((a) => a.id === card.id);
        if (at >= 0 && (k !== toKind)) sheet.actions[k].splice(at, 1);
        else if (at >= 0) { sheet.actions[k][at] = card; return; }
      }
      sheet.actions[toKind].push(card);
      if (state.tab === 'abilities' && state.abTab !== 'all' && state.abTab !== toKind) state.abTab = toKind;
    }),
  }));
}

async function deleteCard(kind, index) {
  const list = kind === 'features' ? state.sheet.features : state.sheet.actions[kind];
  const card = list?.[index];
  if (!card) return;
  const ok = await Editor.askConfirm({ title: 'Delete', text: `Delete "${card.name || card.title || 'this card'}"? This cannot be undone here.`, yes: 'Delete', dark: dark() });
  if (!ok) return;
  const path = kind === 'features' ? 'features' : `actions.${kind}`;
  const taken = await live.acquire([path]);
  if (!taken.ok) { flash(`${taken.holder?.name || 'Someone'} is editing this right now.`, true); return; }
  try {
    await applyAndSave(() => { list.splice(list.findIndex((item) => item.id === card.id), 1); });
  } finally { live.release([path]); }
}

async function copyCard(kind, index, button) {
  const list = kind === 'features' ? state.sheet.features : state.sheet.actions[kind];
  const card = list?.[index];
  if (!card) return;
  const json = JSON.stringify(card, null, 2);
  try { await navigator.clipboard.writeText(json); button.textContent = '✓'; setTimeout(() => { button.textContent = '⤓'; }, 1500); }
  catch (_) { Editor.openPanel({ title: 'Copy this JSON', center: true, dark: dark(), html: `<textarea class="code" style="width:100%;min-height:260px">${esc(json)}</textarea>` }); }
}

function openImport(preset = '') {
  withLocks(['features', ...ACTION_TYPES.map((k) => `actions.${k}`)], (hooks) => Editor.openImportDialog({
    ...hooks, preset,
    onImport: async ({ items, added }) => {
      const ok = await applyAndSave((sheet) => {
        items.forEach(({ group, card }) => { if (group === 'features') sheet.features.push(card); else sheet.actions[group].push(card); });
        const groups = Object.keys(added);
        if (groups.length === 1 && groups[0] === 'features') state.tab = 'features';
        else { state.tab = 'abilities'; state.abTab = groups.length > 1 ? 'all' : groups[0]; }
      });
      if (ok) flash(`Imported ${Object.entries(added).map(([g, n]) => `${n} ${IMPORT_GROUP_LABELS[g].toLowerCase()}${n > 1 ? 's' : ''}`).join(', ')}`);
      return ok;
    },
  }));
}

// ---------------------------------------------------------------- drag to reorder (within one list)
function wireDrag(pane) {
  let from = null;
  pane.querySelectorAll('[data-kind][draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      from = { kind: card.dataset.kind, i: Number(card.dataset.i) };
      state.dragging = true;
      card.classList.add('sp-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('sp-dragging');
      pane.querySelectorAll('.sp-drop-before, .sp-drop-after').forEach((n) => n.classList.remove('sp-drop-before', 'sp-drop-after'));
      state.dragging = false;
      if (state.reloadWanted && !state.pendingWrites) load({ quiet: true });
    });
    card.addEventListener('dragover', (e) => {
      if (!from || from.kind !== card.dataset.kind) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const after = (e.clientX - r.left) / r.width > 0.5;
      pane.querySelectorAll('.sp-drop-before, .sp-drop-after').forEach((n) => n.classList.remove('sp-drop-before', 'sp-drop-after'));
      card.classList.add(after ? 'sp-drop-after' : 'sp-drop-before');
    });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!from || from.kind !== card.dataset.kind) return;
      const after = card.classList.contains('sp-drop-after');
      const move = { ...from, to: Number(card.dataset.i), after };
      from = null;
      state.dragging = false;
      await moveCard(move.kind, move.i, move.to, move.after);
    });
  });
}

/** Moves a card within its list and saves the new order. */
export async function moveCard(kind, fromIndex, toIndex, after = false) {
  const path = kind === 'features' ? 'features' : `actions.${kind}`;
  const taken = await live.acquire([path]);
  if (!taken.ok) { flash(`${taken.holder?.name || 'Someone'} is editing this right now.`, true); return false; }
  try {
    return await applyAndSave((sheet) => {
      if (kind === 'features') sheet.features = reorder(sheet.features, fromIndex, toIndex, after);
      else sheet.actions[kind] = reorder(sheet.actions[kind], fromIndex, toIndex, after);
    });
  } finally { live.release([path]); }
}

// ---------------------------------------------------------------- record (campaign API)
async function loadInfo() {
  try {
    const response = await fetch(`${CAMPAIGN_API}?action=character&character=${encodeURIComponent(character)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const answer = await response.json();
    const hero = Array.isArray(answer?.heroes) ? (answer.heroes.find((h) => String(h?.id || '').toLowerCase() === character) || answer.heroes[0]) : null;
    state.info = answer?.success ? (hero?.info || answer?.data?.character || null) : null;
  } catch (_) {
    state.info = null;          // the record is not there yet: "—", nothing to edit
  }
  if (state.loaded) { renderStatus(); if (state.tab === 'record') renderPane(); }
  await loadPortrait();
}

async function getJson(url) {
  try {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch (_) { return null; }
}

/**
 * The header picture: the campaign record's portrait; else the heroes list's (api/campaign.php?action=heroes); else
 * the hero's token picture from the map's token library (by name); else none (the header shows initials).
 */
async function loadPortrait() {
  const candidates = [state.info?.portrait];
  if (!pickPortrait(candidates, DND_BASE)) {
    const heroes = await getJson(`${CAMPAIGN_API}?action=heroes`);
    const hero = Array.isArray(heroes?.heroes) ? heroes.heroes.find((h) => String(h?.id || '').toLowerCase() === character) : null;
    candidates.push(hero?.portrait);
  }
  if (!pickPortrait(candidates, DND_BASE)) {
    const tokens = await getJson(`${DND_BASE}vtt/api/tokens.php`);
    const items = Array.isArray(tokens?.data?.items) ? tokens.data.items : (Array.isArray(tokens?.data?.tokens) ? tokens.data.tokens : []);
    const names = new Set([character, state.sheet?.hero?.name, state.info?.character_name].map((n) => String(n || '').trim().toLowerCase()).filter(Boolean));
    candidates.push(items.find((t) => t?.imageUrl && names.has(String(t.name || '').trim().toLowerCase()))?.imageUrl);
  }
  const url = pickPortrait(candidates, DND_BASE);
  if (url === state.portrait) return;
  state.portrait = url;
  if (state.loaded) renderStatus();
}

async function saveInfo(field, value) {
  try {
    const answer = await postForm(CAMPAIGN_API, { action: 'save_info', character, field, value, fields: JSON.stringify({ [field]: value }) });
    if (!answer?.success) { flash(`NOT SAVED: ${answer?.error || 'the record did not take it.'}`, true); return false; }
    state.info = { ...(state.info || {}), ...(answer.info || answer.data?.character || { [field]: value }) };
    return true;
  } catch (_) { flash('NOT SAVED: no answer from the record.', true); return false; }
}

async function uploadPortrait(file) {
  const form = new FormData();
  form.append('portrait', file);
  form.append('character', character);
  try {
    const response = await fetch('/dnd/upload_portrait.php', { method: 'POST', body: form, credentials: 'same-origin' });
    const result = await response.json();
    if (!result?.success) { flash(result?.error || 'The portrait could not be saved.', true); return; }
    await loadInfo();
    flash('Portrait saved');
  } catch (_) { flash('The portrait could not be saved.', true); }
}

// ---------------------------------------------------------------- exports (Director)
async function printSheet() {
  const win = window.open('', '_blank');
  if (!win) { flash('Allow popups to print the sheet', true); return; }
  win.document.write('<!doctype html><title>Preparing character sheet…</title><body>Preparing character sheet…</body>');
  let inventory = {};
  try { const result = await postForm('inventory_handler.php', { action: 'load' }); inventory = result?.success && result.data ? result.data : {}; } catch (_) { /* print without it */ }
  const html = makeSheetExports(state.sheet, character).buildPrintableCharacterSheetHtml(inventory);
  win.document.open(); win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 300);
}

function exportSkills() {
  const json = JSON.stringify(makeSheetExports(state.sheet, character).buildSkillExportPayload(), null, 2);
  const panel = Editor.openPanel({
    title: 'Export skills (JSON)', center: true, dark: dark(),
    html: `<textarea class="code" readonly style="width:100%;min-height:320px;font:12px/1.4 Consolas,monospace">${esc(json)}</textarea>`,
    footerExtra: '<button type="button" data-copy>Copy JSON</button><button type="button" data-download>Download JSON</button>',
  });
  panel.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(json); flash('Copied'); } catch (_) { panel.el.querySelector('textarea').select(); document.execCommand('copy'); } };
  panel.el.querySelector('[data-download]').onclick = () => downloadTextFile(`${sheetExportFileBase(state.sheet, character)}-skills-export.json`, json);
}

// ---------------------------------------------------------------- one click handler for the page
function setEditing(on) {
  state.editing = Boolean(on) && canEdit;
  body.classList.toggle('edit-mode', state.editing);
  const toggle = document.getElementById('edit-toggle');
  if (toggle) { toggle.checked = state.editing; toggle.dispatchEvent(new Event('change', { bubbles: true })); }
  render();
}

root.addEventListener('click', async (event) => {
  const t = event.target instanceof Element ? event.target : null;
  if (!t || !state.loaded) return;
  const hit = (selector) => t.closest(selector);
  let el;
  if ((el = hit('[data-sheet-tab]'))) { state.tab = el.dataset.sheetTab; renderTabs(); renderPane(); measure(); return; }
  if ((el = hit('[data-sheet-ab-tab]'))) { state.abTab = el.dataset.sheetAbTab; renderPane(); return; }
  if (hit('[data-sheet-theme-toggle]')) { state.theme = writeTheme(state.theme === 'diablo' ? 'parchment' : 'diablo'); render(); return; }
  if (hit('[data-sheet-edit-toggle]')) { setEditing(!state.editing); return; }
  // The dice roller binds the page's own (hidden) button when the page starts; this one presses it.
  if (hit('[data-sheet-dice]')) { if (window.dashboardDiceRoller?.open) window.dashboardDiceRoller.open(); else document.getElementById('dice-roller-btn')?.click(); return; }
  if ((el = hit('[data-character-stamina-action]'))) { changeStamina(el.dataset.characterStaminaAction); return; }
  if (hit('[data-character-recovery]')) { spendRecovery(); return; }
  if ((el = hit('[data-character-hero-token]'))) { toggleHeroToken(Number(el.dataset.characterHeroToken)); return; }
  if ((el = hit('[data-character-surge-delta]'))) {
    const now = Math.max(0, Number(state.sheet.hero.surges) || 0);
    state.sheet.hero.surges = Math.max(0, now + Number(el.dataset.characterSurgeDelta));
    state.sheet.hero.surgesUsed = 0;
    renderStatus(); saveSheet(); return;
  }
  if ((el = hit('[data-character-victory-delta]')) || hit('[data-character-add-victory]')) {
    const delta = el ? Number(el.dataset.characterVictoryDelta) : 1;
    const now = Number(state.sheet.hero.victories) || 0;
    if (now + delta < 0) return;
    state.sheet.hero.victories = now + delta;
    renderStatus(); saveSheet(); return;
  }
  if ((el = hit('[data-character-resource-delta]'))) {
    const r = state.sheet.hero.resource;
    r.value = Math.max(heroResourceFloor(state.sheet.hero), (Number(r.value) || 0) + Number(el.dataset.characterResourceDelta));
    renderStatus(); saveSheet(); return;
  }
  if (hit('[data-character-resource-roll]')) {
    const r = state.sheet.hero.resource;
    const gain = resolveAutoResourceGain(r.autoDice);
    if (!gain) { flash('No start-of-turn gain is set for this resource.'); return; }
    const before = Number(r.value) || 0;
    r.value = before + gain.amount;
    renderStatus();
    if (await saveSheet()) flash(`${r.title || 'Resource'} ${gain.label}: +${gain.amount} (${before} → ${r.value}).`);
    return;
  }
  if ((el = hit('[data-sheet-condition-remove]'))) {
    const condition = normalizeSheetConditions(state.sheet.hero.conditions)[Number(el.dataset.sheetConditionRemove)];
    if (condition) changeCondition('remove', condition);
    return;
  }
  if (hit('[data-sheet-respite]')) { respite(); return; }
  if ((el = hit('[data-sheet-more]'))) { toggleMore(el); return; }
  if ((el = hit('[data-sheet-use]'))) {
    const card = el.closest('[data-kind]');
    const ability = state.sheet.actions[card.dataset.kind]?.[Number(card.dataset.i)];
    if (ability) postChat(formatActionForChat(state.sheet, ability, card.dataset.kind));
    return;
  }
  if ((el = hit('[data-sheet-chat]'))) {
    const [kind, id = ''] = el.dataset.sheetChat.split(':');
    const text = kind === 'feature' ? formatFeatureForChat(state.sheet, state.sheet.features.find((f) => f.id === id)) : formatSectionForChat(state.sheet, kind, id);
    const ok = await Editor.askConfirm({ title: 'Post to chat', text: 'Post this to the chat?', yes: 'Post', dark: dark() });
    if (ok) postChat(text);
    return;
  }
  if ((el = hit('[data-sheet-edit]'))) { const c = el.closest('[data-kind]'); editCard(c.dataset.kind, Number(c.dataset.i)); return; }
  if ((el = hit('[data-sheet-export]'))) { const c = el.closest('[data-kind]'); copyCard(c.dataset.kind, Number(c.dataset.i), el); return; }
  if ((el = hit('[data-sheet-del]'))) { const c = el.closest('[data-kind]'); deleteCard(c.dataset.kind, Number(c.dataset.i)); return; }
  if ((el = hit('[data-sheet-add]'))) { editCard(el.dataset.sheetAdd, -1, true); return; }
  if ((el = hit('[data-sheet-edit-section]'))) { editSection(el.dataset.sheetEditSection); return; }
  if (hit('[data-sheet-import]')) { openImport(); return; }
  if (hit('[data-sheet-print]')) { printSheet(); return; }
  if (hit('[data-sheet-export-llm]')) { exportSkills(); return; }
  if ((el = hit('[data-sheet-lightbox]'))) {
    const box = document.createElement('div');
    box.className = 'sp-lightbox';
    box.innerHTML = `<img src="${esc(el.getAttribute('src'))}" alt="">`;
    box.onclick = () => box.remove();
    document.body.append(box);
  }
});

// The campaign record's fields: locked while one is being typed in, saved when left.
root.addEventListener('focusin', async (event) => {
  const input = event.target.closest?.('[data-sheet-info]');
  if (!input || input.dataset.lockHeld) return;
  const field = `info.${input.dataset.sheetInfo}`;
  const taken = await live.acquire([field]);
  if (!taken.ok) { input.blur(); flash(`${taken.holder?.name || 'Someone'} is editing this right now.`, true); return; }
  input.dataset.lockHeld = '1';
  input.dataset.before = input.value;
});
root.addEventListener('input', (event) => { if (event.target.closest?.('[data-sheet-info]')) live.touch(); });
root.addEventListener('focusout', async (event) => {
  const input = event.target.closest?.('[data-sheet-info]');
  if (!input || !input.dataset.lockHeld) return;
  const key = input.dataset.sheetInfo;
  delete input.dataset.lockHeld;
  if (input.value !== input.dataset.before) await saveInfo(key, input.value);
  live.release([`info.${key}`]);
});
root.addEventListener('change', (event) => {
  const file = event.target.closest?.('[data-sheet-portrait]');
  if (file?.files?.[0]) uploadPortrait(file.files[0]);
});

// ---------------------------------------------------------------- other pages of this browser
function listen() {
  channel(STAMINA_CHANNEL)?.addEventListener('message', (event) => {
    const p = event?.data;
    if (!p || p.type !== 'stamina-sync' || p.source === 'sheet') return;
    if (String(p.character || '').toLowerCase() !== character) return;
    if (!state.pendingWrites) load({ quiet: true });
  });
  channel(SHEET_CHANNEL)?.addEventListener('message', (event) => {
    const p = event?.data;
    if (!p || p.type !== 'character-sheet-sync' || p.source === 'sheet') return;
    if (p.character && String(p.character).toLowerCase() !== character) return;
    if (!state.pendingWrites) load({ quiet: true });
  });
  // A hero's conditions changed on the map or the side panel in this browser.
  channel(CONDITION_SYNC_CHANNEL)?.addEventListener('message', (event) => {
    const p = event?.data;
    if (!p || p.type !== 'conditions-sync' || p.source === 'sheet') return;
    if (String(p.character || '').toLowerCase() !== character) return;
    if (!state.pendingWrites) load({ quiet: true });
  });
  channel(HERO_TOKEN_CHANNEL)?.addEventListener('message', (event) => {
    const p = event?.data;
    if (!p || p.type !== 'hero-token-sync' || !state.loaded) return;
    state.sheet.hero.heroTokens = [Boolean(p.heroTokens?.[0]), Boolean(p.heroTokens?.[1])];
    state.baseline.hero.heroTokens = [...state.sheet.hero.heroTokens];
    renderStatus();
  });
  // The party's hero tokens are not a sheet field: read them every few seconds, as the classic sheet did.
  window.setInterval(async () => {
    if (document.visibilityState === 'hidden' || !state.loaded) return;
    try {
      const response = await fetch(`${HANDLER}?action=sync-hero-tokens&character=${encodeURIComponent(character)}`, { credentials: 'same-origin', cache: 'no-store' });
      const answer = await response.json();
      const next = [Boolean(answer?.heroTokens?.[0]), Boolean(answer?.heroTokens?.[1])];
      if (answer?.success && JSON.stringify(next) !== JSON.stringify(state.sheet.hero.heroTokens)) {
        state.sheet.hero.heroTokens = next;
        state.baseline.hero.heroTokens = [...next];
        renderStatus();
      }
    } catch (_) { /* next time */ }
  }, 4000);
  window.addEventListener('pagehide', () => { live.releaseAll({ beacon: true }); saveSheet({ keepalive: true }); });
}

async function ready() {
  root.dataset.sheetTheme = state.theme;
  document.documentElement.dataset.sheetTheme = state.theme;
  if (!character) { showLoadError('No character chosen.'); return; }
  listen();
  const loaded = await load();
  loadInfo();
  live.start();
  // The sheet is loaded and drawn. The page-start check (vtt ui/__tests__/pages-start.test.mjs) waits for this.
  document.documentElement.dataset.sheetStarted = loaded ? '1' : '0';
}

// Exposed for the page's own tests.
window.SheetApp = { state, saveSheet, moveCard, render, load, live, changeCondition, followToken };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
else ready();
