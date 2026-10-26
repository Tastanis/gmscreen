import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { staminaState, damageStamina, healStamina, gainTempStamina, staminaBarView, recoveryValueOf } from '../../../../../character_sheet/parts/stamina-math.js';
import { normalizePlacementEntry } from '../../state/normalize/placements.js';
import { calculateHitPointsFillPercentage, formatHitPointsDisplayParts, syncTokenHitPoints, placementTempStamina } from '../token-hit-points.js';
import { broadcastStaminaSync, writeSheetStamina } from '../../services/stamina-sync-service.js';

// Temporary Stamina is its own number (Director's ruling, October 2026, Draw Steel rules): damage takes it first,
// gaining it keeps the higher, healing never touches it, it does not count toward winded or dying, and it ends with
// combat. Older data that kept it as Stamina above the maximum is read the same way.

test('damage eats temporary Stamina first, the rest comes off Stamina', () => {
  assert.deepEqual(damageStamina({ current: 30, max: 40, temp: 5 }, 8), { current: 27, max: 40, temp: 0, absorbed: 5 });
  assert.deepEqual(damageStamina({ current: 30, max: 40, temp: 5 }, 3), { current: 30, max: 40, temp: 2, absorbed: 3 });
  assert.equal(damageStamina({ current: 2, max: 40, temp: 0 }, 9).current, -7, 'a dying hero goes below nought');
});

test('gaining temporary Stamina keeps the higher, never adds', () => {
  assert.equal(gainTempStamina({ current: 30, max: 40, temp: 5 }, 3).temp, 5);
  assert.equal(gainTempStamina({ current: 30, max: 40, temp: 5 }, 9).temp, 9);
  assert.equal(gainTempStamina({ current: 30, max: 40, temp: 5 }, 9).current, 30, 'Stamina itself is not changed');
});

test('healing stops at the maximum and never adds or removes temporary Stamina', () => {
  assert.deepEqual(healStamina({ current: 30, max: 40, temp: 5 }, 50), { current: 40, max: 40, temp: 5 });
  assert.deepEqual(healStamina({ current: 30, max: 40, temp: 0 }, 4), { current: 34, max: 40, temp: 0 });
});

test('Stamina above the maximum (the old way) becomes temporary Stamina, once', () => {
  const old = staminaState({ currentStamina: 47, staminaMax: 40, tempStamina: 2 });
  assert.deepEqual(old, { current: 40, max: 40, temp: 7 });
  assert.deepEqual(staminaState(old), old, 'reading it again changes nothing');
  const token = normalizePlacementEntry({ id: 't1', hp: { current: '45', max: '40' } });
  assert.deepEqual([token.hp.current, token.hp.max, token.tempStamina], ['40', '40', 5]);
  const again = normalizePlacementEntry(token);
  assert.deepEqual([again.hp.current, again.tempStamina], ['40', 5]);
  assert.equal('tempStamina' in normalizePlacementEntry({ id: 't2', hp: { current: '10', max: '40' } }), false, 'no field when there is none');
});

test('winded and dying come from Stamina only; the label shows temporary Stamina after the numbers', () => {
  const view = staminaBarView({ current: 18, max: 36, temp: 5 });
  assert.equal(view.label, '18 / 36 +5');
  assert.equal(view.winded, true);
  assert.equal(view.greenPct, 50);
  assert.equal(Math.round(view.bluePct), 14);
  assert.equal(staminaBarView({ current: 0, max: 36, temp: 10 }).dying, true, 'temporary Stamina does not keep a hero from dying');
  assert.equal(recoveryValueOf({ staminaMax: 61 }), 20);
});

test('the token bar: green from the left for Stamina, blue from the right for temporary Stamina', () => {
  assert.deepEqual(calculateHitPointsFillPercentage({ current: '18', max: '36' }, 9), { percent: 50, negative: false, tempPercent: 25 });
  assert.deepEqual(calculateHitPointsFillPercentage({ current: '45', max: '40' }), { percent: 100, negative: false, tempPercent: 13 }, 'an older token');
  assert.deepEqual(formatHitPointsDisplayParts({ current: '19', max: '36' }, 5), { main: '19 / 36', temp: '+5' });
  assert.equal(placementTempStamina({ tempStamina: 4, hp: { current: '3', max: '9' } }), 4);
  const dom = new JSDOM('<div class="tok"></div>');
  const saved = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const token = dom.window.document.querySelector('.tok');
    syncTokenHitPoints(token, { showHp: true, combatTeam: 'ally', hp: { current: '18', max: '36' }, tempStamina: 9 }, { isGm: true });
    const blue = token.querySelector('.vtt-token__hp-temp-fill');
    assert.ok(blue, 'a blue part is drawn');
    assert.equal(blue.style.width, '25%');
    assert.equal(token.querySelector('.vtt-token__hp-fill').style.width, '50%');
    assert.equal(token.querySelector('.vtt-token__hp-temp-value').textContent, '+5'.replace('5', '9'));
    const css = readFileSync(new URL('../../../css/board.css', import.meta.url), 'utf8');
    assert.match(css, /\.vtt-token__hp-temp-fill \{[^}]*right: 0;/, 'the blue part comes in from the right edge');
  } finally {
    globalThis.document = saved;
  }
});

test('the sync carries temporary Stamina: the broadcast and the token\'s write to the sheet', async () => {
  const posted = [];
  const savedChannel = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = class { postMessage(message) { posted.push(message); } addEventListener() {} close() {} };
  try {
    broadcastStaminaSync({ character: 'cal', currentStamina: 20, staminaMax: 40, tempStamina: 6 });
    assert.equal(posted.at(-1).tempStamina, 6);
  } finally {
    globalThis.BroadcastChannel = savedChannel;
  }
  let sent = null;
  const fetchImpl = async (url, options) => {
    sent = new URLSearchParams(options.body);
    return new Response(JSON.stringify({ success: true, operationId: sent.get('operationId'), currentStamina: 20, tempStamina: 3 }), { headers: { 'Content-Type': 'application/json' } });
  };
  await writeSheetStamina('http://localhost/dnd/character_sheet/handler.php', { character: 'cal', tempStamina: 3 }, { fetchImpl, journalOverride: null, operationId: 'op-1' });
  assert.equal(sent.get('tempStamina'), '3');
  assert.equal(sent.has('delta'), false);
});

test('the board: damage, healing and temporary Stamina follow the rules; temporary Stamina ends with combat', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /import \{ staminaState, damageStamina, healStamina, gainTempStamina \} from '\.\.\/\.\.\/\.\.\/\.\.\/character_sheet\/parts\/stamina-math\.js';/);
  assert.match(board, /if \(after\.temp > 0\) target\.tempStamina = after\.temp;\s*else delete target\.tempStamina;/);
  assert.match(board, /temp: result\.temp,\s*tempChanged: result\.temp !== result\.previousTemp,/, 'the sheet is told the token\'s temporary Stamina');
  assert.match(board, /clearEndOfEncounterConditions\(\);\s*clearTemporaryStaminaAtCombatEnd\('combat-end'\);/);
  assert.equal(board.match(/clearTemporaryStaminaAtCombatEnd\('combat-end'\)/g).length, 2, 'both ways combat ends');
  const clear = board.slice(board.indexOf('async function clearTemporaryStaminaAtCombatEnd('), board.indexOf('async function resetPlayerSurgesToZero('));
  assert.match(clear, /if \(!isGmUser\(\)\) \{\s*return;/);
  assert.match(clear, /delete target\.tempStamina;/);
  assert.match(clear, /body\.set\('tempStamina', '0'\);/);
  assert.doesNotMatch(board, /showHealOverflowPopup\(event, placement, action, \(choice\)/, 'healing no longer offers to become temporary Stamina');
  assert.match(board, /applySheetStaminaToTokens\(characterId, payload\.currentStamina, payload\.staminaMax, payload\.tempStamina\);/);
});
