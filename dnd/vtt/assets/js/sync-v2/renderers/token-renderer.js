function resolveLayer(layer) {
  return typeof layer === 'function' ? layer() : layer;
}

function resolveSceneId(snapshot, context) {
  const eventSceneId = context?.event?.sceneId;
  if (typeof eventSceneId === 'string' && eventSceneId.trim()) {
    return eventSceneId.trim();
  }
  const activeSceneId = snapshot?.state?.activeSceneId;
  return typeof activeSceneId === 'string' ? activeSceneId : '';
}

function resolvePlacement(snapshot, placementId, context) {
  const sceneId = resolveSceneId(snapshot, context);
  return snapshot?.state?.placements?.[sceneId]?.[placementId] ?? null;
}

function findTokenNode(layer, placementId) {
  return Array.from(layer?.children ?? []).find(
    (node) => node?.dataset?.placementId === placementId
  ) ?? null;
}

function defaultCreateNode(documentRef) {
  const node = documentRef.createElement('div');
  node.className = 'vtt-token';
  return node;
}

function defaultPatchNode(node, placement, layout) {
  node.dataset.placementId = placement.id || node.dataset.placementId || '';
  node.dataset.entityRevision = String(placement._entityRevision ?? '');
  node.style.width = `${layout.width}px`;
  node.style.height = `${layout.height}px`;
  node.style.transform = `translate3d(${layout.left}px, ${layout.top}px, 0)`;
  node.classList.toggle('vtt-token--hidden', placement.hidden === true);
}

export function createTokenRenderer({
  layer,
  documentRef = typeof document === 'undefined' ? null : document,
  gridSize = 64,
  offsetX = 0,
  offsetY = 0,
  createNode = defaultCreateNode,
  patchNode = defaultPatchNode,
  dependencies = {},
} = {}) {
  function layoutFor(placement) {
    const size = Math.max(1, Number(gridSize) || 64);
    return {
      left: (Number(offsetX) || 0) + (Number(placement.column) || 0) * size,
      top: (Number(offsetY) || 0) + (Number(placement.row) || 0) * size,
      width: Math.max(1, Number(placement.width) || 1) * size,
      height: Math.max(1, Number(placement.height) || 1) * size,
    };
  }

  function notify(name, placementId, placement, context) {
    if (typeof dependencies[name] === 'function') {
      dependencies[name](placementId, placement, context);
    }
  }

  function add(placementId, snapshot, context = {}) {
    const tokenLayer = resolveLayer(layer);
    const placement = resolvePlacement(snapshot, placementId, context);
    if (!tokenLayer || !documentRef || !placement) {
      return { patched: false, reason: 'missing_add_target' };
    }
    if (findTokenNode(tokenLayer, placementId)) {
      return update(placementId, snapshot, context);
    }
    const node = createNode(documentRef, placement, context);
    patchNode(node, placement, layoutFor(placement), context);
    tokenLayer.appendChild(node);
    notify('tracker', placementId, placement, context);
    return { patched: true, node, action: 'added' };
  }

  function update(placementId, snapshot, context = {}) {
    const tokenLayer = resolveLayer(layer);
    const placement = resolvePlacement(snapshot, placementId, context);
    const node = findTokenNode(tokenLayer, placementId);
    if (!tokenLayer || !placement || !node) {
      return { patched: false, reason: 'missing_update_target' };
    }
    patchNode(node, placement, layoutFor(placement), context);

    const eventType = context?.event?.type;
    if (eventType === 'token.moved') {
      notify('movement', placementId, placement, context);
    } else if (
      eventType === 'token.staminaChanged'
      || eventType === 'token.conditionsChanged'
    ) {
      notify('summary', placementId, placement, context);
      notify('tracker', placementId, placement, context);
    }
    return { patched: true, node, action: 'updated' };
  }

  function remove(placementId, snapshot, context = {}) {
    const tokenLayer = resolveLayer(layer);
    const node = findTokenNode(tokenLayer, placementId);
    if (!node) {
      return { patched: false, reason: 'missing_remove_target' };
    }
    node.remove();
    notify('selection', placementId, null, context);
    notify('summary', placementId, null, context);
    notify('tracker', placementId, null, context);
    return { patched: true, action: 'removed' };
  }

  return { add, update, remove, findNode: (id) => findTokenNode(resolveLayer(layer), id) };
}
