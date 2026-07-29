function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createPendingCommands() {
  const entries = new Map();

  function add(command) {
    const operationId = typeof command?.operationId === 'string' ? command.operationId : '';
    if (!operationId) {
      throw new TypeError('Pending commands require an operationId');
    }
    if (!entries.has(operationId)) {
      entries.set(operationId, {
        command: clone(command),
        status: 'pending',
        attempts: 0,
        result: null,
      });
    }
    return get(operationId);
  }

  function markAttempt(operationId) {
    const entry = entries.get(operationId);
    if (!entry) {
      return null;
    }
    entry.attempts += 1;
    entry.status = 'sending';
    return get(operationId);
  }

  function settle(operationId, status, result = null) {
    const entry = entries.get(operationId);
    if (!entry) {
      return null;
    }
    entry.status = status;
    entry.result = result === null ? null : clone(result);
    return get(operationId);
  }

  function get(operationId) {
    const entry = entries.get(operationId);
    return entry ? clone(entry) : null;
  }

  function remove(operationId) {
    return entries.delete(operationId);
  }

  function snapshot() {
    return Array.from(entries.entries()).map(([operationId, entry]) => ({
      operationId,
      ...clone(entry),
    }));
  }

  return {
    add,
    markAttempt,
    acknowledge: (operationId, result) => settle(operationId, 'acknowledged', result),
    reject: (operationId, result) => settle(operationId, 'rejected', result),
    fail: (operationId, result) => settle(operationId, 'failed', result),
    get,
    remove,
    snapshot,
  };
}
