export function createSceneRenderer({ activateScene, patchLevel } = {}) {
  return {
    activate(snapshot, context = {}) {
      if (typeof activateScene !== 'function') {
        return { patched: false, reason: 'no_scene_adapter', mapLoaded: false };
      }
      const sceneId = context?.event?.sceneId ?? snapshot?.state?.activeSceneId ?? null;
      const result = activateScene(sceneId, snapshot, context);
      return {
        patched: true,
        mapLoaded: result?.mapLoaded === true,
      };
    },
    patchLevel(snapshot, context = {}) {
      if (typeof patchLevel !== 'function') {
        return { patched: false, reason: 'no_level_adapter' };
      }
      const sceneId = context?.event?.sceneId ?? snapshot?.state?.activeSceneId ?? null;
      patchLevel(snapshot?.state?.levels?.[sceneId] ?? null, {
        ...context,
        sceneId,
      });
      return { patched: true };
    },
  };
}
