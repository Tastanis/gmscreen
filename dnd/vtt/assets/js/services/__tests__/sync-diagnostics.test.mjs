import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSyncDiagnostics,
  exposeSyncDiagnostics,
} from '../sync-diagnostics.js';

test('sync diagnostics records bounded counters without retaining mutable details', () => {
  let timestamp = 100;
  const diagnostics = createSyncDiagnostics({
    now: () => {
      timestamp += 1;
      return timestamp;
    },
    performanceRef: {
      getEntriesByType: () => [{ type: 'navigate' }],
    },
  });
  const details = { reason: 'version-gap', nested: { version: 4 } };

  diagnostics.record('revisionGaps', details);
  details.nested.version = 99;

  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.navigationType, 'navigate');
  assert.equal(snapshot.counters.pageLoads, 1);
  assert.equal(snapshot.counters.pageReloads, 0);
  assert.equal(snapshot.counters.revisionGaps, 1);
  assert.equal(snapshot.recentEvents[0].details.nested.version, 4);
});

test('sync diagnostics detects page reload navigation and resets runtime counters', () => {
  const diagnostics = createSyncDiagnostics({
    now: () => 50,
    performanceRef: {
      getEntriesByType: () => [{ type: 'reload' }],
    },
  });

  diagnostics.record('mapLoads');
  assert.equal(diagnostics.snapshot().counters.pageReloads, 1);
  assert.equal(diagnostics.snapshot().counters.mapLoads, 1);

  const resetSnapshot = diagnostics.reset();
  assert.equal(resetSnapshot.counters.pageLoads, 1);
  assert.equal(resetSnapshot.counters.pageReloads, 1);
  assert.equal(resetSnapshot.counters.mapLoads, 0);
  assert.deepEqual(resetSnapshot.recentEvents, []);
});

test('sync diagnostics exposes a read/reset-only browser API', () => {
  const windowRef = {};
  const api = exposeSyncDiagnostics(windowRef);

  assert.equal(api, windowRef.__VTT_SYNC_DIAGNOSTICS__);
  assert.equal(typeof api.snapshot, 'function');
  assert.equal(typeof api.reset, 'function');
  assert.equal(api.record, undefined);
});
