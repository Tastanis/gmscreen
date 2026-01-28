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
