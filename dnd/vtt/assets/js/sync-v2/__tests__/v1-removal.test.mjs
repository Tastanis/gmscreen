import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const vttRoot = path.resolve(testDirectory, '../../../..');

async function source(relativePath) {
  return readFile(path.join(vttRoot, relativePath), 'utf8');
}

async function doesNotExist(relativePath) {
  try {
    await access(path.join(vttRoot, relativePath), constants.F_OK);
    return false;
  } catch {
    return true;
  }
}

test('production bootstrap has no V1 board transport, poller, or snapshot writer', async () => {
  const [bootstrap, interactions, routes] = await Promise.all([
    source('assets/js/bootstrap.js'),
    source('assets/js/ui/board-interactions.js'),
    source('config/routes.php'),
  ]);

  for (const retiredImport of [
    'board-state-service.js',
    'board-state-poller.js',
    'pusher-service.js',
    'board-state-op-applier.js',
    'version-guard.js',
    'authoritative-snapshot.js',
  ]) {
    assert.equal(
      bootstrap.includes(`from './services/${retiredImport}'`)
        || interactions.includes(`from '../services/${retiredImport}'`)
        || interactions.includes(`from '../state/${retiredImport}'`),
      false,
      `${retiredImport} must not be imported by the production VTT`
    );
  }

  assert.equal(bootstrap.includes('fetchBoardState('), false);
  assert.equal(interactions.includes('boardApi.subscribe(applyStateToBoard)'), false);
  assert.equal(interactions.includes('const pusherReady = initializePusherSync()'), false);
  assert.equal(interactions.includes('startBoardStatePoller();'), false);
  assert.equal(routes.includes("'state'"), false);
});

test('retired V1 synchronization modules are absent and the old endpoint is closed', async () => {
  for (const retiredPath of [
    'assets/js/services/board-state-service.js',
    'assets/js/services/board-state-poller.js',
    'assets/js/services/pusher-service.js',
    'assets/js/services/board-state-op-applier.js',
    'assets/js/state/version-guard.js',
    'assets/js/state/authoritative-snapshot.js',
  ]) {
    assert.equal(await doesNotExist(retiredPath), true, `${retiredPath} must remain removed`);
  }

  const retiredEndpoint = await source('api/state.php');
  assert.match(retiredEndpoint, /http_response_code\(410\)/);
  assert.match(retiredEndpoint, /V1 board-state endpoint has been retired/);
});
