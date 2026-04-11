import { test } from 'node:test';
import assert from 'node:assert/strict';

const modulePromise = import('../board-interactions.js');

test('board state poller skips remote snapshots while a save is pending', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const boardStateContainer = {
    boardState: { placements: { token: { x: 2 } } },
    user: { name: 'GM User', isGM: true },
  };

  const mergeCalls = [];
  const appliedSnapshots = [];

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      mutator(boardStateContainer);
      appliedSnapshots.push(boardStateContainer.boardState);
    },
  };

  const staleSnapshot = { placements: { token: { x: 1 } } };
  const fetchResponses = [
    {
      ok: true,
      json: async () => ({ data: { boardState: staleSnapshot } }),
    },
  ];

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn: async () => {
      const response = fetchResponses.shift();
      if (!response) {
        throw new Error('No fetch response queued');
      }
      return response;
    },
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => {
      try {
        return JSON.stringify(snapshot);
      } catch (error) {
        return null;
      }
    },
    safeJsonStringifyFn: (value) => {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return null;
      }
    },
    mergeBoardStateSnapshotFn: (existing, incoming) => {
      mergeCalls.push({ existing, incoming });
      return incoming;
    },
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : null),
    getPendingSaveInfo: () => ({ pending: true }),
    getLastPersistedHashFn: () => 'hash-new',
    getLastPersistedSignatureFn: () => 'sig-new',
  });

  await poller.poll();

  assert.equal(fetchResponses.length, 0);
  assert.equal(mergeCalls.length, 0);
  assert.deepEqual(boardStateContainer.boardState, { placements: { token: { x: 2 } } });
});

test('board state poller stays blocked when a save failed until the retry succeeds', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const boardStateContainer = {
    boardState: { placements: { token: { x: 0 } } },
    user: { name: 'GM User', isGM: true },
  };

  const mergeCalls = [];
  const appliedSnapshots = [];

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      mutator(boardStateContainer);
      appliedSnapshots.push(boardStateContainer.boardState);
    },
  };

  const snapshots = [
    { placements: { token: { x: 1 } }, metadata: { signature: 'sig-1' } },
    { placements: { token: { x: 3 } }, metadata: { signature: 'sig-2' } },
  ];

  const fetchResponses = snapshots.map((snapshot) => ({
    ok: true,
    json: async () => ({ data: { boardState: snapshot } }),
  }));

  const pendingStates = [
    { pending: false, blocking: true, signature: 'sig-1', hash: 'hash-1' },
    { pending: false, blocking: false },
  ];

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn: async () => {
      const response = fetchResponses.shift();
      if (!response) {
        throw new Error('No fetch response queued');
      }
      return response;
    },
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (existing, incoming) => {
      mergeCalls.push({ existing, incoming });
      return incoming;
    },
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : null,
    getPendingSaveInfo: () => pendingStates.shift() ?? { pending: false },
    getLastPersistedHashFn: () => 'hash-new',
    getLastPersistedSignatureFn: () => 'sig-new',
  });

  await poller.poll();

  assert.equal(fetchResponses.length, 1);
  assert.equal(mergeCalls.length, 0);
  assert.equal(appliedSnapshots.length, 0);
  assert.deepEqual(boardStateContainer.boardState, { placements: { token: { x: 0 } } });

  await poller.poll();

  assert.equal(fetchResponses.length, 0);
  assert.equal(mergeCalls.length, 1);
  assert.equal(appliedSnapshots.length, 1);
  assert.deepEqual(boardStateContainer.boardState, {
    placements: { token: { x: 3 } },
    metadata: { signature: 'sig-2' },
  });
});

test('board state poller applies remote snapshots when no save is pending', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const boardStateContainer = {
    boardState: { placements: { token: { x: 0 } } },
    user: { name: 'GM User', isGM: true },
  };

  let appliedSnapshot = null;

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      mutator(boardStateContainer);
      appliedSnapshot = boardStateContainer.boardState;
    },
  };

  const remoteSnapshot = { placements: { token: { x: 5 } } };

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: remoteSnapshot } }) }),
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: () => remoteSnapshot,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : null),
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
  });

  await poller.poll();

  assert.deepEqual(appliedSnapshot, remoteSnapshot);
});

test('gm clients accept newer player-authored snapshots when theirs is older', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const boardStateContainer = {
    boardState: {
      placements: { token: { x: 0 } },
      metadata: {
        authorIsGm: true,
        updatedAt: 100,
        signature: 'current-sig',
      },
    },
  };

  let appliedSnapshot = null;

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      mutator(boardStateContainer);
      appliedSnapshot = boardStateContainer.boardState;
    },
  };

  const remoteSnapshot = {
    placements: { token: { x: 5 } },
    metadata: {
      authorIsGm: false,
      updatedAt: 101,
      signature: 'incoming-sig',
    },
  };

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: remoteSnapshot } }) }),
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: () => remoteSnapshot,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : null),
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
  });

  await poller.poll();

  assert.deepEqual(appliedSnapshot, remoteSnapshot);
});

test('gm clients sync player placement position changes even when gm has authoritative state', async () => {
  const { createBoardStatePoller } = await modulePromise;

  // GM has authoritative state with same timestamp and signature as server
  // This simulates the case where GM made changes and server hasn't updated metadata
  // but a player has moved their token
  const boardStateContainer = {
    boardState: {
      placements: {
        'scene-1': [
          { id: 'token-1', column: 0, row: 0, name: 'Player Token' },
          { id: 'token-2', column: 5, row: 5, name: 'GM Token' },
        ],
      },
      metadata: {
        authorIsGm: true,
        authorRole: 'gm',
        updatedAt: 1000,
        signature: 'gm-sig-1000',
      },
    },
  };

  const updateCalls = [];

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      mutator(boardStateContainer);
      updateCalls.push(JSON.parse(JSON.stringify(boardStateContainer.boardState)));
    },
  };

  // Server has same metadata (GM authored) but player has moved their token
  const remoteSnapshot = {
    placements: {
      'scene-1': [
        { id: 'token-1', column: 3, row: 4, name: 'Player Token' }, // Player moved their token
        { id: 'token-2', column: 5, row: 5, name: 'GM Token' },
      ],
    },
    metadata: {
      authorIsGm: true,
      authorRole: 'gm',
      updatedAt: 1000,  // Same timestamp - server metadata not updated for player-only change
      signature: 'gm-sig-1000', // Same signature
    },
  };

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: remoteSnapshot } }) }),
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (existing, incoming) => incoming,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : null),
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
  });

  await poller.poll();

  // The fix should have applied the position update for token-1
  assert.equal(updateCalls.length, 1, 'updateState should have been called once');

  const updatedPlacements = boardStateContainer.boardState.placements['scene-1'];
  const token1 = updatedPlacements.find(t => t.id === 'token-1');
  const token2 = updatedPlacements.find(t => t.id === 'token-2');

  // Player token should have moved to new position
  assert.equal(token1.column, 3, 'token-1 column should be updated to 3');
  assert.equal(token1.row, 4, 'token-1 row should be updated to 4');

  // GM token should remain unchanged
  assert.equal(token2.column, 5, 'token-2 column should remain 5');
  assert.equal(token2.row, 5, 'token-2 row should remain 5');

  // Metadata should remain unchanged (GM authoritative)
  assert.equal(boardStateContainer.boardState.metadata.authorIsGm, true);
  assert.equal(boardStateContainer.boardState.metadata.updatedAt, 1000);
});

test('gm clients do not update on second poll when no changes', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const boardStateContainer = {
    boardState: {
      placements: {
        'scene-1': [
          { id: 'token-1', column: 3, row: 4, name: 'Player Token' },
        ],
      },
      metadata: {
        authorIsGm: true,
        authorRole: 'gm',
        updatedAt: 1000,
        signature: 'gm-sig-1000',
      },
    },
  };

  const updateCalls = [];

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      mutator(boardStateContainer);
      updateCalls.push(JSON.parse(JSON.stringify(boardStateContainer.boardState)));
    },
  };

  // Server has same placements - no position changes
  const remoteSnapshot = {
    placements: {
      'scene-1': [
        { id: 'token-1', column: 3, row: 4, name: 'Player Token' }, // Same position
      ],
    },
    metadata: {
      authorIsGm: true,
      authorRole: 'gm',
      updatedAt: 1000,
      signature: 'gm-sig-1000',
    },
  };

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: remoteSnapshot } }) }),
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (existing, incoming) => incoming,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : null),
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
  });

  // First poll sets the lastHash
  await poller.poll();
  assert.equal(updateCalls.length, 1, 'first poll should call updateState');

  // Second poll with same content should skip due to hash match
  await poller.poll();
  assert.equal(updateCalls.length, 1, 'second poll with identical content should not call updateState');
});

test('mergeBoardStateSnapshot merges placements by ID with timestamp-based conflict resolution', async () => {
  const { createBoardStatePoller } = await modulePromise;

  // Get the actual merge function by creating a poller and tracking what merge fn it uses
  let capturedMergeFn = null;

  const boardStateContainer = {
    boardState: {
      placements: {
        'scene-1': [
          { id: 'token-1', column: 0, row: 0, _lastModified: 1000 },
          { id: 'token-2', column: 5, row: 5, _lastModified: 1000 },
        ],
      },
    },
  };

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => mutator(boardStateContainer),
  };

  // Incoming state has token-1 moved (newer timestamp) and token-2 with older timestamp
  const remoteSnapshot = {
    placements: {
      'scene-1': [
        { id: 'token-1', column: 3, row: 4, _lastModified: 2000 }, // Newer - should win
        { id: 'token-2', column: 10, row: 10, _lastModified: 500 }, // Older - should lose
      ],
    },
  };

  // We need to access the internal merge function - create poller with defaults
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  // Test the merge
  const existing = boardStateContainer.boardState;
  const merged = mergeBoardStateSnapshot(existing, remoteSnapshot);

  const token1 = merged.placements['scene-1'].find(t => t.id === 'token-1');
  const token2 = merged.placements['scene-1'].find(t => t.id === 'token-2');

  // Token 1 should have the new position (incoming timestamp 2000 > existing 1000)
  assert.equal(token1.column, 3, 'token-1 should have incoming column (newer timestamp)');
  assert.equal(token1.row, 4, 'token-1 should have incoming row (newer timestamp)');

  // Token 2 should keep the old position (existing timestamp 1000 > incoming 500)
  assert.equal(token2.column, 5, 'token-2 should keep existing column (newer timestamp)');
  assert.equal(token2.row, 5, 'token-2 should keep existing row (newer timestamp)');
});

test('mergeBoardStateSnapshot preserves existing placements not in incoming', async () => {
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  const existing = {
    placements: {
      'scene-1': [
        { id: 'token-1', column: 0, row: 0, _lastModified: 1000 },
        { id: 'token-2', column: 5, row: 5, _lastModified: 1000 },
        { id: 'token-3', column: 10, row: 10, _lastModified: 1000 },
      ],
    },
  };

  // Incoming only has token-1 (delta update scenario)
  const incoming = {
    placements: {
      'scene-1': [
        { id: 'token-1', column: 3, row: 4, _lastModified: 2000 },
      ],
    },
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  // All three tokens should be present
  assert.equal(merged.placements['scene-1'].length, 3, 'all tokens should be preserved');

  const token1 = merged.placements['scene-1'].find(t => t.id === 'token-1');
  const token2 = merged.placements['scene-1'].find(t => t.id === 'token-2');
  const token3 = merged.placements['scene-1'].find(t => t.id === 'token-3');

  // Token 1 updated
  assert.equal(token1.column, 3);
  assert.equal(token1.row, 4);

  // Tokens 2 and 3 preserved
  assert.equal(token2.column, 5);
  assert.equal(token2.row, 5);
  assert.equal(token3.column, 10);
  assert.equal(token3.row, 10);
});

test('mergeBoardStateSnapshot preserves grid settings from existing sceneState', async () => {
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  // Existing state has a custom grid size (128px)
  const existing = {
    activeSceneId: 'scene-1',
    mapUrl: 'http://example.com/map.png',
    placements: {
      'scene-1': [
        { id: 'token-1', column: 0, row: 0, _lastModified: 1000 },
      ],
    },
    sceneState: {
      'scene-1': {
        grid: { size: 128, locked: true, visible: true },
        combat: { active: false },
      },
    },
  };

  // Incoming state has default grid size (64px) - this simulates a stale sync
  const incoming = {
    _fullSync: true,
    activeSceneId: 'scene-1',
    mapUrl: 'http://example.com/map.png',
    placements: {
      'scene-1': [
        { id: 'token-1', column: 0, row: 0, _lastModified: 1000 },
      ],
    },
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        combat: { active: true, round: 1 },
      },
    },
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  // CRITICAL: Grid should be preserved from existing state, NOT replaced with incoming
  assert.equal(
    merged.sceneState['scene-1'].grid.size,
    128,
    'grid size should be preserved from existing state (128), not incoming (64)'
  );
  assert.equal(
    merged.sceneState['scene-1'].grid.locked,
    true,
    'grid locked should be preserved from existing state'
  );

  // Combat state SHOULD be updated from incoming (it's transient state that should sync)
  assert.equal(
    merged.sceneState['scene-1'].combat.active,
    true,
    'combat state should be updated from incoming'
  );
  assert.equal(
    merged.sceneState['scene-1'].combat.round,
    1,
    'combat round should be updated from incoming'
  );
});

test('mergeBoardStateSnapshot preserves grid for scenes not in incoming', async () => {
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  // Existing state has two scenes with custom grid sizes
  const existing = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 128, locked: false, visible: true },
      },
      'scene-2': {
        grid: { size: 96, locked: true, visible: false },
      },
    },
  };

  // Incoming only has scene-1 data
  const incoming = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        combat: { active: true },
      },
    },
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  // Scene-1 grid should be preserved from existing (128), not incoming (64)
  assert.equal(
    merged.sceneState['scene-1'].grid.size,
    128,
    'scene-1 grid should be preserved from existing'
  );

  // Scene-2 should be completely preserved (not in incoming)
  assert.equal(
    merged.sceneState['scene-2'].grid.size,
    96,
    'scene-2 should be preserved from existing'
  );
  assert.equal(
    merged.sceneState['scene-2'].grid.locked,
    true,
    'scene-2 locked state should be preserved'
  );
});

test('mergeBoardStateSnapshot preserves fogOfWar when incoming has no fogOfWar', async () => {
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  // Existing state has fogOfWar with revealed cells
  const existing = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        fogOfWar: {
          enabled: true,
          revealedCells: { '0,0': true, '1,1': true, '3,5': true },
        },
      },
    },
  };

  // Incoming state has overlay changes but no fogOfWar data
  const incoming = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        overlay: { mapUrl: 'overlay.png', layers: [] },
      },
    },
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  // fogOfWar should be preserved from existing state
  assert.ok(
    merged.sceneState['scene-1'].fogOfWar,
    'fogOfWar should be preserved when incoming has no fogOfWar'
  );
  assert.equal(
    merged.sceneState['scene-1'].fogOfWar.enabled,
    true,
    'fogOfWar.enabled should be preserved from existing'
  );
  assert.deepStrictEqual(
    merged.sceneState['scene-1'].fogOfWar.revealedCells,
    { '0,0': true, '1,1': true, '3,5': true },
    'fogOfWar.revealedCells should be preserved from existing'
  );
});

test('mergeBoardStateSnapshot uses incoming fogOfWar when present', async () => {
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  // Existing state has old fogOfWar data
  const existing = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        fogOfWar: {
          enabled: true,
          revealedCells: { '0,0': true },
        },
      },
    },
  };

  // Incoming has updated fogOfWar
  const incoming = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        fogOfWar: {
          enabled: true,
          revealedCells: { '0,0': true, '2,2': true, '4,4': true },
        },
      },
    },
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  // Should use incoming fogOfWar since it has the data
  assert.deepStrictEqual(
    merged.sceneState['scene-1'].fogOfWar.revealedCells,
    { '0,0': true, '2,2': true, '4,4': true },
    'should use incoming fogOfWar when it has data'
  );
});

test('mergeBoardStateSnapshot preserves fogOfWar during overlay toggle cycle', async () => {
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  // Simulate: user has fog setup, then toggles overlay visibility
  // This creates a delta save that only includes overlay changes
  const existing = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        fogOfWar: {
          enabled: true,
          revealedCells: { '1,1': true, '2,2': true, '3,3': true },
        },
        overlay: { layers: [{ id: 'l1', visible: true }] },
      },
    },
  };

  // Delta save: overlay changed but no fogOfWar included
  const incoming = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        overlay: { layers: [{ id: 'l1', visible: false }] },
      },
    },
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  // fogOfWar MUST be preserved
  assert.ok(merged.sceneState['scene-1'].fogOfWar, 'fogOfWar must survive overlay toggle');
  assert.equal(merged.sceneState['scene-1'].fogOfWar.enabled, true);
  assert.deepStrictEqual(
    merged.sceneState['scene-1'].fogOfWar.revealedCells,
    { '1,1': true, '2,2': true, '3,3': true },
    'all revealed cells must survive overlay toggle'
  );

  // Overlay should reflect the incoming change
  assert.equal(
    merged.sceneState['scene-1'].overlay.layers[0].visible,
    false,
    'overlay visibility should be updated from incoming'
  );
});

test('mergeBoardStateSnapshot preserves fogOfWar for scenes not in incoming', async () => {
  const { mergeBoardStateSnapshot } = await import('../board-interactions.js');

  const existing = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        fogOfWar: { enabled: true, revealedCells: { '5,5': true } },
      },
      'scene-2': {
        grid: { size: 96, locked: false, visible: true },
        fogOfWar: { enabled: true, revealedCells: { '10,10': true } },
      },
    },
  };

  // Incoming only has scene-1 data (e.g., delta save)
  const incoming = {
    activeSceneId: 'scene-1',
    sceneState: {
      'scene-1': {
        grid: { size: 64, locked: false, visible: true },
        fogOfWar: { enabled: true, revealedCells: { '5,5': true } },
      },
    },
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  // Scene-2 should be fully preserved (not in incoming)
  assert.ok(merged.sceneState['scene-2'], 'scene-2 should be preserved');
  assert.ok(merged.sceneState['scene-2'].fogOfWar, 'scene-2 fogOfWar should be preserved');
  assert.deepStrictEqual(
    merged.sceneState['scene-2'].fogOfWar.revealedCells,
    { '10,10': true },
    'scene-2 fogOfWar revealedCells should be preserved'
  );
});

// ---------------------------------------------------------------------------
// Phase 1-2: dynamic poller interval reconfiguration
// ---------------------------------------------------------------------------
//
// These tests cover the reconfigure() method that handlePusherConnectionChange
// uses to switch the poller between fallback mode (Pusher down, 1s interval)
// and safety-net mode (Pusher up, 30s interval). See
// docs/vtt-sync-refactor/phase-1-2-dynamic-poller.md.

function createIntervalSpyWindow() {
  // Minimal window stub that records every setInterval / clearInterval call
  // so the tests can assert on how often (and with what interval) the poller
  // reschedules itself.
  let nextId = 1;
  const setCalls = [];
  const clearCalls = [];
  const windowRef = {
    setInterval(fn, ms) {
      const id = nextId++;
      setCalls.push({ id, ms, fn });
      return id;
    },
    clearInterval(id) {
      clearCalls.push(id);
    },
  };
  return { windowRef, setCalls, clearCalls };
}

function createReconfigurePoller({
  createBoardStatePoller,
  isPusherConnectedFn,
  windowRef,
  fetchFn,
} = {}) {
  const boardStateContainer = {
    boardState: { placements: {} },
    user: { name: 'GM User', isGM: true },
  };

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => mutator(boardStateContainer),
  };

  return createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn,
    windowRef,
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (existing, incoming) => incoming ?? existing,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : null,
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
    isPusherConnectedFn,
  });
}

test('board state poller starts in fallback mode (1s) when Pusher is down', async () => {
  const { createBoardStatePoller } = await modulePromise;
  const { windowRef, setCalls } = createIntervalSpyWindow();

  const fetchCalls = [];
  const fetchFn = async () => {
    fetchCalls.push(Date.now());
    return { ok: true, json: async () => ({ data: { boardState: {} } }) };
  };

  const poller = createReconfigurePoller({
    createBoardStatePoller,
    isPusherConnectedFn: () => false,
    windowRef,
    fetchFn,
  });

  const handle = poller.start();
  // Yield to let the immediate poll resolve so test output is deterministic.
  await Promise.resolve();

  assert.equal(setCalls.length, 1, 'setInterval called once on start()');
  assert.equal(setCalls[0].ms, 1000, 'fallback mode uses 1s interval');
  assert.equal(typeof handle.reconfigure, 'function', 'handle exposes reconfigure()');
});

test('board state poller starts in safety-net mode (30s) when Pusher is up', async () => {
  const { createBoardStatePoller } = await modulePromise;
  const { windowRef, setCalls } = createIntervalSpyWindow();

  const poller = createReconfigurePoller({
    createBoardStatePoller,
    isPusherConnectedFn: () => true,
    windowRef,
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: {} } }) }),
  });

  poller.start();
  await Promise.resolve();

  assert.equal(setCalls.length, 1, 'setInterval called once on start()');
  assert.equal(setCalls[0].ms, 30000, 'safety-net mode uses 30s interval');
});

test('reconfigure({ pusherConnected: true }) switches poller to 30s safety-net mode', async () => {
  const { createBoardStatePoller } = await modulePromise;
  const { windowRef, setCalls, clearCalls } = createIntervalSpyWindow();

  const poller = createReconfigurePoller({
    createBoardStatePoller,
    isPusherConnectedFn: () => false,
    windowRef,
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: {} } }) }),
  });

  const handle = poller.start();
  await Promise.resolve();

  // Starting in fallback mode: one setInterval call at 1000ms.
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0].ms, 1000);
  assert.equal(clearCalls.length, 0);

  handle.reconfigure({ pusherConnected: true });
  await Promise.resolve();

  // Reconfigure must clear the old interval and create a new 30s one.
  assert.equal(clearCalls.length, 1, 'clearInterval called when mode changes');
  assert.equal(clearCalls[0], setCalls[0].id, 'old interval id was cleared');
  assert.equal(setCalls.length, 2, 'setInterval called again for new interval');
  assert.equal(setCalls[1].ms, 30000, 'new interval is 30s');
});

test('reconfigure({ pusherConnected: false }) returns to 1s fallback and fires immediate poll', async () => {
  const { createBoardStatePoller } = await modulePromise;
  const { windowRef, setCalls, clearCalls } = createIntervalSpyWindow();

  let fetchCount = 0;
  const fetchFn = async () => {
    fetchCount += 1;
    return { ok: true, json: async () => ({ data: { boardState: { tick: fetchCount } } }) };
  };

  const poller = createReconfigurePoller({
    createBoardStatePoller,
    isPusherConnectedFn: () => true, // start in safety-net mode
    windowRef,
    fetchFn,
  });

  const handle = poller.start();
  // Drain microtasks until the initial poll from start() has fully settled
  // (both the fetch await and the response.json() await) so that
  // reconfigure() does not race the in-flight poll via isPolling guard.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const fetchCountAfterStart = fetchCount;
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0].ms, 30000);

  handle.reconfigure({ pusherConnected: false });
  // Let the immediate-fallback poll resolve.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(clearCalls.length, 1, 'old safety-net interval cleared');
  assert.equal(setCalls.length, 2, 'new interval scheduled');
  assert.equal(setCalls[1].ms, 1000, 'fallback interval is 1s');
  assert.ok(
    fetchCount > fetchCountAfterStart,
    'entering fallback mode should fire one immediate poll',
  );
});

test('reconfigure({ pusherConnected: true }) does NOT fire an immediate poll', async () => {
  const { createBoardStatePoller } = await modulePromise;
  const { windowRef } = createIntervalSpyWindow();

  let fetchCount = 0;
  const fetchFn = async () => {
    fetchCount += 1;
    return { ok: true, json: async () => ({ data: { boardState: {} } }) };
  };

  const poller = createReconfigurePoller({
    createBoardStatePoller,
    isPusherConnectedFn: () => false, // start in fallback mode
    windowRef,
    fetchFn,
  });

  const handle = poller.start();
  await Promise.resolve();
  await Promise.resolve();
  const fetchCountAfterStart = fetchCount;

  handle.reconfigure({ pusherConnected: true });
  // Yield plenty of microtasks so any stray poll would have time to fire.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    fetchCount,
    fetchCountAfterStart,
    'entering safety-net mode should not fire an extra poll (Pusher will deliver state)',
  );
});

test('reconfigure is a no-op when the mode has not changed', async () => {
  const { createBoardStatePoller } = await modulePromise;
  const { windowRef, setCalls, clearCalls } = createIntervalSpyWindow();

  const poller = createReconfigurePoller({
    createBoardStatePoller,
    isPusherConnectedFn: () => false,
    windowRef,
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: {} } }) }),
  });

  const handle = poller.start();
  await Promise.resolve();

  handle.reconfigure({ pusherConnected: false });
  handle.reconfigure({ pusherConnected: false });

  assert.equal(clearCalls.length, 0, 'clearInterval should not be called on a no-op reconfigure');
  assert.equal(setCalls.length, 1, 'setInterval should not be called again on a no-op reconfigure');
});

test('start() returns a no-op reconfigure when no setInterval is available', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi: { getState: () => ({}), updateState: () => {} },
    fetchFn: async () => ({ ok: true, json: async () => ({ data: { boardState: {} } }) }),
    // windowRef without setInterval → the poller should degrade gracefully
    windowRef: {},
    documentRef: { visibilityState: 'visible' },
    isPusherConnectedFn: () => false,
  });

  const handle = poller.start();
  assert.equal(typeof handle.stop, 'function');
  assert.equal(typeof handle.reconfigure, 'function');
  // Calling reconfigure on the no-op handle must not throw.
  handle.reconfigure({ pusherConnected: true });
  handle.reconfigure({ pusherConnected: false });
  handle.stop();
});

// Phase 3-A: Conditional GET tests.
test('poller sends If-None-Match header with the current version', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const fetchCalls = [];
  const fetchFn = async (endpoint, options) => {
    fetchCalls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { boardState: { _version: 42 } } }),
    };
  };

  const boardStateContainer = {
    boardState: { placements: {} },
    user: { name: 'GM User', isGM: true },
  };

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi: {
      getState: () => boardStateContainer,
      updateState: (mutator) => mutator(boardStateContainer),
    },
    fetchFn,
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (existing, incoming) => incoming ?? existing,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : null,
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
    getCurrentVersionFn: () => 42,
  });

  await poller.poll();

  assert.equal(fetchCalls.length, 1);
  const headers = fetchCalls[0].options?.headers ?? {};
  assert.equal(headers['If-None-Match'], 'W/"v42"');
});

test('poller omits If-None-Match when no version is known yet', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const fetchCalls = [];
  const fetchFn = async (endpoint, options) => {
    fetchCalls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { boardState: { _version: 1 } } }),
    };
  };

  const boardStateContainer = {
    boardState: { placements: {} },
    user: { name: 'GM User', isGM: true },
  };

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi: {
      getState: () => boardStateContainer,
      updateState: (mutator) => mutator(boardStateContainer),
    },
    fetchFn,
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (existing, incoming) => incoming ?? existing,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : null,
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
    getCurrentVersionFn: () => 0,
  });

  await poller.poll();

  assert.equal(fetchCalls.length, 1);
  const headers = fetchCalls[0].options?.headers ?? {};
  assert.equal('If-None-Match' in headers, false);
});

test('poller treats a 304 response as a no-op without applying state', async () => {
  const { createBoardStatePoller } = await modulePromise;

  const boardStateContainer = {
    boardState: { placements: { token: { x: 9 } } },
    user: { name: 'GM User', isGM: true },
  };

  const updateCalls = [];
  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      updateCalls.push(mutator);
      mutator(boardStateContainer);
    },
  };

  const fetchFn = async () => ({
    status: 304,
    // No `ok`, no `json`. The poller must NOT call .json() on a 304.
  });

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn,
    windowRef: { setInterval: () => 0, clearInterval: () => {} },
    documentRef: { visibilityState: 'visible' },
    hashBoardStateSnapshotFn: (snapshot) => JSON.stringify(snapshot),
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (existing, incoming) => incoming ?? existing,
    getCurrentUserIdFn: () => 'gm user',
    normalizeProfileIdFn: (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : null,
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
    getCurrentVersionFn: () => 7,
  });

  await poller.poll();

  assert.equal(updateCalls.length, 0, 'updateState must not be called on 304');
  assert.deepEqual(
    boardStateContainer.boardState,
    { placements: { token: { x: 9 } } },
    'board state must remain untouched on 304',
  );
});
