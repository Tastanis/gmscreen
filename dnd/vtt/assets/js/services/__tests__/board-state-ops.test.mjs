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

// ---------------------------------------------------------------------------
// Phase 3-B (commit 3): the delta-ops path now covers every placement
// mutation — add, remove, and update — in addition to the moves that
// commit 2 shipped. These tests lock in the wire shape of each new op
// type, the dedup key behavior (per-type keys, same-key later-wins for
// add/remove, shallow-merge-patches for two consecutive updates), and
// the accumulation of cross-type ops on the same placement so the
// server applies them in the order they were produced.
// ---------------------------------------------------------------------------

describe('Board State – delta ops persistence (phase 3-B commit 3)', () => {
  let originalFetch;
  let originalWindow;
  let capturedPayloads;
  let pendingFetchResolvers;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    capturedPayloads = [];
    pendingFetchResolvers = [];

    globalThis.fetch = async (_url, options = {}) => {
      if (options?.body) {
        capturedPayloads.push(JSON.parse(options.body));
      }
      return { ok: true, json: async () => ({ success: true, data: { _version: 99 } }) };
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
    while (pendingFetchResolvers.length > 0) {
      const resolve = pendingFetchResolvers.shift();
      resolve?.({ ok: true, json: async () => ({ success: true, data: { _version: 1 } }) });
    }
  });

  test('placement.add ships the full placement object under payload.ops', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    const placement = {
      id: 'new-hero',
      tokenId: 'lib-hero',
      column: 5,
      row: 7,
      width: 1,
      height: 1,
      hidden: false,
    };

    await persistBoardStateOps(
      '/api/state',
      [{ type: 'placement.add', sceneId: 'scene-1', placement }],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    const op = capturedPayloads[0].ops[0];
    assert.equal(op.type, 'placement.add');
    assert.equal(op.sceneId, 'scene-1');
    assert.deepEqual(op.placement, placement);
  });

  test('placement.remove ships just sceneId + placementId', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    await persistBoardStateOps(
      '/api/state',
      [{ type: 'placement.remove', sceneId: 'scene-1', placementId: 'goblin-42' }],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    const op = capturedPayloads[0].ops[0];
    assert.deepEqual(op, {
      type: 'placement.remove',
      sceneId: 'scene-1',
      placementId: 'goblin-42',
    });
  });

  test('placement.update ships a shallow patch object', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    await persistBoardStateOps(
      '/api/state',
      [
        {
          type: 'placement.update',
          sceneId: 'scene-1',
          placementId: 'hero',
          patch: { hp: { current: '5', max: '10' } },
        },
      ],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    const op = capturedPayloads[0].ops[0];
    assert.equal(op.type, 'placement.update');
    assert.deepEqual(op.patch, { hp: { current: '5', max: '10' } });
  });

  test('two placement.update ops for the same placement shallow-merge their patches', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    // Hold the first fetch open so both ops land in the pending buffer.
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
      [
        {
          type: 'placement.update',
          sceneId: 'scene-1',
          placementId: 'hero',
          patch: { hp: { current: '5', max: '10' } },
        },
      ],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [
        {
          type: 'placement.update',
          sceneId: 'scene-1',
          placementId: 'hero',
          patch: { conditions: [{ name: 'prone' }] },
        },
      ],
      {}
    );

    const secondPayload = capturedPayloads[capturedPayloads.length - 1];
    assert.ok(secondPayload, 'a second POST should have been initiated');
    assert.equal(secondPayload.ops.length, 1, 'same-placement updates coalesce to one op');
    assert.deepEqual(
      secondPayload.ops[0].patch,
      {
        hp: { current: '5', max: '10' },
        conditions: [{ name: 'prone' }],
      },
      'both field changes must survive the shallow-merge',
    );
  });

  test('later placement.update for the same key wins when patch fields overlap', async () => {
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
      [
        {
          type: 'placement.update',
          sceneId: 'scene-1',
          placementId: 'hero',
          patch: { hp: { current: '5', max: '10' } },
        },
      ],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [
        {
          type: 'placement.update',
          sceneId: 'scene-1',
          placementId: 'hero',
          patch: { hp: { current: '3', max: '10' } },
        },
      ],
      {}
    );

    const secondPayload = capturedPayloads[capturedPayloads.length - 1];
    assert.equal(secondPayload.ops.length, 1);
    assert.deepEqual(secondPayload.ops[0].patch, { hp: { current: '3', max: '10' } });
  });

  test('add, update, and remove on the same placement coexist in one flush (per-type keys)', async () => {
    const {
      persistBoardStateOps,
      _resetBoardStateOpsBufferForTest,
    } = await import('../board-state-service.js');
    _resetBoardStateOpsBufferForTest();

    // Hold each fetch open so every call gets merged into the buffer
    // before any save resolves.
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
      [
        {
          type: 'placement.add',
          sceneId: 'scene-1',
          placement: { id: 'hero', column: 1, row: 1 },
        },
      ],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [
        {
          type: 'placement.update',
          sceneId: 'scene-1',
          placementId: 'hero',
          patch: { hp: { current: '5', max: '10' } },
        },
      ],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [
        {
          type: 'placement.remove',
          sceneId: 'scene-1',
          placementId: 'hero',
        },
      ],
      {}
    );

    const lastPayload = capturedPayloads[capturedPayloads.length - 1];
    assert.ok(lastPayload);
    const types = lastPayload.ops.map((op) => op.type).sort();
    assert.deepEqual(
      types,
      ['placement.add', 'placement.remove', 'placement.update'],
      'all three ops must be present because they have distinct dedup keys',
    );
    // Insertion order in the buffer must match the call order so the
    // server applies add → update → remove.
    assert.deepEqual(
      lastPayload.ops.map((op) => op.type),
      ['placement.add', 'placement.update', 'placement.remove'],
    );
  });

  test('malformed new-type ops are silently dropped', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    await persistBoardStateOps(
      '/api/state',
      [
        // placement.add without placement object
        { type: 'placement.add', sceneId: 'scene-1' },
        // placement.add with placement but no id
        { type: 'placement.add', sceneId: 'scene-1', placement: { column: 1, row: 1 } },
        // placement.remove without placementId
        { type: 'placement.remove', sceneId: 'scene-1' },
        // placement.update without patch
        { type: 'placement.update', sceneId: 'scene-1', placementId: 'hero' },
        // well-formed survivor
        {
          type: 'placement.update',
          sceneId: 'scene-1',
          placementId: 'hero',
          patch: { hidden: true },
        },
      ],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    assert.equal(capturedPayloads[0].ops.length, 1, 'only the well-formed op should survive');
    assert.equal(capturedPayloads[0].ops[0].type, 'placement.update');
    assert.deepEqual(capturedPayloads[0].ops[0].patch, { hidden: true });
  });
});

// ---------------------------------------------------------------------------
// Phase 3-B (commit 4): template commits (the `commitShapes` path in the
// client) now ship as `template.upsert` / `template.remove` ops instead of
// a full snapshot. These tests lock in the wire shape of each new op type,
// the per-type dedup keys (an upsert and a remove for the same template
// coexist in the buffer), and the fact that malformed template ops are
// dropped rather than shipped.
// ---------------------------------------------------------------------------

describe('Board State – delta ops persistence (phase 3-B commit 4)', () => {
  let originalFetch;
  let originalWindow;
  let capturedPayloads;
  let pendingFetchResolvers;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    capturedPayloads = [];
    pendingFetchResolvers = [];

    globalThis.fetch = async (_url, options = {}) => {
      if (options?.body) {
        capturedPayloads.push(JSON.parse(options.body));
      }
      return { ok: true, json: async () => ({ success: true, data: { _version: 123 } }) };
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
    while (pendingFetchResolvers.length > 0) {
      const resolve = pendingFetchResolvers.shift();
      resolve?.({ ok: true, json: async () => ({ success: true, data: { _version: 1 } }) });
    }
  });

  test('template.upsert ships the full template object under payload.ops', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    const template = {
      id: 'tpl-1',
      type: 'circle',
      color: '#abcdef',
      center: { column: 3, row: 4 },
      radius: 5,
    };

    await persistBoardStateOps(
      '/api/state',
      [{ type: 'template.upsert', sceneId: 'scene-1', template }],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    const op = capturedPayloads[0].ops[0];
    assert.equal(op.type, 'template.upsert');
    assert.equal(op.sceneId, 'scene-1');
    assert.deepEqual(op.template, template);
  });

  test('template.remove ships just sceneId + templateId', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    await persistBoardStateOps(
      '/api/state',
      [{ type: 'template.remove', sceneId: 'scene-1', templateId: 'tpl-zap' }],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    assert.deepEqual(capturedPayloads[0].ops[0], {
      type: 'template.remove',
      sceneId: 'scene-1',
      templateId: 'tpl-zap',
    });
  });

  test('template.upsert and template.remove on the same template coexist (per-type keys)', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    // Hold each fetch open so every call accumulates into the buffer.
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
      [
        {
          type: 'template.upsert',
          sceneId: 'scene-1',
          template: { id: 'tpl-1', type: 'circle', center: { column: 1, row: 1 }, radius: 2 },
        },
      ],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [{ type: 'template.remove', sceneId: 'scene-1', templateId: 'tpl-1' }],
      {}
    );

    const lastPayload = capturedPayloads[capturedPayloads.length - 1];
    assert.ok(lastPayload);
    // Both must be present because per-type dedup keys prevent the
    // remove from clobbering the upsert (or vice versa). Insertion
    // order must also match the call order so the server applies
    // upsert → remove.
    assert.deepEqual(
      lastPayload.ops.map((op) => op.type),
      ['template.upsert', 'template.remove'],
    );
  });

  test('two template.upsert ops for the same template coalesce (later wins)', async () => {
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
      [
        {
          type: 'template.upsert',
          sceneId: 'scene-1',
          template: { id: 'tpl-1', type: 'circle', center: { column: 1, row: 1 }, radius: 2 },
        },
      ],
      {}
    );
    persistBoardStateOps(
      '/api/state',
      [
        {
          type: 'template.upsert',
          sceneId: 'scene-1',
          template: { id: 'tpl-1', type: 'circle', center: { column: 9, row: 9 }, radius: 4 },
        },
      ],
      {}
    );

    const secondPayload = capturedPayloads[capturedPayloads.length - 1];
    assert.equal(secondPayload.ops.length, 1, 'same-key upserts coalesce to one op');
    assert.deepEqual(secondPayload.ops[0].template.center, { column: 9, row: 9 });
    assert.equal(secondPayload.ops[0].template.radius, 4);
  });

  test('malformed template ops are silently dropped', async () => {
    const { persistBoardStateOps, _resetBoardStateOpsBufferForTest } = await import(
      '../board-state-service.js'
    );
    _resetBoardStateOpsBufferForTest();

    await persistBoardStateOps(
      '/api/state',
      [
        // missing template object
        { type: 'template.upsert', sceneId: 'scene-1' },
        // template present but missing id
        { type: 'template.upsert', sceneId: 'scene-1', template: { type: 'circle' } },
        // remove without templateId
        { type: 'template.remove', sceneId: 'scene-1' },
        // well-formed survivor
        {
          type: 'template.upsert',
          sceneId: 'scene-1',
          template: { id: 'tpl-ok', type: 'circle', center: { column: 0, row: 0 }, radius: 1 },
        },
      ],
      {}
    );

    assert.equal(capturedPayloads.length, 1);
    assert.equal(capturedPayloads[0].ops.length, 1, 'only the well-formed op survives');
    assert.equal(capturedPayloads[0].ops[0].type, 'template.upsert');
    assert.equal(capturedPayloads[0].ops[0].template.id, 'tpl-ok');
  });
});
