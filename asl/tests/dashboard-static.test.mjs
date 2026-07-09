import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dashboard = fs.readFileSync(new URL('../dashboard.php', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../teacher/settings.php', import.meta.url), 'utf8');

test('dashboard uses one chart stage with three selectors', () => {
  assert.equal((dashboard.match(/class="student-section analytics-section chart-stage"/g) || []).length, 1);
  assert.equal((dashboard.match(/data-chart-select="/g) || []).length, 3);
  assert.match(dashboard, /setActiveChart\('progress'\)/);
});

test('unified dashboard does not expose legacy Bingo', () => {
  assert.doesNotMatch(dashboard, />Bingo</);
  assert.doesNotMatch(dashboard, /\/bingo\.php/);
});

test('pace outcomes and calendar-only settings are fixed', () => {
  assert.match(dashboard, /pace_red_goal \|\| 2\.75/);
  assert.match(dashboard, /pace_blue_goal \|\| 3\.25/);
  assert.match(dashboard, /pace_green_goal \|\| 3/);
  assert.match(dashboard, /totalInstructionalDays/);
  assert.doesNotMatch(settings, /name="year_start"|name="year_end"|name="pace_green_goal"|name="pace_blue_goal"|name="pace_red_goal"/);
});
