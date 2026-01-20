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

test('gm clients do not update when no placement position changes', async () => {
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

  await poller.poll();

  // No position changes, so updateState should not be called
  assert.equal(updateCalls.length, 0, 'updateState should not be called when no position changes');
});
