export function createChangeRouter(handlers = {}) {
  const routes = {
    placementAdded: handlers.placementAdded,
    placementUpdated: handlers.placementUpdated,
    placementRemoved: handlers.placementRemoved,
    combat: handlers.combat,
    fog: handlers.fog,
    templates: handlers.templates,
    drawings: handlers.drawings,
    pings: handlers.pings,
    levels: handlers.levels,
    grid: handlers.grid,
    sceneRouting: handlers.sceneRouting,
    shadow: handlers.shadow,
    snapshot: handlers.snapshot,
  };

  function call(name, payload, context) {
    if (typeof routes[name] === 'function') {
      routes[name](payload, context);
    }
  }

  function route(changeSet, context = {}) {
    if (!changeSet || typeof changeSet !== 'object') {
      return;
    }
    if (changeSet.snapshot) {
      call('snapshot', changeSet, context);
      return;
    }
    for (const id of changeSet.placements?.added ?? []) {
      call('placementAdded', id, context);
    }
    for (const id of changeSet.placements?.updated ?? []) {
      call('placementUpdated', id, context);
    }
    for (const id of changeSet.placements?.removed ?? []) {
      call('placementRemoved', id, context);
    }
    for (const domain of [
      'combat',
      'fog',
      'templates',
      'drawings',
      'pings',
      'levels',
      'grid',
      'sceneRouting',
      'shadow',
    ]) {
      if (changeSet[domain]) {
        call(domain, changeSet, context);
      }
    }
  }

  return { route };
}

export function placementMutationsAffectPersistentZones(mutations) {
  return Array.isArray(mutations) && mutations.some((mutation) => {
    if (!mutation || typeof mutation !== 'object') return false;
    if (mutation.kind === 'remove') return true;
    if (Array.isArray(mutation.changedFields)) {
      return mutation.changedFields.includes('persistentZones');
    }
    return Boolean(
      mutation.placement
      && typeof mutation.placement === 'object'
      && Object.prototype.hasOwnProperty.call(mutation.placement, 'persistentZones')
    );
  });
}
