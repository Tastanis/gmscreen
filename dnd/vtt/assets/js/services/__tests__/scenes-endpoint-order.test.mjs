import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scenesEndpointUrl = new URL('../../../../api/scenes.php', import.meta.url);

test('scene JSON responder is declared before the live request router executes', async () => {
  const source = await readFile(scenesEndpointUrl, 'utf8');
  const helperDeclaration = source.indexOf("if (!function_exists('respondSceneJson'))");
  const liveRequestRouter = source.indexOf("if (!defined('VTT_SCENES_API_INCLUDE_ONLY'))");

  assert.notEqual(helperDeclaration, -1, 'guarded scene JSON responder exists');
  assert.notEqual(liveRequestRouter, -1, 'live scene request router exists');
  assert.ok(
    helperDeclaration < liveRequestRouter,
    'PHP executes the guarded helper declaration before the router can call it'
  );
});

test('unauthenticated scene requests return JSON instead of a fatal helper error', () => {
  const result = spawnSync('php', [fileURLToPath(scenesEndpointUrl)], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    success: false,
    error: 'Authentication required.'
  });
  assert.doesNotMatch(result.stderr, /undefined function respondSceneJson/i);
});
