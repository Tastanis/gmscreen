import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeConditionDurationValue } from '../token-conditions.js';
import { partitionEndOfTurnConditions } from '../../combat/combat-effects.js';

// Build 548, from the automation audit (October 2026), Brandon's answers:
//  - conditions put on by an ability come off when Draw Steel says: "(EoT)" lasts until the end of the target's next
//    turn, or of their current turn if imposed on it; end of encounter ends with combat; until dying and no-suffix
//    conditions stay until removed (they used to become end of turn, never cleared, or save ends, with a save prompt);
//  - damage applied by hand counts as dealt by the selected token, "the same as if the creature selected had just hit
//    them"; with none selected it has no source, and reaches "takes damage" automation either way;
//  - a monster's ability spends Malice when its cost is a Malice cost, any kind of ability; "30 stamina" is not Malice;
//    villain actions cost no Malice. Nothing limits villain actions.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');

test('durations: each kind an ability sends is kept as itself', () => {
  assert.equal(normalizeConditionDurationValue('save-ends'), 'save-ends');
  assert.equal(normalizeConditionDurationValue('end-of-turn'), 'end-of-turn');
  assert.equal(normalizeConditionDurationValue('EoT'), 'end-of-turn');
  assert.equal(normalizeConditionDurationValue('end-of-encounter'), 'end-of-encounter', 'used to become end of turn and never clear');
  assert.equal(normalizeConditionDurationValue('until-dying'), 'until-dying', 'used to become save ends');
  assert.equal(normalizeConditionDurationValue('instantaneous'), 'instantaneous', 'used to become save ends');
  assert.equal(normalizeConditionDurationValue(''), 'save-ends', 'a condition stored with no duration is as before');
});

test('an ability-applied (EoT) condition names its bearer, whose turn ending clears it', () => {
  assert.match(board, /if \(duration === 'end-of-turn'\) \{\s*condition\.duration\.targetTokenId = placementId;/);
  assert.doesNotMatch(board, /condition\.endsOn = /, 'the old caster-keyed field nothing read is gone');
  const slowed = { name: 'slowed', duration: { type: 'end-of-turn', targetTokenId: 'goblin' } };
  const encounter = { name: 'weakened', duration: { type: 'end-of-encounter' } };
  const other = partitionEndOfTurnConditions([slowed, encounter], 'hero', {});
  assert.equal(other.removed.length, 0, 'another creature ending its turn does not clear it');
  const own = partitionEndOfTurnConditions([slowed, encounter], 'goblin', {});
  assert.deepEqual(own.removed.map((c) => c.name), ['slowed'], 'the bearer ending its turn does; end of encounter stays');
});

test('end-of-encounter conditions come off when combat ends, on both combat paths', () => {
  assert.equal((board.match(/clearEndOfEncounterConditions\(\);/g) || []).length, 2);
  assert.match(board, /function clearEndOfEncounterConditions\(\) \{[\s\S]{0,300}getConditionDurationType\(condition\) === 'end-of-encounter'/);
});

test('damage by hand: the selected token is who dealt it, told to automation as a hit', () => {
  assert.match(board, /function manualDamageSourceFor\(targetId\) \{\s*const picked = \[\.\.\.selectedTokenIds\]\.filter\(\(id\) => id && id !== targetId && getPlacementFromStore\(id\)\);\s*return picked\.length === 1 \? picked\[0\] : '';/);
  assert.match(board, /applyManualDamageToPlacement\(placement\.id, action\.amount, action\.damageType \|\| '', \{ sourceId \}\)/);
  assert.match(board, /if \(damage\) \{[\s\S]{0,700}triggerFire\('damage', hit\);\s*triggerFire\('damageDealt', hit\);/, 'taken and dealt, as an automated hit');
  assert.match(board, /sourceId: damageSourceId,\s*before: beforeValue,/, 'reducing a creature to 0 names who did it');
  assert.match(board, /registerAuthoredTriggersForPlacement\(placementId\),\s*damageSourceId \? registerAuthoredTriggersForPlacement\(damageSourceId\) : null,/, "the source's own triggers are ready");
});

const glue = readFileSync(new URL('../monster-ability-runner-glue.js', import.meta.url), 'utf8');
function runtime(initialMalice = 10) {
  const spends = []; let malice = initialMalice;
  const window = {
    confirm: () => true, UIKit: { confirm: async () => true },
    MaliceTracker: { get: () => malice, spend: (n) => { const s = Math.min(n, malice); spends.push(s); malice -= s; return { spent: s, remaining: malice }; }, add: (n) => { malice += n; } },
    AbilityAutomationRunner: { open: async () => ({ completed: true }) },
    VTTBoardCallbacks: { refundTriggeredAction: async () => ({ refunded: true }) },
    dashboardChat: { sendMessage: () => Promise.resolve() },
  };
  vm.runInContext(glue, vm.createContext({ window, console }));
  return { window, spends };
}
const automation = { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] };

test('which costs are Malice', () => {
  const { window } = runtime();
  const parse = window.MonsterAbilityRunner._parseMaliceCost;
  assert.equal(parse('2 Malice', 'action'), 2);
  assert.equal(parse('3+ Malice', 'malice'), 3);
  assert.equal(parse('5 malice', 'maneuver'), 5);
  assert.equal(parse('Free triggered action, 1 Malice manual', 'triggered_action'), 1);
  assert.equal(parse('3', 'malice'), 3, 'a bare number on a Malice ability');
  assert.equal(parse('5+', 'malice'), 5);
  assert.equal(parse('3', 'action'), 0, 'a bare number on anything else is not Malice');
  assert.equal(parse('30 stamina', 'villain_action'), 0);
  assert.equal(parse('30 stamina', 'malice'), 0);
});

test('actions and maneuvers that cost Malice spend it; villain actions spend none', async () => {
  for (const category of ['action', 'maneuver']) {
    const r = runtime();
    await r.window.MonsterAbilityRunner.start({ name: 'Kragen Thornwhisper', attributes: {} }, { name: 'Bone-Salt Jar', resource_cost: '2 Malice', automation }, category, { id: 'kragen' });
    assert.deepEqual(r.spends, [2], category);
  }
  const villain = runtime();
  await villain.window.MonsterAbilityRunner.start({ name: 'Kragen', attributes: {} }, { name: 'Cornered Animal', resource_cost: '3 Malice', automation }, 'villain_action', { id: 'kragen' });
  assert.deepEqual(villain.spends, [], 'a villain action costs no Malice, whatever its card says');
  const stamina = runtime();
  await stamina.window.MonsterAbilityRunner.start({ name: 'Kragen', attributes: {} }, { name: 'Cornered Animal', resource_cost: '30 stamina', automation }, 'malice', { id: 'kragen' });
  assert.deepEqual(stamina.spends, [], '"30 stamina" is not 30 Malice');
  assert.doesNotMatch(glue, /villain[^\n]*(once|per round|limit)/i, 'nothing limits villain actions');
});
