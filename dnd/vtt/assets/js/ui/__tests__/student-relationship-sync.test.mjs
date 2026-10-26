import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// The Students page's save finds a hero's campaign relationship for the student by id, or an older entry with no id by
// name (October 2026: each save added a second entry instead). The PHP half: api/v2/tests/student-relationship-sync.test.php.
test('a Students page save updates the hero\'s relationship linked by name, never adds a second one', () => {
  const script = fileURLToPath(new URL('../../../../api/v2/tests/student-relationship-sync.test.php', import.meta.url));
  const result = spawnSync('php', [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /student relationship sync: ok/);
});
