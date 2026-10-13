import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Three small things the tester found while passing Builds 491 to 504, each inside Brandon's list of October 12
// (heroic resources, the sheets, the drawing tool). None was a wrong number; each showed or did something that
// was not what it said.

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('a heroic resource offer reads the sheet as it stands before it shows any numbers', () => {
  // Zepha's page offered "0 -> 2" when her stored Essence was 1 (the gain itself was right: it is an amount).
  const board = read('../board-interactions.js');
  const offer = board.slice(board.indexOf('async function offerHeroicResourceRule('), board.indexOf('async function syncHeroResourceValueForProfile('));
  const fresh = offer.indexOf('characterSummaryCache.delete(profileId);');
  const shown = offer.indexOf('const context = getSheetHeroicResourceContext(sheet, resource);');
  assert.ok(fresh > 0 && shown > fresh, 'the copy this page kept is dropped before the offer is worked out');
  assert.match(offer, /const latest = await getAutomationSheetForPlacement\(placement\.id\)\.catch\(\(\) => null\);\s*if \(latest\?\.hero\?\.resource && typeof latest\.hero\.resource === 'object'\) \{\s*sheet = latest;\s*resource = latest\.hero\.resource;/);
});

test('Use Recovery says what it will really heal, on the sheet and in the map\'s panel', () => {
  // At full Stamina the box said "heal 31 Stamina", spent the Recovery and healed nothing.
  const wording = (room, value) => { const willHeal = Math.min(value, room); return willHeal > 0 ? `Spend 1 recovery to heal ${willHeal} Stamina?` : 'Stamina is already at its maximum. Spend 1 recovery anyway?'; };
  assert.equal(wording(72 - 72, 31), 'Stamina is already at its maximum. Spend 1 recovery anyway?');
  assert.equal(wording(72 - 60, 31), 'Spend 1 recovery to heal 12 Stamina?');
  assert.equal(wording(72 - 10, 31), 'Spend 1 recovery to heal 31 Stamina?');
  const sheet = read('../../../../../character_sheet/sheet.js');
  assert.match(sheet, /const willHeal = Math\.min\(recoveryVal, staminaRoom\);\s*if \(!window\.confirm\(willHeal > 0 \? `Spend 1 recovery to heal \$\{willHeal\} Stamina\?` : "Stamina is already at its maximum\. Spend 1 recovery anyway\?"\)\) \{/);
  assert.match(sheet, /\(Number\(vitals\.staminaMax\) \|\| 0\) > 0 \? Math\.max\(0, Number\(vitals\.staminaMax\) - \(Number\(vitals\.currentStamina\) \|\| 0\)\) : recoveryVal;/, 'a sheet with no maximum heals the whole value');
  const panel = read('../character-summary-panel.js');
  assert.match(panel, /const willHeal = Math\.min\(recoveryValue, staminaRoom\);\s*const spendRecovery = await confirmSummaryAction\(willHeal > 0 \? `Spend 1 recovery to heal \$\{willHeal\} Stamina\?` : 'Stamina is already at its maximum\. Spend 1 recovery anyway\?', \{/);
  assert.doesNotMatch(sheet + panel, /Spend 1 recovery to heal \$\{recovery(?:Val|Value)\} Stamina\?/);
});

test('the eraser rubs out along the line it was swept', () => {
  // A quick swipe is reported every 20 pixels or so; a width-3 stroke crossed between two reports was missed.
  const tool = read('../drawing-tool.js');
  const sweep = tool.slice(tool.indexOf('function continueErasing('), tool.indexOf('function endErasing('));
  assert.match(sweep, /const from = state\.lastErasePoint \|\| point;\s*const reach = Math\.max\(1, state\.strokeWidth \/ 2\);\s*const steps = Math\.min\(200, Math\.ceil\(Math\.hypot\(point\.x - from\.x, point\.y - from\.y\) \/ reach\)\);/);
  assert.match(sweep, /for \(let step = 1; step < steps; step \+= 1\) \{\s*eraseAtPoint\(state, \{ x: from\.x \+ \(point\.x - from\.x\) \* step \/ steps, y: from\.y \+ \(point\.y - from\.y\) \* step \/ steps \}\);\s*\}\s*eraseAtPoint\(state, point\);\s*state\.lastErasePoint = point;/);
  assert.match(tool, /eraseAtPoint\(state, point\);\s*state\.lastErasePoint = point;\s*\}\s*function continueErasing\(/, 'each sweep starts from where the eraser was put down');
  // The same steps, run: a 24-pixel jump with an eraser 3 wide is rubbed at no more than 1.5 pixels apart.
  const visited = [];
  const from = { x: 100, y: 50 }, point = { x: 124, y: 50 }, reach = Math.max(1, 3 / 2);
  const steps = Math.min(200, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / reach));
  for (let step = 1; step < steps; step += 1) visited.push(from.x + (point.x - from.x) * step / steps);
  visited.push(point.x);
  assert.equal(visited.length, 16);
  assert.ok(visited.every((x, index) => x - (index ? visited[index - 1] : from.x) <= reach + 1e-9));
});
