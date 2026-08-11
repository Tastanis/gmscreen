import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRequestedTestUnits } from '../requested-test-coordinator.js';

const profiles = {
  a: { name: 'A', stats: { might: 2 } },
  b: { name: 'B', stats: { might: 4 } },
  c: { name: 'C', stats: { might: 2 } },
};

const getProfile = async (id) => profiles[id];
const owners = { a: 'alice', b: 'bob', c: 'alice' };
const getOwner = (id) => owners[id];
const targets = Object.keys(profiles).map((id) => ({ id, name: profiles[id].name }));

test('individual requested tests create one routed unit per target', async () => {
  const units = await buildRequestedTestUnits({ attribute: 'Might', rollMode: 'individual', targets }, getProfile, getOwner);
  assert.equal(units.length, 3);
  assert.deepEqual(units.map((unit) => unit.representative.recipientId), ['alice', 'bob', 'alice']);
});

test('singleHighest uses the highest bonus and applies its result to all targets', async () => {
  const units = await buildRequestedTestUnits({ attribute: 'Might', rollMode: 'singleHighest', targets }, getProfile, getOwner);
  assert.equal(units.length, 1);
  assert.equal(units[0].representative.target.id, 'b');
  assert.deepEqual(units[0].members.map((member) => member.target.id), ['a', 'b', 'c']);
});

test('groupByAttribute groups equal stats but keeps different owners separate', async () => {
  const units = await buildRequestedTestUnits({ attribute: 'Might', rollMode: 'groupByAttribute', targets }, getProfile, getOwner);
  assert.equal(units.length, 2);
  assert.deepEqual(units.find((unit) => unit.representative.target.id === 'a').members.map((member) => member.target.id), ['a', 'c']);
});
