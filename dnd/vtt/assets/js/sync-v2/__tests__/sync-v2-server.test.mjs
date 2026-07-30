import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const phpTestPath = fileURLToPath(
  new URL('../../../../api/v2/tests/sync-v2-store.test.php', import.meta.url)
);

function phpArgsForSqlite() {
  const probe = spawnSync('php', ['-r', "echo extension_loaded('pdo_sqlite') ? '1' : '0';"], {
    encoding: 'utf8',
  });
  assert.equal(probe.status, 0, probe.stderr);
  if (probe.stdout.trim() === '1') {
    return [];
  }

  const binaryProbe = spawnSync('php', ['-r', 'echo PHP_BINARY;'], { encoding: 'utf8' });
  assert.equal(binaryProbe.status, 0, binaryProbe.stderr);
  const extensionDir = path.join(path.dirname(binaryProbe.stdout.trim()), 'ext');
  return [
    '-d',
    `extension_dir=${extensionDir}`,
    '-d',
    process.platform === 'win32' ? 'extension=php_pdo_sqlite.dll' : 'extension=pdo_sqlite',
  ];
}

test('PHP Sync V2 store enforces atomic revisions, idempotency, replay, and snapshot recovery', () => {
  const result = spawnSync('php', [...phpArgsForSqlite(), phpTestPath], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload, { success: true, revision: 24 });
});
