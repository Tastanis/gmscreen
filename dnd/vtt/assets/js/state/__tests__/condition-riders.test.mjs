import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConditionRiderBoundaryKey,
  createConditionInstanceId,
  formatConditionRider,
  getPendingConditionRiders,
  markConditionRiderExecuted,
  normalizeStoredConditionRiders,
  normalizeRiderZone,
  riderZoneVerdict,
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

test('a rider can be bound to a terrain zone, and the binding survives being stored', () => {
  assert.deepEqual(normalizeRiderZone('Blood'), { tags: ['blood'] });
  assert.deepEqual(normalizeRiderZone({ tag: 'Deep Water' }), { tags: ['deep-water'] });
  assert.deepEqual(normalizeRiderZone({ tags: ['blood', 'WATER', 'blood'], adjacent: true }), { tags: ['blood', 'water'], adjacent: true });
  assert.deepEqual(normalizeRiderZone({ tag: 'blood', adjacent: 'yes' }), { tags: ['blood'] }, 'adjacent must be exactly true');
  for (const empty of [null, undefined, false, '', {}, { tags: [] }, { tag: '  ' }, 7]) assert.equal(normalizeRiderZone(empty), null);
  const zoned = { ...rider, zone: { tag: 'Blood' } };
  const [stored] = normalizeStoredConditionRiders([zoned]);
  assert.deepEqual(stored.zone, { tags: ['blood'] });
  assert.deepEqual(normalizeStoredConditionRiders([stored]), [stored], 'storing it again changes nothing');
  assert.equal('zone' in normalizeStoredConditionRiders([rider])[0], false, 'a rider with no zone gains none');
  assert.equal('zone' in normalizeStoredConditionRiders([{ ...rider, zone: {} }])[0], false);
  // It survives the token's own condition normalizer, and reads plainly.
  const [condition] = normalizePlacementConditions([{ name: 'Grabbed', sourceId: 'kragen', riders: [{ ...zoned, zone: { tags: ['blood'], adjacent: true } }] }]);
  assert.deepEqual(condition.riders[0].zone, { tags: ['blood'], adjacent: true });
  assert.equal(formatConditionRider(stored), 'takes 5 fire damage at start of turn while in blood');
  assert.equal(formatConditionRider(condition.riders[0]), 'takes 5 fire damage at start of turn while in or next to blood');
  assert.equal(formatConditionRider(rider), 'takes 5 fire damage at start of turn');
});

test('a zone-bound rider is tested each time it comes up: act, skip, or act with a warning', () => {
  const inBlood = { ...rider, zone: { tags: ['blood', 'water'] } };
  assert.deepEqual(riderZoneVerdict(rider, ['mud']), { skip: false, unknown: false, where: '' }, 'no zone on the rider: it always acts');
  assert.deepEqual(riderZoneVerdict(rider, null), { skip: false, unknown: false, where: '' });
  assert.deepEqual(riderZoneVerdict(inBlood, ['blood']), { skip: false, unknown: false, where: 'in blood or water' });
  assert.deepEqual(riderZoneVerdict(inBlood, ['mud', 'Water ']), { skip: false, unknown: false, where: 'in blood or water' }, 'any one of its tags');
  assert.deepEqual(riderZoneVerdict(inBlood, ['mud']), { skip: true, unknown: false, where: 'in blood or water' }, 'dragged out of the blood: nothing happens');
  assert.deepEqual(riderZoneVerdict(inBlood, []), { skip: true, unknown: false, where: 'in blood or water' }, 'on dry ground');
  // The board cannot say (a scene with no zones): it acts, and the table is told the condition.
  assert.deepEqual(riderZoneVerdict(inBlood, null), { skip: false, unknown: true, where: 'in blood or water' });
  assert.equal(riderZoneVerdict({ ...rider, zone: { tag: 'blood', adjacent: true } }, []).where, 'in or next to blood');
  // Turn after turn: out, then back in.
  const turns = [['blood'], [], [], ['blood']].map((tags) => !riderZoneVerdict(inBlood, tags).skip);
  assert.deepEqual(turns, [true, false, false, true]);
});
