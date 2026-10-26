import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { planNewFightWipe, restoreRemovedConditions, isShownCondition } from '../../services/condition-sync-service.js';
import { rebasePlacementPatch, rebaseConditionList } from '../../sync-v2/placement-rebase.js';
import { createTokenMovementRuntime } from '../../sync-v2/token-movement-runtime.js';

// Brandon, late October 2026, on leaving a finished fight's map on: "what I don't want it to do is accidentally
// backpropagate if I start a new combat on a different map later ... I kind of want it to wipe them. If a map isn't
// used, then it shouldn't send any signals." And: retry the Director's change after a clash. The delta, scene-order
// and no-signal rules: conditions-merge.test.mjs; the server's halves: api/v2/tests/hero-conditions.test.php and
// sheet-conditions.test.php.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
const response = (status, body) => ({ ok: status < 400, status, json: async () => body, clone() { return this; } });

test('new fight: the heroes\' leftover conditions are cleared from their tokens and sheets, in one line', () => {
  const heroes = [
    { placementId: 'cal-t', profileId: 'cal', name: 'Cal', conditions: [
      { name: 'Slowed', duration: { type: 'save-ends' } },
      { name: 'hiddenEffect', hidden: true, label: 'Curse', duration: { type: 'save-ends' } },
    ] },
    { placementId: 'indigo-t', profileId: 'indigo', name: 'Indigo', conditions: [] },
  ];
  const sheets = new Map([['cal', [{ name: 'Slowed', duration: { type: 'save-ends' } }]], ['indigo', ['Dazed (EOT)']]]);
  const plan = planNewFightWipe(heroes, sheets);
  assert.equal(plan.text, 'New fight: cleared Slowed (Cal), Dazed (Indigo)');
  assert.deepEqual(plan.tokens.get('cal-t').removed, [{ name: 'Slowed', duration: { type: 'save-ends' } }]);
  assert.deepEqual(plan.tokens.get('cal-t').keep.map((c) => c.name), ['hiddenEffect'], 'the Director\'s hidden effect stays');
  assert.equal(plan.tokens.has('indigo-t'), false, 'nothing on Indigo\'s token');
  assert.deepEqual(plan.sheets.get('indigo'), [{ name: 'Dazed', duration: { type: 'end-of-turn' } }], 'an old sheet\'s text, read');
  assert.equal(planNewFightWipe([{ placementId: 'z', profileId: 'zepha', name: 'Zepha', conditions: [] }], new Map()).text, null, 'nothing to clear: no banner');
  assert.equal(isShownCondition({ name: 'Marked', hidden: true, shown: true }), true);
  // Undo puts back exactly what was taken, none twice.
  const back = restoreRemovedConditions([{ name: 'hiddenEffect', hidden: true }], plan.tokens.get('cal-t').removed);
  assert.deepEqual(back.map((c) => c.name), ['hiddenEffect', 'Slowed']);
  assert.equal(restoreRemovedConditions(back, plan.tokens.get('cal-t').removed).length, 2);
});

test('new fight on the board: Start combat wipes on the Director\'s page, with Undo; the heroes\' Stamina is read then', () => {
  assert.match(board, /if \(type === 'combat\.start'\) \{\s*startNewFightCleanSlate\(getActiveSceneId\(\)\);/, 'the live combat: once, on the page that runs the fight\'s effects');
  assert.match(board, /if \(!combatV2Enabled\) \{\s*startNewFightCleanSlate\(startingSceneId\);/, 'without the live combat store');
  const wipe = board.slice(board.indexOf('async function wipeHeroConditionsForNewFight('), board.indexOf('let lastNewFightWipe = null;'));
  assert.match(wipe, /if \(!isGmUser\(\) \|\| !sceneId \|\| sceneId !== getActiveSceneId\(\)\) return null;/);
  assert.match(wipe, /heroProfileOf\(placement\)/, 'heroes only, not monsters');
  assert.match(wipe, /getPlacementsForActiveScene\(\)/, 'this scene only');
  assert.match(wipe, /writeSheetConditionDelta\(endpoint, \{ character: profileId, ops: list\.map\(\(condition\) => \(\{ op: 'remove', condition \}\)\), reason: 'new-fight' \}\)/);
  assert.match(wipe, /showConditionBanner\(plan\.text, \{ tone: 'reminder', action: \{ label: 'Undo', onClick: \(\) => \{ undoNewFightWipe\(record\); \} \} \}\);/);
  const undo = board.slice(board.indexOf('async function undoNewFightWipe('), board.indexOf('function startNewFightCleanSlate('));
  assert.match(undo, /restoreRemovedConditions\(/);
  assert.match(undo, /op: 'add', condition/);
  assert.match(board, /function startNewFightCleanSlate\(sceneId = getActiveSceneId\(\)\) \{[\s\S]{0,400}startActiveScenePcStaminaHydration\(sceneId\)/);
  assert.match(board, /actionButton\.className = 'vtt-condition-banner__action';/, 'the banner carries the Undo button');
});

test('a clash: the change is reapplied once as what it did, on the token as it now is', () => {
  const previous = { id: 't', conditions: [{ name: 'Prone' }], condition: { name: 'Prone' }, hp: { current: '20', max: '30' }, tempStamina: 0, _entityRevision: 3 };
  // The player took Prone off and the Director added Restrained, at once; the player's landed first.
  const current = { ...previous, conditions: [], condition: null, _entityRevision: 4 };
  const directorPatch = { conditions: [{ name: 'Prone' }, { name: 'Restrained', duration: { type: 'end-of-turn' } }], condition: { name: 'Prone' } };
  const rebased = rebasePlacementPatch(previous, current, directorPatch);
  assert.deepEqual(rebased.patch.conditions, [{ name: 'Restrained', duration: { type: 'end-of-turn' } }], 'Restrained added; Prone stays off');
  assert.deepEqual(rebased.patch.condition, { name: 'Restrained', duration: { type: 'end-of-turn' } });
  // 7 damage while somebody healed 5: the damage lands on the healed number.
  const hit = rebasePlacementPatch(previous, { ...previous, hp: { current: '25', max: '30' } }, { hp: { current: '13', max: '30' } });
  assert.deepEqual(hit.patch.hp, { current: '18', max: '30' });
  const heal = rebasePlacementPatch(previous, { ...previous, hp: { current: '28', max: '30' } }, { hp: { current: '26', max: '30' } });
  assert.deepEqual(heal.patch.hp, { current: '30', max: '30' }, 'healing stops at the maximum');
  assert.equal(rebasePlacementPatch(previous, { ...previous, persistentZones: [{ id: 'z' }] }, { persistentZones: [] }), null, 'other fields are not guessed at');
  assert.deepEqual(rebaseConditionList([{ name: 'A' }], [{ name: 'A' }, { name: 'B' }], [{ name: 'A' }, { name: 'C' }]).map((c) => c.name), ['A', 'C', 'B']);
});

test('the clash retry in the sender: refused with 409, refetched, the condition reapplied once, then reported if refused again', async () => {
  for (const failAgain of [false, true]) {
    const original = { id: 'token', conditions: [{ name: 'Prone' }], hp: { current: '20', max: '30' }, _entityRevision: 1 };
    const concurrent = { ...original, conditions: [{ name: 'Prone' }, { name: 'Dazed' }], _entityRevision: 2 };
    const commands = [];
    const runtime = createTokenMovementRuntime({
      enabled: true, placementsEnabled: true, commandsEndpoint: '/commands', snapshotEndpoint: '/snapshot', eventsEndpoint: '/sync', windowRef: {},
      fetchImpl: async (url, options) => {
        if (String(url).includes('snapshot')) return response(200, { success: true, snapshot: { revision: 1, state: { placements: { scene: { token: original } } } } });
        commands.push(JSON.parse(options.body));
        if (commands.length === 1 || failAgain) return response(409, { success: false, error: 'entity_revision_mismatch', snapshot: { revision: 2, state: { placements: { scene: { token: concurrent } } } } });
        return response(200, { success: true, event: { revision: 3, operationId: commands[1].operationId, type: 'placement.batchApplied', payload: { mutations: [] }, serverTime: 1 } });
      },
    });
    const save = runtime.submitPlacementOps([{ type: 'placement.update', sceneId: 'scene', placementId: 'token', patch: { conditions: [{ name: 'Prone' }, { name: 'Restrained' }] } }]);
    if (failAgain) {
      await assert.rejects(save, /clashed with another change/);
      assert.equal(commands.length, 2, 'reapplied once, not more');
    } else {
      await save;
      assert.equal(commands.length, 2);
      const action = commands[1].payload.actions[0];
      assert.equal(action.entityRevision, 2, 'on the fresh token');
      assert.deepEqual(action.patch.conditions, [{ name: 'Prone' }, { name: 'Dazed' }, { name: 'Restrained' }], 'the other person\'s Dazed is kept');
    }
  }
});
