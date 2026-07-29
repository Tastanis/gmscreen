export function createChangeRouter(handlers = {}) {
  const routes = {
    placementAdded: handlers.placementAdded,
    placementUpdated: handlers.placementUpdated,
    placementRemoved: handlers.placementRemoved,
    combat: handlers.combat,
    fog: handlers.fog,
    templates: handlers.templates,
    drawings: handlers.drawings,
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
    for (const domain of ['combat', 'fog', 'templates', 'drawings', 'sceneRouting', 'shadow']) {
      if (changeSet[domain]) {
        call(domain, changeSet, context);
      }
    }
  }

  return { route };
}
