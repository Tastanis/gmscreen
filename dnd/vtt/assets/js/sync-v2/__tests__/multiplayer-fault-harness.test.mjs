import test from 'node:test';
import assert from 'node:assert/strict';

import { createMultiplayerFaultHarness } from '../testing/multiplayer-fault-harness.js';

test('fault harness deterministically exposes latency and reordered delivery', () => {
  const harness = createMultiplayerFaultHarness();
  const received = [];
  harness.registerClient('server', (message) => received.push(message.payload.id));

  harness.send({
    from: 'player-a',
    to: 'server',
    payload: { id: 'first-command' },
    delayTicks: 3,
  });
  harness.send({
    from: 'player-b',
    to: 'server',
    payload: { id: 'second-command' },
    delayTicks: 0,
  });

  harness.advance(0);
  assert.deepEqual(received, ['second-command']);

  harness.advance(3);
  assert.deepEqual(received, ['second-command', 'first-command']);
});

test('fault harness can duplicate one canonical event for idempotency tests', () => {
  const harness = createMultiplayerFaultHarness();
  const received = [];
  harness.registerClient('player-a', (message) => received.push(message));

  harness.send({
    from: 'server',
    to: 'player-a',
    payload: { revision: 12, operationId: 'op-1' },
    duplicates: 2,
    tag: 'canonical-event',
  });
  harness.drain();

  assert.equal(received.length, 2);
  assert.deepEqual(received.map((message) => message.duplicateIndex), [0, 1]);
  assert.deepEqual(received.map((message) => message.payload.revision), [12, 12]);
});

test('fault harness drops realtime messages during disconnect and permits later recovery traffic', () => {
  const harness = createMultiplayerFaultHarness();
  const received = [];
  harness.registerClient('gm', (message) => received.push(message.payload));

  harness.setConnected('gm', false);
  harness.send({
    from: 'server',
    to: 'gm',
    payload: { revision: 20, type: 'token.moved' },
  });
  harness.advance(0);

  harness.setConnected('gm', true);
  harness.send({
    from: 'server',
    to: 'gm',
    payload: {
      type: 'recovery',
      events: [{ revision: 20, type: 'token.moved' }],
    },
  });
  harness.advance(0);

  assert.deepEqual(received, [{
    type: 'recovery',
    events: [{ revision: 20, type: 'token.moved' }],
  }]);
  assert.equal(harness.snapshot().stats.droppedDisconnected, 1);
  assert.equal(harness.snapshot().stats.delivered, 1);
});

test('fault harness broadcasts with independent recipient fault plans', () => {
  const harness = createMultiplayerFaultHarness();
  const receivedByClient = {
    gm: [],
    'player-a': [],
    'player-b': [],
  };
  Object.keys(receivedByClient).forEach((clientId) => {
    harness.registerClient(clientId, (message) => {
      receivedByClient[clientId].push(message.payload.revision);
    });
  });

  harness.broadcast({
    from: 'gm',
    payload: { revision: 31 },
    planByRecipient: {
      'player-a': { delayTicks: 2 },
      'player-b': { drop: true },
    },
  });

  harness.advance(0);
  assert.deepEqual(receivedByClient, {
    gm: [],
    'player-a': [],
    'player-b': [],
  });

  harness.advance(2);
  assert.deepEqual(receivedByClient, {
    gm: [],
    'player-a': [31],
    'player-b': [],
  });
  assert.equal(harness.snapshot().stats.droppedByPlan, 1);
});
