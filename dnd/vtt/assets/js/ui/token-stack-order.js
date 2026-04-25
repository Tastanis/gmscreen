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

export function getTokenStackOrderAvailability(placements = [], placementId) {
  const entries = buildOrderedStackEntries(placements);
  const index = entries.findIndex((entry) => entry.id === placementId);

  return {
    canMoveBackward: index > 0,
    canMoveForward: index >= 0 && index < entries.length - 1,
  };
}

export function buildTokenStackOrderUpdate(placements = [], placementId, direction = 'forward') {
  const entries = buildOrderedStackEntries(placements);
  const currentIndex = entries.findIndex((entry) => entry.id === placementId);
  if (currentIndex < 0) {
    return [];
  }

  const offset = direction === 'backward' ? -1 : 1;
  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= entries.length) {
    return [];
  }

  const reordered = [...entries];
  const moving = reordered[currentIndex];
  reordered[currentIndex] = reordered[nextIndex];
  reordered[nextIndex] = moving;

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
  return source
    .map((placement, index) => {
      const id = typeof placement?.id === 'string' ? placement.id.trim() : '';
      if (!id) {
        return null;
      }
      return {
        id,
        index,
        stackOrder: getPlacementStackOrder(placement, index),
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
