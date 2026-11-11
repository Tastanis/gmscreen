import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statusHtml } from '../../../../../character_sheet/parts/sheet-parts.js';

// Brandon, November 10, 2026: "[recoveries] while in edit mode. In the character sheet. Need to have the ability to
// tick them up or down, like add or remove a [recovery]." − / + beside the count, in edit mode only.

const sheet = (current) => ({ hero: { name: 'Zepha', vitals: { staminaMax: 30, recoveriesMax: 8, currentRecoveries: current } } });

test('edit mode shows − / + on Recoveries; play mode and the map panel do not', () => {
  const editing = statusHtml(sheet(3), { canEdit: true, editing: true });
  assert.match(editing, /data-character-recovery-delta="-1"/);
  assert.match(editing, /data-character-recovery-delta="1"/);
  assert.match(editing, /data-character-counter="recoveries">3\/8</);
  assert.match(editing, /data-character-recovery title=/, 'Spend recovery stays');
  assert.doesNotMatch(statusHtml(sheet(3), { canEdit: true }), /data-character-recovery-delta/);
  assert.doesNotMatch(statusHtml(sheet(3), { canEdit: false, editing: true }), /data-character-recovery-delta/);
});

test('− is off at nought and + is off at the maximum', () => {
  assert.match(statusHtml(sheet(0), { canEdit: true, editing: true }), /data-character-recovery-delta="-1" aria-label="Remove a recovery" disabled/);
  assert.match(statusHtml(sheet(8), { canEdit: true, editing: true }), /data-character-recovery-delta="1" aria-label="Add a recovery" disabled/);
});

test('the page changes only the count and saves it as a counter', () => {
  const app = readFileSync(new URL('../../../../../character_sheet/app.js', import.meta.url), 'utf8');
  assert.match(app, /hit\('\[data-character-recovery-delta\]'\)\)\) \{\n    if \(!state\.editing\) return;/);
  assert.match(app, /v\.currentRecoveries = max > 0 \? Math\.min\(max, next\) : next;\n    renderStatus\(\); saveSheet\(\); return;/);
  assert.match(app, /canEdit, editing: state\.editing, conditions:/);
});
