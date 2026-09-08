import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';

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
  assert.deepEqual(payload, { success: true, revision: 26 });
});

test('PHP drawing authority enforces ownership and hidden-floor projection', () => {
  const drawingTestPath = fileURLToPath(new URL('../../../../api/v2/tests/drawing-authority.test.php', import.meta.url));
  const database = path.join(tmpdir(), `vtt-drawing-test-${randomUUID()}.sqlite`);
  try {
    const result = spawnSync('php', [...phpArgsForSqlite(), drawingTestPath, database], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(database + suffix)) unlinkSync(database + suffix);
  }
});

test('PHP template authority allows own temporary removal and protects other authors and structures', () => {
  const script = fileURLToPath(new URL('../../../../api/v2/tests/template-authority.test.php', import.meta.url));
  const result = spawnSync('php', [...phpArgsForSqlite(), script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

for (const file of ['primary-projection.test.php', 'player-roster.test.php', 'floor-geometry.test.php', 'floor-movement.test.php', 'airborne-movement.test.php', 'floor-view-lifecycle.test.php', 'scene-checkpoints.test.php']) {
  test(`PHP ${file} validates canonical board behavior`, () => {
    const script = fileURLToPath(new URL(`../../../../api/v2/tests/${file}`, import.meta.url));
    const result = spawnSync('php', [...phpArgsForSqlite(), script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
