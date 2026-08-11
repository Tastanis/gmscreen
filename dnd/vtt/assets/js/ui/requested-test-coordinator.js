function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function key(value) {
  return String(value ?? '').trim().toLowerCase();
}

function createId(prefix = 'requested-test') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function buildRequestedTestUnits(spec, getProfile, getOwnerId) {
  const attributeKey = key(spec?.attribute || 'Might');
  const enriched = [];
  for (const target of Array.isArray(spec?.targets) ? spec.targets : []) {
    if (!target?.id) continue;
    const profile = await getProfile(target.id);
    const stats = profile?.stats && typeof profile.stats === 'object' ? profile.stats : {};
    enriched.push({
      target: clone(target),
      profile: { name: profile?.name || target.name || 'Creature', stats: clone(stats) || {} },
      bonus: Number.parseInt(stats[attributeKey] ?? 0, 10) || 0,
      recipientId: key(getOwnerId(target.id)) || '__gm__',
    });
  }
  const mode = spec?.rollMode || 'individual';
  if (mode === 'singleHighest') {
    const representative = enriched.reduce((best, item) => !best || item.bonus > best.bonus ? item : best, null);
    return representative ? [{ representative, members: enriched }] : [];
  }
  if (mode === 'groupByAttribute') {
    const groups = new Map();
    for (const item of enriched) {
      // Keep ownership in the grouping key. Equal stats owned by different
      // players must not silently assign one player's roll to another player.
      const groupKey = `${item.bonus}:${item.recipientId}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(item);
    }
    return Array.from(groups.values()).map((members) => ({ representative: members[0], members }));
  }
  return enriched.map((item) => ({ representative: item, members: [item] }));
}

export function createRequestedTestCoordinator({
  enabled = true,
  getCurrentUserId,
  getSceneId,
  getProfile,
  getOwnerId,
  getPlacement,
  submitCommand,
  rollRequestedTest,
  cancelRequestedTestRoll = () => {},
  applyContinuation,
  refundContinuation = async () => {},
  getRollContext = () => ({}),
  onError = (error) => console.warn('[RequestedTest]', error),
} = {}) {
  const batches = new Map();
  const rolling = new Set();
  const applying = new Set();
  let snapshot = { state: { requestedTests: {} } };
  let waitingHost = null;
  let activeRollId = null;

  function records() {
    return Object.values(snapshot?.state?.requestedTests ?? {}).filter(Boolean);
  }

  function currentUserId() {
    return key(getCurrentUserId?.());
  }

  async function command(type, record, payload = {}) {
    return submitCommand(type, record.sceneId || getSceneId(), record.id, payload);
  }

  function closeWaiting() {
    waitingHost?.remove();
    waitingHost = null;
  }

  function renderWaiting(batchId, count, completed) {
    closeWaiting();
    const host = document.createElement('div');
    host.className = 'vtt-requested-test-waiting';
    host.innerHTML = `
      <section class="vtt-requested-test-waiting__panel" role="status">
        <strong>Waiting for requested tests</strong>
        <span>${completed} of ${count} accepted</span>
        <div>
          <button type="button" data-requested-test-recall>Make myself</button>
          <button type="button" data-requested-test-cancel>Cancel</button>
        </div>
      </section>`;
    document.body.appendChild(host);
    waitingHost = host;
    host.dataset.batchId = batchId;
    host.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-requested-test-recall]')) recallBatch(batchId);
      if (target?.closest('[data-requested-test-cancel]')) cancelBatch(batchId);
    });
  }

  async function recallBatch(batchId) {
    const pending = records().filter((record) => record?.test?.batchId === batchId && record.status === 'pending');
    await Promise.allSettled(pending.map((record) => command('requestedTest.reassign', record)));
  }

  async function cancelBatch(batchId) {
    const active = records().filter((record) => record?.test?.batchId === batchId && !['canceled', 'completed'].includes(record.status));
    await Promise.allSettled(active.map((record) => command('requestedTest.cancel', record)));
  }

  function onEscape(event) {
    if (event.key !== 'Escape' || !waitingHost) return;
    const batchId = waitingHost.dataset.batchId;
    if (batchId) cancelBatch(batchId);
  }
  document.addEventListener('keydown', onEscape);

  async function createRequests(spec) {
    if (!enabled) return { canceled: true, reason: 'disabled' };
    const units = await buildRequestedTestUnits(spec, getProfile, getOwnerId);
    if (!units.length) return { canceled: true, reason: 'no-targets' };
    const batchId = createId('requested-test-batch');
    const sceneId = getSceneId();
    const requestIds = [];
    const promise = new Promise((resolve) => batches.set(batchId, { resolve, requestIds, creating: true }));
    try {
      for (let index = 0; index < units.length; index += 1) {
        const unit = units[index];
        const requestId = createId('requested-test');
        requestIds.push(requestId);
        await submitCommand('requestedTest.create', sceneId, requestId, {
          request: {
            recipientId: unit.representative.recipientId,
            abilityName: spec.abilityName || 'Ability',
            sourcePlacementId: spec.sourcePlacementId || null,
            attribute: spec.attribute || 'Might',
            rollMode: spec.rollMode || 'individual',
            targetIds: unit.members.map((item) => item.target.id),
            targetNames: unit.members.map((item) => item.target.name || 'Creature'),
            test: {
              batchId, index, count: units.length,
              label: spec.label || `${spec.attribute || 'Might'} test`,
              prompt: spec.prompt || '', rollFormula: spec.rollFormula || '2d10',
              bonus: Number(spec.bonus) || 0, edge: Number(spec.edge) || 0, bane: Number(spec.bane) || 0,
              profile: unit.representative.profile,
              representativeId: unit.representative.target.id,
              representativeName: unit.representative.target.name || 'Creature',
            },
            continuation: { ...(clone(spec.continuation) || {}), batchId },
            resourceReservation: clone(spec.resourceReservation),
          },
        });
      }
    } catch (error) {
      batches.delete(batchId);
      await Promise.allSettled(requestIds.map((id) => submitCommand(
        'requestedTest.cancel', sceneId, id, {}
      )));
      onError(error);
      return { canceled: true, requestIds };
    }
    const batch = batches.get(batchId);
    if (batch) batch.creating = false;
    processSnapshot(snapshot).catch(onError);
    return promise;
  }

  async function resolveAsRecipient(record) {
    if (rolling.has(record.id)) return;
    rolling.add(record.id);
    activeRollId = record.id;
    try {
      const test = record.test || {};
      const result = await rollRequestedTest({
        profile: test.profile || {},
        target: getPlacement(test.representativeId) || { id: test.representativeId, name: test.representativeName },
        targetId: test.representativeId,
        targetName: test.representativeName,
        attribute: record.attribute,
        label: `${test.label || record.attribute} (${Number(test.index || 0) + 1} of ${Number(test.count || 1)})`,
        prompt: test.prompt,
        rollFormula: test.rollFormula,
        bonus: test.bonus,
        edge: test.edge,
        bane: test.bane,
        context: getRollContext(record),
      });
      if (result?.canceled) {
        await command('requestedTest.cancel', record);
        return;
      }
      await command('requestedTest.resolve', record, {
        result: {
          tier: result.tier, total: result.total, dice: result.dice,
          bonus: result.bonus, edgeCount: result.edge, baneCount: result.bane,
          rollerTokenId: test.representativeId, rollerTokenName: test.representativeName,
          targetIds: record.targetIds,
        },
      });
    } catch (error) {
      if (error?.status !== 409) onError(error);
    } finally {
      rolling.delete(record.id);
      if (activeRollId === record.id) activeRollId = null;
    }
  }

  async function claimRecords(group) {
    if (!group.length) return [];
    try {
      await command('requestedTest.claim', group[0]);
      return group;
    } catch (error) {
      if (error?.status !== 409) onError(error);
      return [];
    }
  }

  async function completeRecords(group) {
    await Promise.allSettled(group.map((record) => command('requestedTest.complete', record)));
  }

  async function processInitiatorBatch(batchId, group) {
    if (applying.has(batchId)) return;
    const local = batches.get(batchId);
    if (local?.creating) return;
    if (!local && group.every((record) => record.status === 'applying')) return;
    if (group.some((record) => record.status === 'canceled')) {
      applying.add(batchId);
      await cancelBatch(batchId);
      closeWaiting();
      batches.delete(batchId);
      const requestIds = group.map((record) => record.id);
      if (local) {
        local.resolve({ canceled: true, requestIds });
      } else {
        await refundContinuation(group[0]);
        await completeRecords(group);
      }
      applying.delete(batchId);
      return;
    }
    const count = Number(group[0]?.test?.count || group.length);
    const resolved = group.filter((record) => record.status === 'resolved');
    renderWaiting(batchId, count, resolved.length);
    if (group.length < count || resolved.length !== count) return;
    applying.add(batchId);
    const claimed = await claimRecords(resolved);
    if (claimed.length !== count) {
      applying.delete(batchId);
      return;
    }
    closeWaiting();
    const results = claimed.map((record) => ({
      ...(record.result || {}), requestId: record.id, targetIds: record.targetIds || [],
    }));
    if (local) {
      batches.delete(batchId);
      local.resolve({ canceled: false, results, requestIds: claimed.map((record) => record.id) });
    } else {
      for (const record of claimed) {
        await applyContinuation(record, getRollContext(record));
      }
      await completeRecords(claimed);
    }
    applying.delete(batchId);
  }

  async function processSnapshot(nextSnapshot) {
    snapshot = nextSnapshot || snapshot;
    const userId = currentUserId();
    if (activeRollId) {
      const active = records().find((record) => record.id === activeRollId);
      if (!active || active.status !== 'pending' || key(active.recipientId) !== userId) {
        cancelRequestedTestRoll();
      }
    }
    for (const record of records()) {
      if (record.status === 'pending' && key(record.recipientId) === userId) resolveAsRecipient(record);
    }
    const initiated = records().filter((record) => key(record.initiatorId) === userId);
    const groups = new Map();
    for (const record of initiated) {
      const batchId = record?.test?.batchId || record.id;
      if (!groups.has(batchId)) groups.set(batchId, []);
      groups.get(batchId).push(record);
    }
    for (const [batchId, group] of groups) processInitiatorBatch(batchId, group);
  }

  async function complete(requestIds = []) {
    const wanted = new Set(requestIds);
    const byId = new Map(records().map((record) => [record.id, record]));
    await completeRecords(Array.from(wanted).map((id) => byId.get(id) || {
      id, sceneId: getSceneId(),
    }));
  }

  return { requestTest: createRequests, processSnapshot, complete, recallBatch, cancelBatch, destroy: () => document.removeEventListener('keydown', onEscape) };
}
