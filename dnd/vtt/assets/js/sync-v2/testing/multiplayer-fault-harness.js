function clonePayload(payload) {
  if (payload === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch (error) {
    throw new TypeError('Fault-harness payloads must be JSON serializable');
  }
}

function normalizeClientId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Deterministic virtual network for Sync V2 multiplayer tests.
 *
 * The harness deliberately knows nothing about VTT game rules. Future tests
 * inject server/client adapters and use this network to control delivery
 * order, latency, duplication, loss, disconnect, and reconnect without real
 * clocks or sockets.
 */
export function createMultiplayerFaultHarness({ startTick = 0 } = {}) {
  let currentTick = Math.max(0, Math.trunc(Number(startTick)) || 0);
  let nextMessageSequence = 1;
  const clients = new Map();
  const queue = [];
  const stats = {
    scheduled: 0,
    delivered: 0,
    droppedByPlan: 0,
    droppedDisconnected: 0,
  };

  function registerClient(clientId, onMessage) {
    const id = normalizeClientId(clientId);
    if (!id) {
      throw new TypeError('clientId is required');
    }
    if (typeof onMessage !== 'function') {
      throw new TypeError(`onMessage must be a function for client ${id}`);
    }
    clients.set(id, {
      connected: true,
      onMessage,
    });
    return () => clients.delete(id);
  }

  function setConnected(clientId, connected) {
    const id = normalizeClientId(clientId);
    const client = clients.get(id);
    if (!client) {
      throw new Error(`Unknown harness client: ${id}`);
    }
    client.connected = Boolean(connected);
  }

  function isConnected(clientId) {
    return clients.get(normalizeClientId(clientId))?.connected === true;
  }

  function scheduleOne({
    from = null,
    to,
    payload,
    delayTicks = 0,
    drop = false,
    tag = null,
    duplicateIndex = 0,
  }) {
    const targetId = normalizeClientId(to);
    if (!clients.has(targetId)) {
      throw new Error(`Unknown harness target: ${targetId}`);
    }
    if (drop) {
      stats.droppedByPlan += 1;
      return null;
    }
    const entry = {
      sequence: nextMessageSequence,
      from: normalizeClientId(from) || null,
      to: targetId,
      payload: clonePayload(payload),
      deliverAt: currentTick + Math.max(0, Math.trunc(Number(delayTicks)) || 0),
      tag: typeof tag === 'string' && tag.trim() ? tag.trim() : null,
      duplicateIndex,
    };
    nextMessageSequence += 1;
    stats.scheduled += 1;
    queue.push(entry);
    return entry.sequence;
  }

  function send({
    from = null,
    to,
    payload,
    delayTicks = 0,
    duplicates = 1,
    drop = false,
    tag = null,
  }) {
    const copyCount = Math.max(1, Math.trunc(Number(duplicates)) || 1);
    const scheduled = [];
    for (let duplicateIndex = 0; duplicateIndex < copyCount; duplicateIndex += 1) {
      const sequence = scheduleOne({
        from,
        to,
        payload,
        delayTicks,
        drop,
        tag,
        duplicateIndex,
      });
      if (sequence !== null) {
        scheduled.push(sequence);
      }
    }
    return scheduled;
  }

  function broadcast({
    from = null,
    payload,
    recipients = null,
    planByRecipient = {},
    includeSender = false,
    tag = null,
  }) {
    const senderId = normalizeClientId(from) || null;
    const targetIds = Array.isArray(recipients)
      ? recipients.map(normalizeClientId).filter(Boolean)
      : Array.from(clients.keys());
    const scheduled = [];

    for (const targetId of targetIds) {
      if (!includeSender && senderId && targetId === senderId) {
        continue;
      }
      const plan = planByRecipient?.[targetId] ?? {};
      scheduled.push(...send({
        from: senderId,
        to: targetId,
        payload,
        delayTicks: plan.delayTicks ?? 0,
        duplicates: plan.duplicates ?? 1,
        drop: plan.drop === true,
        tag,
      }));
    }
    return scheduled;
  }

  function deliverDue() {
    queue.sort((left, right) => {
      if (left.deliverAt !== right.deliverAt) {
        return left.deliverAt - right.deliverAt;
      }
      return left.sequence - right.sequence;
    });

    const due = [];
    while (queue.length > 0 && queue[0].deliverAt <= currentTick) {
      due.push(queue.shift());
    }

    for (const message of due) {
      const target = clients.get(message.to);
      if (!target?.connected) {
        stats.droppedDisconnected += 1;
        continue;
      }
      target.onMessage({
        ...message,
        payload: clonePayload(message.payload),
        deliveredAt: currentTick,
      });
      stats.delivered += 1;
    }
    return due.length;
  }

  function advance(ticks = 1) {
    currentTick += Math.max(0, Math.trunc(Number(ticks)) || 0);
    deliverDue();
    return currentTick;
  }

  function drain({ maxTicks = 10000 } = {}) {
    let advanced = 0;
    while (queue.length > 0) {
      if (advanced > maxTicks) {
        throw new Error('Fault harness exceeded maxTicks while draining');
      }
      const nextTick = Math.min(...queue.map((entry) => entry.deliverAt));
      const delta = Math.max(0, nextTick - currentTick);
      currentTick += delta;
      advanced += delta;
      deliverDue();
    }
    return currentTick;
  }

  function snapshot() {
    return {
      currentTick,
      clients: Object.fromEntries(
        Array.from(clients.entries()).map(([id, client]) => [
          id,
          { connected: client.connected },
        ])
      ),
      pending: queue
        .slice()
        .sort((left, right) => left.sequence - right.sequence)
        .map((entry) => ({
          sequence: entry.sequence,
          from: entry.from,
          to: entry.to,
          deliverAt: entry.deliverAt,
          tag: entry.tag,
          duplicateIndex: entry.duplicateIndex,
        })),
      stats: { ...stats },
    };
  }

  return {
    registerClient,
    setConnected,
    isConnected,
    send,
    broadcast,
    advance,
    drain,
    snapshot,
  };
}
