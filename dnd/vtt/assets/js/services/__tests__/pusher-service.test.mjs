import test from 'node:test';
import assert from 'node:assert/strict';

import { disconnect, initializePusher } from '../pusher-service.js';

test('full Pusher messages forward deltaOnly flag to board handler', () => {
  const previousWindow = globalThis.window;
  const connectionHandlers = new Map();
  const channelHandlers = new Map();

  class FakePusher {
    constructor() {
      this.connection = {
        socket_id: '123.456',
        bind: (event, handler) => {
          connectionHandlers.set(event, handler);
        },
      };
    }

    subscribe() {
      return {
        bind: (event, handler) => {
          channelHandlers.set(event, handler);
        },
        unbind_all: () => {},
      };
    }

    disconnect() {}
  }

  try {
    globalThis.window = { Pusher: FakePusher };

    let received = null;
    initializePusher({
      key: 'key',
      cluster: 'cluster',
      channel: 'vtt-board',
      onStateUpdate: (delta) => {
        received = delta;
      },
      getCurrentUserId: () => 'current-user',
      getLastVersion: () => 0,
    });

    connectionHandlers.get('connected')?.();
    channelHandlers.get('state-updated')?.({
      type: 'full',
      version: 1,
      authorId: 'other-user',
      deltaOnly: false,
      placements: {
        'scene-1': [{ id: 'token-stays' }],
      },
    });

    assert.equal(received?.deltaOnly, false);
    assert.deepEqual(received?.placements, {
      'scene-1': [{ id: 'token-stays' }],
    });
  } finally {
    disconnect();
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});
