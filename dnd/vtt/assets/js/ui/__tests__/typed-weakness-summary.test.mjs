import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { __testing as characterSummary } from '../character-summary-panel.js';

test('PC summary displays a typed valued weakness and preserves its removal index', () => {
  const conditions = characterSummary.normalizeConditions([
    { name: 'Prone' },
    { name: 'damageWeakness', damageType: 'fire', amount: 5 },
  ]);
  assert.equal(conditions[1].label, 'Fire weakness 5');
  assert.equal(conditions[1].index, 1);
});

test('monster summary displays a typed valued weakness and preserves its removal index', () => {
  const source = fs.readFileSync(
    new URL('../monster-summary-panel.js', import.meta.url),
    'utf8'
  );
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const conditions = context.window.MonsterSummaryPanel.__testing.normalizeConditions([
    { name: 'damageWeakness', damageType: 'cold', amount: 3 },
    { name: 'Dazed' },
  ]);
  assert.equal(conditions[0].label, 'Cold weakness 3');
  assert.equal(conditions[0].index, 0);
});

test('PC and monster summaries explain persistent condition source, rider, and timing', () => {
  const riderCondition = {
    name: 'Grabbed',
    instanceId: 'condition-grabbed-1',
    sourceName: 'Ogre',
    sourceAbility: 'Crushing Grip',
    duration: { type: 'save-ends' },
    riders: [{
      id: 'crushing-grab',
      when: 'turnStart',
      effects: [{ kind: 'damage', amount: 5, damageType: 'fire' }],
    }],
  };
  const pc = characterSummary.normalizeConditions([riderCondition])[0];
  assert.equal(pc.instanceId, 'condition-grabbed-1');
  assert.equal(pc.detail, 'Crushing Grip from Ogre - takes 5 fire damage at start of turn - save ends');

  const source = fs.readFileSync(new URL('../monster-summary-panel.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const monster = context.window.MonsterSummaryPanel.__testing.normalizeConditions([riderCondition])[0];
  assert.equal(monster.instanceId, 'condition-grabbed-1');
  assert.equal(monster.detail, pc.detail);
});
