import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadStandFirm() {
  const context = { window: {} };
  vm.createContext(context);
  const source = fs.readFileSync(new URL('../stand-firm.js', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return context.window.DrawSteelStandFirm;
}

const standFirm = loadStandFirm();

test('stand firm activates next to an ally and adds stability protection', () => {
  const state = standFirm.resolveStandFirmState({
    placement: { id: 'guard', team: 'ally', column: 5, row: 5, width: 1, height: 1 },
    placements: [
      { id: 'guard', team: 'ally', column: 5, row: 5, width: 1, height: 1 },
      { id: 'shieldmate', team: 'ally', column: 6, row: 5, width: 1, height: 1 },
      { id: 'enemy', team: 'enemy', column: 10, row: 10, width: 1, height: 1 },
    ],
    sheet: {
      features: [{
        title: 'Stand Firm',
        automation: {
          passives: [{ kind: 'standFirm', stabilityBonus: 3, preventConditions: ['prone', 'frightened'] }],
        },
      }],
    },
  });

  assert.equal(state.active, true);
  assert.equal(state.adjacentAlly, true);
  assert.equal(state.stabilityBonus, 3);
  assert.deepEqual(Array.from(state.preventConditions), ['prone', 'frightened']);
  assert.equal(standFirm.conditionPrevented(state, 'Prone'), true);
});

test('stand firm stays inactive without an adjacent ally', () => {
  const state = standFirm.resolveStandFirmState({
    placement: { id: 'guard', team: 'ally', column: 5, row: 5, width: 1, height: 1 },
    placements: [
      { id: 'guard', team: 'ally', column: 5, row: 5, width: 1, height: 1 },
      { id: 'ally-far', team: 'ally', column: 8, row: 5, width: 1, height: 1 },
      { id: 'enemy', team: 'enemy', column: 6, row: 5, width: 1, height: 1 },
    ],
    monster: {
      abilities: {
        passive: [{
          name: 'Stand Firm',
          automation: { passives: [{ kind: 'standFirm' }] },
        }],
      },
    },
  });

  assert.equal(state.active, false);
  assert.equal(state.stabilityBonus, 0);
  assert.equal(standFirm.conditionPrevented(state, 'frightened'), false);
});
