import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// We test that persistBoardState correctly forwards _replaceDrawings to the
// server payload.  Without this, the erase/clear tool's deletions are lost:
// the server merges (instead of replacing) the drawings, old strokes survive,
// and the next poll brings them back ("erase popback" bug).
// ---------------------------------------------------------------------------

describe('Board State – Erase drawing persistence', () => {
  let originalFetch;
  let originalWindow;
  let capturedPayloads;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;

    capturedPayloads = [];

    // Stub fetch to capture the request body
    globalThis.fetch = async (_url, options = {}) => {
      if (options.body) {
        capturedPayloads.push(JSON.parse(options.body));
      }
      return { ok: true, json: async () => ({ success: true }) };
    };

    // Provide a minimal window.setTimeout for the persistence layer
    globalThis.window = {
      ...(globalThis.window ?? {}),
      setTimeout: (fn, _ms) => {
        fn();
        return 0;
      },
    };
  });

  afterEach(() => {
    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }

    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test('persistBoardState includes _replaceDrawings in the payload', async () => {
    // Dynamic import so the module picks up our stubbed globals
    const { persistBoardState } = await import('../board-state-service.js');

    const boardState = {
      drawings: {
        'scene-1': [
          { id: 'frag-1', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#ff0000', strokeWidth: 3 },
        ],
      },
      _deltaOnly: true,
      _replaceDrawings: ['scene-1'],
      metadata: { updatedAt: Date.now(), signature: 'test-sig' },
    };

    const promise = persistBoardState('/api/state', boardState);
    // Let any microtasks or scheduled callbacks settle
    await promise;

    assert.ok(capturedPayloads.length > 0, 'expected at least one fetch call');

    const sentPayload = capturedPayloads[0];
    const sentBoardState = sentPayload.boardState ?? sentPayload;

    assert.ok(
      sentBoardState._deltaOnly === true,
      '_deltaOnly should be forwarded'
    );
    assert.ok(
      Array.isArray(sentBoardState._replaceDrawings),
      '_replaceDrawings should be an array in the sent payload'
    );
    assert.deepEqual(
      sentBoardState._replaceDrawings,
      ['scene-1'],
      '_replaceDrawings should contain the scene ID'
    );
  });

  test('persistBoardState omits _replaceDrawings when not provided', async () => {
    const { persistBoardState } = await import('../board-state-service.js');

    const boardState = {
      drawings: {
        'scene-1': [
          { id: 'd1', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], color: '#00ff00', strokeWidth: 2 },
        ],
      },
      _deltaOnly: true,
      metadata: { updatedAt: Date.now(), signature: 'test-sig-2' },
    };

    const promise = persistBoardState('/api/state', boardState);
    await promise;

    assert.ok(capturedPayloads.length > 0, 'expected at least one fetch call');

    const sentPayload = capturedPayloads[0];
    const sentBoardState = sentPayload.boardState ?? sentPayload;

    assert.ok(
      sentBoardState._deltaOnly === true,
      '_deltaOnly should still be forwarded'
    );
    assert.equal(
      sentBoardState._replaceDrawings,
      undefined,
      '_replaceDrawings should NOT be present when not provided'
    );
  });

  test('persistBoardState omits _replaceDrawings when array is empty', async () => {
    const { persistBoardState } = await import('../board-state-service.js');

    const boardState = {
      drawings: { 'scene-1': [] },
      _deltaOnly: true,
      _replaceDrawings: [],
      metadata: { updatedAt: Date.now(), signature: 'test-sig-3' },
    };

    const promise = persistBoardState('/api/state', boardState);
    await promise;

    assert.ok(capturedPayloads.length > 0, 'expected at least one fetch call');

    const sentPayload = capturedPayloads[0];
    const sentBoardState = sentPayload.boardState ?? sentPayload;

    assert.equal(
      sentBoardState._replaceDrawings,
      undefined,
      '_replaceDrawings should NOT be present when the array is empty'
    );
  });

  test('erase clears all drawings for a scene via _replaceDrawings', async () => {
    const { persistBoardState } = await import('../board-state-service.js');

    // Simulate a complete clear: empty drawings array with _replaceDrawings flag
    const boardState = {
      drawings: {
        'scene-1': [],
      },
      _deltaOnly: true,
      _replaceDrawings: ['scene-1'],
      metadata: { updatedAt: Date.now(), signature: 'test-sig-clear' },
    };

    const promise = persistBoardState('/api/state', boardState);
    await promise;

    assert.ok(capturedPayloads.length > 0, 'expected at least one fetch call');

    const sentPayload = capturedPayloads[0];
    const sentBoardState = sentPayload.boardState ?? sentPayload;

    assert.ok(
      Array.isArray(sentBoardState._replaceDrawings),
      '_replaceDrawings should be present for clear operations'
    );
    assert.deepEqual(
      sentBoardState._replaceDrawings,
      ['scene-1'],
      'scene-1 should be listed for full replacement'
    );
    assert.deepEqual(
      sentBoardState.drawings['scene-1'],
      [],
      'drawings array for the scene should be empty (all cleared)'
    );
  });
});
