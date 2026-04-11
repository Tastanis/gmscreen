import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Phase 3-B (commit 2): `persistBoardStateOps` is the new delta-op save path
// used by token-drag saves. These tests lock in the wire shape the client
// sends (`{ops: [...], boardState: {metadata, _version, _socketId}}`), the
// same-key coalescing behavior (later move of the same token replaces the
// earlier one in the buffer), the cross-call accumulation that protects
// unrelated tokens from being lost if a second save starts while the first
// is still in flight, and the escape-hatch that tells the caller to fall
// back to a full snapshot when the buffer grows too big.
// ---------------------------------------------------------------------------

describe('Board State – delta ops persistence (phase 3-B commit 2)', () => {
  let originalFetch;
  let originalWindow;
  let capturedPayloads;
  let pendingFetchResolvers;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;

    capturedPayloads = [];
    pendingFetchResolvers = [];

    // Default fetch stub: captures the POST body and resolves immediately
    // with a successful response. Individual tests can override by
    // reassigning `globalThis.fetch`.
    globalThis.fetch = async (_url, options = {}) => {
      if (options?.body) {
        capturedPayloads.push(JSON.parse(options.body));
      }
      return { ok: true, json: async () => ({ success: true, data: { _version: 42 } }) };
    };

    globalThis.window = {
      ...(globalThis.window ?? {}),
      setTimeout: (fn, _ms) => {
        fn();
        return 0;
      },
    };
  });

  afterEach(async () => {
    // Drain the buffer so state never leaks between tests.
    const { _resetBoardStateOpsBufferForTest } = await import('../board-state-service.js');
    _resetBoardStateOpsBufferForTest();

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

    // Resolve any still-pending fetches so the event loop can drain.
    while (pendingFetchResolvers.length > 0) {
      const resolve = pendingFetchResolvers.shift();
      resolve?.({ ok: true, json: async () => ({ success: true, data: { _version: 1 } }) });
    }
  });

  test('persistBoardStateOps sends `ops` at the top level and wraps internal fields in boardState', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    const ops = [
      { type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 3, y: 4 },
    ];
    const envelope = {
      metadata: { updatedAt: 1, signature: 'gm:1', authorRole: 'gm', authorId: 'gm' },
      _version: 17,
      _socketId: 'socket-abc',
    };

    await persistBoardStateOps('/api/state', ops, envelope);

    assert.equal(capturedPayloads.length, 1, 'one POST should be made');
    const payload = capturedPayloads[0];

    assert.ok(Array.isArray(payload.ops), 'ops should live at the top level of the payload');
    assert.equal(payload.ops.length, 1, 'payload should contain exactly one op');
    assert.deepEqual(payload.ops[0], {
      type: 'placement.move',
      sceneId: 'scene-1',
      placementId: 'hero',
      x: 3,
      y: 4,
    });

    assert.ok(payload.boardState, 'boardState envelope should be present');
    assert.equal(payload.boardState._version, 17, '_version should be forwarded via boardState');
    assert.equal(payload.boardState._socketId, 'socket-abc', '_socketId should be forwarded');
    assert.deepEqual(payload.boardState.metadata, envelope.metadata);
    // The full snapshot fields (placements, templates, drawings, etc.) must
    // not be present — this is a delta-op save, not a snapshot save.
    assert.equal(payload.boardState.placements, undefined);
    assert.equal(payload.boardState.templates, undefined);
    assert.equal(payload.boardState.drawings, undefined);
  });

  test('two placement.move ops for the same (sceneId, placementId) coalesce (later wins)', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    // Hold the first fetch open so the second call batches into the
    // same pending buffer instead of after a clean resolution.
    globalThis.fetch = async (_url, options = {}) => {
      if (options?.body) {
        capturedPayloads.push(JSON.parse(options.body));
      }
      return new Promise((resolve) => {
        pendingFetchResolvers.push(resolve);
      });
    };

    persistBoardStateOps(
      '/api/state',
      [{ type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 1, y: 1 }],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [{ type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 9, y: 9 }],
      {}
    );

    // The first (in-flight) call was aborted by the coalesce-replace in
    // queueSave; the second call carries the newest coordinates for the
    // same token and only one op is in the buffer.
    const secondPayload = capturedPayloads[capturedPayloads.length - 1];
    assert.ok(secondPayload, 'a second POST should have been initiated');
    assert.equal(secondPayload.ops.length, 1, 'same-token coalescing leaves a single op');
    assert.equal(secondPayload.ops[0].x, 9, 'later position wins');
    assert.equal(secondPayload.ops[0].y, 9);
  });

  test('moves of different tokens accumulate across calls while a save is in flight', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    globalThis.fetch = async (_url, options = {}) => {
      if (options?.body) {
        capturedPayloads.push(JSON.parse(options.body));
      }
      return new Promise((resolve) => {
        pendingFetchResolvers.push(resolve);
      });
    };

    persistBoardStateOps(
      '/api/state',
      [{ type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 1, y: 1 }],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [{ type: 'placement.move', sceneId: 'scene-1', placementId: 'goblin', x: 2, y: 2 }],
      {}
    );

    // The second call's payload must carry BOTH ops — otherwise the first
    // token's move would be lost if the aborted in-flight save never
    // reached the server.
    const secondPayload = capturedPayloads[capturedPayloads.length - 1];
    assert.ok(secondPayload, 'a second POST should have been initiated');
    assert.equal(secondPayload.ops.length, 2, 'different-token ops must accumulate');
    const ids = secondPayload.ops.map((op) => op.placementId).sort();
    assert.deepEqual(ids, ['goblin', 'hero']);
  });

  test('returns {escape: true} when the ops buffer exceeds PHASE_3B_MAX_OPS_PER_FLUSH', async () => {
    const {
      persistBoardStateOps,
      PHASE_3B_MAX_OPS_PER_FLUSH,
      _resetBoardStateOpsBufferForTest,
    } = await import('../board-state-service.js');
    _resetBoardStateOpsBufferForTest();

    const ops = [];
    for (let i = 0; i < PHASE_3B_MAX_OPS_PER_FLUSH + 1; i += 1) {
      ops.push({
        type: 'placement.move',
        sceneId: 'scene-1',
        placementId: `token-${i}`,
        x: i,
        y: i,
      });
    }

    const result = persistBoardStateOps('/api/state', ops, {});
    assert.ok(result, 'escape result should not be null');
    assert.equal(result.escape, true, 'escape flag should be set when over the op threshold');
    assert.equal(capturedPayloads.length, 0, 'no POST should have been issued');
  });

  test('returns null if ops is not an array or is empty and no buffer is pending', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    assert.equal(persistBoardStateOps('/api/state', null, {}), null);
    assert.equal(persistBoardStateOps('/api/state', [], {}), null);
    assert.equal(capturedPayloads.length, 0);
  });

  test('silently drops malformed ops (missing sceneId or placementId)', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    await persistBoardStateOps(
      '/api/state',
      [
        { type: 'placement.move', sceneId: '', placementId: 'hero', x: 1, y: 1 },
        { type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 1, y: 1 },
        { type: 'placement.move', sceneId: 'scene-1', placementId: '', x: 1, y: 1 },
      ],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    assert.equal(capturedPayloads[0].ops.length, 1, 'only the well-formed op should be sent');
    assert.equal(capturedPayloads[0].ops[0].sceneId, 'scene-1');
    assert.equal(capturedPayloads[0].ops[0].placementId, 'hero');
  });
});
