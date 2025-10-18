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

  const boardApi = {
    getState: () => boardStateContainer,
    updateState: (mutator) => {
      mutator(boardStateContainer);
      mergeCalls.push(boardStateContainer.boardState);
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
