import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { footprintGap, followSquare } from '../grab-geometry.mjs';
import { coverFor, footprintSamples } from '../cover-check.mjs';
import { objectRules, entryGaps, creaturesAlong } from '../object-tokens.mjs';
import { buildAutomationTriggerPredicate } from '../automation-trigger-predicate.js';
import { defenseEntriesFromConditions, pickDefense } from '../automation-resistance.js';
import { getPowerRollSuggestions } from '../power-roll-suggestions.js';
import { normalizeMonsterSnapshot } from '../../state/normalize/monsters.js';

// Phase 6 (Brandon, October 2026): grabs drag along and break with a warning; cover ticks its bane; object tokens
// fire on their own; condition events; custom conditions; height. Everything warns, nothing blocks.

const board = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = board.indexOf(start);
  const last = board.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return board.slice(first, last);
}

test('grab geometry: the grabbed creature keeps step with its grabber, or the nearest free square beside it', () => {
  const grabber = { column: 5, row: 5 }, grabberFrom = { column: 3, row: 5 }, grabbed = { column: 2, row: 5 };
  assert.deepEqual(followSquare({ grabber, grabberFrom, grabbed }), { column: 4, row: 5 }, 'moved as far as the grabber');
  const blocked = followSquare({ grabber, grabberFrom, grabbed, others: [{ column: 4, row: 5 }] });
  assert.equal(footprintGap({ ...blocked, width: 1, height: 1 }, grabber), 0, 'still next to the grabber');
  assert.notDeepEqual(blocked, { column: 4, row: 5 });
  assert.equal(footprintGap({ column: 0, row: 0 }, { column: 2, row: 0 }), 1);
  assert.equal(footprintGap({ column: 0, row: 0, width: 2 }, { column: 2, row: 1 }), 0, 'corners touch');
});

test('grabs after a move: the grabber walks and drags; a hand move of the grabbed one ends it; a push apart ends it', async () => {
  const store = new Map([
    ['ogre', { id: 'ogre', name: 'Ogre', column: 5, row: 5 }],
    ['cal', { id: 'cal', name: 'Cal', column: 2, row: 5, conditions: [{ name: 'Grabbed', sourceId: 'ogre' }] }],
  ]);
  const moves = [], ended = [];
  const deps = {
    getPlacementsForActiveScene: () => [...store.values()],
    getPlacementFromStore: (id) => store.get(id),
    ensurePlacementConditions: (list) => (Array.isArray(list) ? list : []),
    removeConditionFromPlacementByCondition: (id) => { ended.push(id); store.get(id).conditions = []; },
    tokenLabel: (p) => p?.name || '', showConditionBanner: () => {}, updateStatus: () => {},
    clampPlacementToBounds: (column, row) => ({ column, row }),
    updatePlacementById: (id, fn) => { const p = store.get(id); fn(p); moves.push([id, p.column, p.row]); return { updated: true }; },
    awaitSuccessfulPlacementSave: async () => {}, renderTokens() {}, boardApi: {}, tokenLayer: null, viewState: {},
    footprintGap, followSquare, Map,
  };
  const make = () => new Function('deps', `with (deps) { ${section('  function grabsOnScene() {', '  // Undoing the grabber')}; return { grabsAfterMove, grabFollows }; }`)(deps);
  let grabs = make();
  await grabs.grabsAfterMove(['ogre'], { dragAlong: true, origins: new Map([['ogre', { column: 3, row: 5 }]]), operationIds: new Map([['ogre', 'op1']]) });
  assert.deepEqual(moves, [['cal', 4, 5]], 'dragged along');
  assert.deepEqual(grabs.grabFollows.get('op1')[0].from, { column: 2, row: 5, levelId: null }, 'kept for Undo');
  await grabs.grabsAfterMove(['cal'], { dragAlong: true, origins: new Map([['cal', { column: 4, row: 5 }]]) });
  assert.deepEqual(ended, ['cal'], 'moved by hand: the grab ends');
  store.get('cal').conditions = [{ name: 'Grabbed', sourceId: 'ogre' }];
  store.get('ogre').column = 9;
  grabs = make();
  await grabs.grabsAfterMove(['ogre'], { dragAlong: false });
  assert.deepEqual(ended, ['cal', 'cal'], 'the grabber pushed apart: ends');
  assert.match(board, /await grabsAfterMove\(movedIds, \{ dragAlong: movementKind === 'walk' \|\| movementKind === 'shift', origins, operationIds \}\);/);
  assert.match(board, /if \(!last\.groupMove\) await undoGrabFollows\(last\.operationId\);/);
});

test('a grab by hand asks who grabs; two grabbers are two grabs', async () => {
  assert.match(board, /if \(conditionName\.toLowerCase\(\) === 'grabbed'\) \{\s*promptGrabberSelection\(targetIds, conditionName, duration\);/);
  const { buildConditionKey } = await import('../token-conditions.js');
  assert.notEqual(buildConditionKey({ name: 'Grabbed', sourceId: 'a', duration: { type: 'save-ends' } }), buildConditionKey({ name: 'Grabbed', sourceId: 'b', duration: { type: 'save-ends' } }));
});

test('cover: half or more hidden = cover; nothing seen = no line of effect; the bane is ticked on for damage', () => {
  const target = { id: 't', column: 4, row: 0 };
  assert.equal(footprintSamples(target).length, 5);
  const leftHalf = (point) => point.x < 4.5;
  assert.deepEqual(coverFor({ actor: { id: 'a', column: 0, row: 0 }, target, see: leftHalf }), { fraction: 0.4, covered: true, noLineOfEffect: false });
  assert.equal(coverFor({ actor: { id: 'a', column: 0, row: 0 }, target, see: () => false }).noLineOfEffect, true);
  assert.equal(coverFor({ actor: { id: 'a', column: 0, row: 0 }, target, see: () => true }).covered, false);
  const roll = (context, cover) => getPowerRollSuggestions({ actor: { id: 'a' }, targets: [{ id: 't', name: 'Imp' }], context, cover }).find((s) => s.id === 'bane-cover');
  assert.equal(roll({ keywords: ['Ranged', 'Strike'] }, { t: { covered: true } }).active, true);
  assert.equal(roll({ keywords: ['Ranged', 'Strike'], dealsDamage: false }, { t: { covered: true } }).active, false, 'only damaging abilities');
  assert.equal(roll({ keywords: ['Ranged', 'Strike'] }, {}).active, false);
  assert.match(board, /No line of effect: a wall blocks it\./);
});

test('object tokens: told by organization or passive; out of the tracker; entering its squares', () => {
  const passives = (monster, kind) => (monster.passives || []).filter((p) => p.kind === kind);
  assert.deepEqual(objectRules({ organization: 'Trap', role: 'Ambusher' }, passives), { inTracker: false });
  assert.deepEqual(objectRules({ organization: 'Solo', passives: [{ kind: 'object', inTracker: true }] }, passives), { inTracker: true });
  assert.equal(objectRules({ organization: 'Hazard', passives: [{ kind: 'object', object: false }] }, passives), null);
  assert.equal(objectRules({ organization: 'Horde', role: 'Brute' }, passives), null);
  const plate = { id: 'plate', column: 5, row: 0 };
  assert.deepEqual(entryGaps(plate, { column: 0, row: 0 }, [], { column: 8, row: 0 }), { startGap: 4, nearestGap: -1 }, 'walked over it');
  const along = creaturesAlong({ column: 0, row: 0 }, [], { column: 6, row: 0 }, [{ id: 'a', column: 3, row: 0 }, { id: 'b', column: 4, row: 1 }, { id: 'c', column: 9, row: 9 }]);
  assert.deepEqual(along, { throughIds: ['a'], adjacentIds: ['b'] });
  assert.match(board, /if \(!objectToken \|\| objectToken\.inTracker\) trackerEntries\.push\(normalized\);/);
  assert.match(board, /&& !objectRulesFor\(watcher\) && !objectRulesFor\(movingPlacement\)\)/, 'no opportunity attacks');
});

test('trigger filters: entersSpace within, targeted keywords, condition names, and walks match "move"', () => {
  const env = { getTeamForPlacementId: () => 'enemy', getJudgedTargetForSource: () => null, getPlacementMark: () => null, getPlacementFromStore: () => null };
  const predicate = (event, filter) => {
    const check = buildAutomationTriggerPredicate({ casterId: 'plate', casterTeam: 'enemy', targetIds: [], freeTriggered: true, match: { event, filter: { whose: 'any', ...filter } } }, env);
    return (_event, payload) => check(payload);
  };
  const entering = (gaps) => ({ placementId: 'cal', perWatcher: new Map([['plate', gaps]]) });
  assert.equal(predicate('entersSpace', { within: 0 })('entersSpace', entering({ startGap: 3, nearestGap: -1 })), true);
  assert.equal(predicate('entersSpace', { within: 0 })('entersSpace', entering({ startGap: 3, nearestGap: 0 })), false, 'only next to it');
  assert.equal(predicate('entersSpace', { within: 1 })('entersSpace', entering({ startGap: 3, nearestGap: 0 })), true, 'within 1 = next to it');
  assert.equal(predicate('entersSpace', { within: 0 })('entersSpace', entering({ startGap: -1, nearestGap: -1 })), false, 'already on it');
  assert.equal(predicate('targeted', { keywordsAny: ['strike'] })('targeted', { targetId: 'x', keywords: ['Melee', 'Strike'] }), true);
  assert.equal(predicate('targeted', { keywordsAny: ['magic'] })('targeted', { targetId: 'x', keywords: ['Strike'] }), false);
  assert.equal(predicate('conditionGained', { conditionName: ['wet'] })('conditionGained', { placementId: 'x', conditionName: 'Wet' }), true);
  assert.equal(predicate('conditionGained', { conditionName: ['wet'] })('conditionGained', { placementId: 'x', conditionName: 'Prone' }), false);
  assert.equal(predicate('move', { verb: 'move' })('move', { placementId: 'x', kind: 'normal' }), true, 'a walk arrives as "normal"');
});

test('condition events come from the one place changes are saved; saves report fail and success', () => {
  const fired = [];
  const notice = new Function('deps', `with (deps) { ${section('  function noticeConditionChanges(', '  // Rules that follow a condition')}; return noticeConditionChanges; }`)({
    ensurePlacementConditions: (list) => (Array.isArray(list) ? list : []), getConditionDurationType: () => 'save-ends',
    queueMicrotask: (fn) => fn(), triggerFire: (event, payload) => fired.push([event, payload.conditionName]), onConditionChangeRules() {}, console,
  });
  notice('cal', { conditions: [{ name: 'Prone' }] }, { conditions: [{ name: 'Wet', sourceId: 'imp' }] });
  assert.deepEqual(fired, [['conditionGained', 'Wet'], ['conditionEnded', 'Prone']]);
  assert.match(board, /noticeConditionChanges\(placementId, beforeSnapshot, afterSnapshot\);/);
  assert.match(board, /triggerFire\('saveFailed', payload\)/);
  assert.match(board, /triggerFire\('saveSucceeded', saved\)/);
});

test('custom conditions: the rule rides on the condition; roll window and damage read it; never used up', () => {
  const rule = { kind: 'conditionRule', name: 'wet', rider: { type: 'rollModifier', modifier: 'bane', side: 'own' }, weakness: { type: 'lightning', amount: 3 }, speedBonus: -2 };
  const apply = new Function('deps', `with (deps) { ${section('  function conditionRuleFor(', '  // ---------- height and flying')}; return applyConditionRule; }`)({
    getPlacementFromStore: () => null, getPlacementsForActiveScene: () => [{ id: 'imp', monster: {} }],
    monsterPassivesOfKind: () => [rule], normalizeStoredConditionRiders: (r) => r, createNewConditionInstanceId: () => 'i1',
  });
  const condition = apply({ name: 'Wet', duration: { type: 'save-ends' } }, 'imp');
  assert.deepEqual([condition.rider.modifier, condition.rider.fromRule, condition.rider.speedBonus, condition.rider.weakness.amount], ['bane', true, -2, 3]);
  const entries = defenseEntriesFromConditions([condition]);
  assert.equal(pickDefense(entries, 'weakness', 'lightning').value, 3);
  const wet = getPowerRollSuggestions({ actor: { id: 'cal', conditions: [condition] }, targets: [{ id: 't', name: 'Imp' }], context: { keywords: ['Strike'], rollEvent: 'powerRoll' } });
  const bane = wet.find((s) => s.label === 'Wet');
  assert.deepEqual([bane.kind, bane.active, bane.consume], ['bane', true, 'manual']);
});

test('monster traits survive being dragged onto the map (their passives with them)', () => {
  const snapshot = normalizeMonsterSnapshot({ id: 'imp', name: 'Imp', traits: [{ name: 'Slippery', description: 'Hard to hold.', automation: { passives: [{ kind: 'movement', grabLimit: 2 }] } }] });
  assert.deepEqual(snapshot.traits, [{ name: 'Slippery', effect: 'Hard to hold.', automation: { passives: [{ kind: 'movement', grabLimit: 2 }] } }]);
});

test('height: a fly buff takes off and lands; vertical moves ask how much goes up; landing is a fall', () => {
  assert.match(board, /if \(condition\?\.rider\?\.fly !== true\) return;\s*if \(eventType === 'conditionGained'\) takeOff\(placementId\);/);
  assert.match(board, /if \(verb !== getAutomationMoveBaseVerb\(verb\) && effectiveDistance > 0\) \{\s*const answer = await askVerticalPart\(/);
  assert.match(section('  async function landToken(', '  // Flies (a buff'), /target\.movementMode = 'ground'; target\.flightHeight = null;/);
});
