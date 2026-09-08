import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { reduceCanonicalEvent } from '../event-reducer.js';

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

test('specific-player preview matches player projection without changing state or session', () => {
  const script = fileURLToPath(new URL('../../../../api/v2/tests/player-preview.test.php', import.meta.url));
  const result = spawnSync('php', [...phpArgsForSqlite(), script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('checkpoint layout restore is atomic, scoped, preview-bound and replayable', () => {
  const script = fileURLToPath(new URL('../../../../api/v2/tests/checkpoint-layout.test.php', import.meta.url));
  const result = spawnSync('php', [...phpArgsForSqlite(), script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const { before, after, event, playerEvent } = JSON.parse(result.stdout);
  const reduced = reduceCanonicalEvent(before, event);
  assert.equal(reduced.status, 'applied'); assert.deepEqual(reduced.snapshot.state, after.state);
  assert.equal(reduced.changeSet.sceneRouting, false);
  assert.equal(reduceCanonicalEvent(reduced.snapshot, event).status, 'duplicate');
  const player = reduceCanonicalEvent(before, playerEvent);
  assert.equal(player.status, 'applied');
  assert.equal(JSON.stringify(player.snapshot).includes('/secret-map.jpg'), false);
});

test('scene import commits once, survives catalog interruption, and replays in the browser reducer', () => {
  const script = fileURLToPath(new URL('../../../../api/v2/tests/scene-install.test.php', import.meta.url));
  const result = spawnSync('php', [...phpArgsForSqlite(), script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const { before, after, event, playerEvent } = JSON.parse(result.stdout);
  const reduced = reduceCanonicalEvent(before, event);
  assert.equal(reduced.status, 'applied');
  assert.deepEqual(reduced.snapshot.state, after.state);
  assert.equal(reduced.snapshot.revision, after.revision);
  assert.equal(reduced.changeSet.sceneRouting, false);
  assert.equal(reduced.changeSet.placements.added.length, 2);
  assert.equal(reduceCanonicalEvent(reduced.snapshot, event).status, 'duplicate');
  const player = reduceCanonicalEvent(before, playerEvent);
  assert.equal(player.status, 'applied');
  assert.equal(Object.keys(player.snapshot.state.placements[event.sceneId]).length, 1);
  assert.equal(JSON.stringify(player.snapshot).includes('/secret-token.png'), false);
});

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

for (const file of ['scene-package.test.php', 'floor-follow.test.php', 'primary-projection.test.php', 'player-roster.test.php', 'floor-geometry.test.php', 'floor-movement.test.php', 'airborne-movement.test.php', 'floor-view-lifecycle.test.php', 'scene-checkpoints.test.php']) {
  test(`PHP ${file} validates canonical board behavior`, () => {
    const script = fileURLToPath(new URL(`../../../../api/v2/tests/${file}`, import.meta.url));
    const result = spawnSync('php', [...phpArgsForSqlite(), script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
