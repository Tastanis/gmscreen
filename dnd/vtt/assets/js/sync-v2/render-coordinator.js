import { createChangeRouter } from './change-router.js';

const METRIC_NAMES = Object.freeze([
  'tokenAdds',
  'tokenPatches',
  'tokenRemovals',
  'combatPatches',
  'fogPatches',
  'templatePatches',
  'drawingPatches',
  'levelPatches',
  'sceneMounts',
  'mapLoads',
  'fullBoardReconciliations',
]);

function createMetrics() {
  return Object.fromEntries(METRIC_NAMES.map((name) => [name, 0]));
}

export function createRenderCoordinator({
  store,
  tokenRenderer,
  combatRenderer,
  fogRenderer,
  templateRenderer,
  drawingRenderer,
  sceneRenderer,
  snapshotRenderer = null,
} = {}) {
  if (!store || typeof store.getSnapshot !== 'function') {
    throw new TypeError('Render coordinator requires a Sync V2 entity store');
  }

  let metrics = createMetrics();
  const countPatched = (metric, result) => {
    if (result?.patched) {
      metrics[metric] += 1;
    }
  };

  function withSnapshot(context, callback) {
    return callback(
      store.getConfirmedSnapshot?.() ?? store.getSnapshot(),
      context
    );
  }

  const router = createChangeRouter({
    placementAdded: (id, context) => {
      const result = withSnapshot(context, (snapshot) => tokenRenderer?.add?.(id, snapshot, context));
      countPatched('tokenAdds', result);
    },
    placementUpdated: (id, context) => {
      const result = withSnapshot(
        context,
        (snapshot) => tokenRenderer?.update?.(id, snapshot, context)
      );
      countPatched('tokenPatches', result);
    },
    placementRemoved: (id, context) => {
      const result = withSnapshot(
        context,
        (snapshot) => tokenRenderer?.remove?.(id, snapshot, context)
      );
      countPatched('tokenRemovals', result);
    },
    combat: (changeSet, context) => {
      const result = withSnapshot(context, (snapshot) => combatRenderer?.patch?.(snapshot, context));
      countPatched('combatPatches', result);
    },
    fog: (changeSet, context) => {
      const result = withSnapshot(context, (snapshot) => fogRenderer?.patch?.(snapshot, context));
      countPatched('fogPatches', result);
    },
    templates: (changeSet, context) => {
      const result = withSnapshot(
        context,
        (snapshot) => templateRenderer?.patch?.(snapshot, context)
      );
      countPatched('templatePatches', result);
    },
    drawings: (changeSet, context) => {
      const result = withSnapshot(
        context,
        (snapshot) => drawingRenderer?.patch?.(snapshot, context)
      );
      countPatched('drawingPatches', result);
    },
    levels: (changeSet, context) => {
      const result = withSnapshot(
        context,
        (snapshot) => sceneRenderer?.patchLevel?.(snapshot, context)
      );
      countPatched('levelPatches', result);
    },
    sceneRouting: (changeSet, context) => {
      const result = withSnapshot(
        context,
        (snapshot) => sceneRenderer?.activate?.(snapshot, context)
      );
      countPatched('sceneMounts', result);
      if (result?.mapLoaded) {
        metrics.mapLoads += 1;
      }
    },
    snapshot: (changeSet, context) => {
      if (typeof snapshotRenderer === 'function') {
        snapshotRenderer(
          store.getConfirmedSnapshot?.() ?? store.getSnapshot(),
          context
        );
        metrics.fullBoardReconciliations += 1;
      }
    },
  });

  return {
    route: (changeSet, context = {}) => router.route(changeSet, context),
    getMetrics: () => ({ ...metrics }),
    resetMetrics: () => {
      metrics = createMetrics();
      return { ...metrics };
    },
  };
}
