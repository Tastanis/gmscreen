import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConditionRiderBoundaryKey,
  createConditionInstanceId,
  formatConditionRider,
  getPendingConditionRiders,
  markConditionRiderExecuted,
  normalizeStoredConditionRiders,
} from '../normalize/condition-riders.js';
import { normalizePlacementConditions } from '../normalize/placements.js';

const rider = {
  id: 'crushing-grab',
  when: 'turnStart',
  target: 'bearer',
  effects: [{ kind: 'damage', amount: 5, damageType: 'fire' }],
};

test('condition riders are bounded, canonical, and keep a stable legacy instance id', () => {
  const input = [{
    name: 'Grabbed',
    sourceId: 'ogre-1',
    sourceAbility: 'Crushing Grip',
    riders: [
      rider,
      { id: 'unsupported', when: 'roundStart', effects: [{ kind: 'teleport' }] },
    ],
  }];
  const once = normalizePlacementConditions(input);
  const twice = normalizePlacementConditions(JSON.parse(JSON.stringify(once)));
  assert.equal(once.length, 1);
  assert.equal(once[0].riders.length, 1);
  assert.match(once[0].instanceId, /^condition-grabbed-/);
  assert.deepEqual(twice, once);
});

test('same boundary executes once while a later turn remains eligible', () => {
  const condition = {
    name: 'Grabbed',
    instanceId: createConditionInstanceId({ name: 'Grabbed', riders: [rider] }),
    riders: [rider],
  };
  const firstBoundary = buildConditionRiderBoundaryKey({
    encounterId: 'enc-1',
    turnLockId: 100,
    combatantId: 'hero-1',
    when: 'turnStart',
  });
  assert.equal(getPendingConditionRiders(condition, 'turnStart', firstBoundary).length, 1);
  const marked = markConditionRiderExecuted(condition, rider.id, firstBoundary);
  assert.equal(getPendingConditionRiders(marked, 'turnStart', firstBoundary).length, 0);
  const nextBoundary = buildConditionRiderBoundaryKey({
    encounterId: 'enc-1',
    turnLockId: 200,
    combatantId: 'hero-1',
    when: 'turnStart',
  });
  assert.equal(getPendingConditionRiders(marked, 'turnStart', nextBoundary).length, 1);
});

test('sidebar rider wording includes amount, type, and timing', () => {
  assert.equal(formatConditionRider(rider), 'takes 5 fire damage at start of turn');
});

test('malformed and unsupported rider effects are discarded', () => {
  assert.deepEqual(normalizeStoredConditionRiders([
    null,
    { when: 'roundStart', effects: [{ kind: 'damage', amount: 5 }] },
    { when: 'turnStart', effects: [{ kind: 'teleport' }] },
  ]), []);
});
