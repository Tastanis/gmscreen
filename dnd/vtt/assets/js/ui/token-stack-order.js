const DEFAULT_STACK_ORDER_BASE = 1000;

export function getPlacementStackOrder(placement, fallback = 0) {
  const raw = placement?.stackOrder;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.trunc(raw));
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }

  return Math.max(0, Math.trunc(Number.isFinite(fallback) ? fallback : 0));
}

export function getDefaultTokenStackOrderMap(placements = []) {
  const source = Array.isArray(placements) ? placements : [];
  const entries = source
    .map((placement, index) => {
      const id = typeof placement?.id === 'string' ? placement.id.trim() : '';
      if (!id) {
        return null;
      }
      return {
        id,
        index,
        row: getPlacementRow(placement, index),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.row !== right.row) {
        return right.row - left.row;
      }
      return left.index - right.index;
    });

  const defaults = new Map();
  entries.forEach((entry, index) => {
    defaults.set(entry.id, DEFAULT_STACK_ORDER_BASE + index);
  });
  return defaults;
}

export function getTokenStackOrderAvailability(placements = [], placementId) {
  const entries = buildOrderedStackEntries(placements);
  const index = entries.findIndex((entry) => entry.id === placementId);

  return {
    canMoveToBack: index > 0,
    canMoveToFront: index >= 0 && index < entries.length - 1,
  };
}

export function buildTokenStackOrderUpdate(placements = [], placementId, direction = 'front') {
  const entries = buildOrderedStackEntries(placements);
  const currentIndex = entries.findIndex((entry) => entry.id === placementId);
  if (currentIndex < 0) {
    return [];
  }

  const normalizedDirection = normalizeStackDirection(direction);
  if (!normalizedDirection) {
    return [];
  }

  const targetIndex = normalizedDirection === 'back' ? 0 : entries.length - 1;
  if (currentIndex === targetIndex) {
    return [];
  }

  const moving = entries[currentIndex];
  if (normalizedDirection === 'front') {
    const topStackOrder = entries.reduce(
      (max, entry) => Math.max(max, entry.stackOrder),
      0
    );
    return [{ id: moving.id, stackOrder: topStackOrder + 1 }];
  }

  const bottomStackOrder = entries.reduce(
    (min, entry) => Math.min(min, entry.stackOrder),
    Number.POSITIVE_INFINITY
  );
  if (Number.isFinite(bottomStackOrder) && bottomStackOrder > 0) {
    return [{ id: moving.id, stackOrder: bottomStackOrder - 1 }];
  }

  return buildDenseReorderChanges(entries, currentIndex, targetIndex);
}

function buildDenseReorderChanges(entries, currentIndex, targetIndex) {
  const reordered = [...entries];
  const [moving] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, moving);
  const changes = [];
  reordered.forEach((entry, index) => {
    if (entry.stackOrder === index) {
      return;
    }
    changes.push({ id: entry.id, stackOrder: index });
  });

  return changes;
}

function buildOrderedStackEntries(placements = []) {
  const source = Array.isArray(placements) ? placements : [];
  const defaultStackOrders = getDefaultTokenStackOrderMap(source);
  return source
    .map((placement, index) => {
      const id = typeof placement?.id === 'string' ? placement.id.trim() : '';
      if (!id) {
        return null;
      }
      return {
        id,
        index,
        stackOrder: getPlacementStackOrder(
          placement,
          defaultStackOrders.get(id) ?? DEFAULT_STACK_ORDER_BASE + index
        ),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.stackOrder !== right.stackOrder) {
        return left.stackOrder - right.stackOrder;
      }
      return left.index - right.index;
    });
}

function getPlacementRow(placement, fallback) {
  const raw = placement?.row ?? placement?.y ?? placement?.position?.row ?? placement?.position?.y;
  const numeric = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return Number.isFinite(fallback) ? fallback : 0;
}

function normalizeStackDirection(direction) {
  if (direction === 'back' || direction === 'backward') {
    return 'back';
  }
  if (direction === 'front' || direction === 'forward') {
    return 'front';
  }
  return null;
}
