export function createFogRenderer({ patchFog } = {}) {
  return {
    patch(snapshot, context = {}) {
      if (typeof patchFog !== 'function') {
        return { patched: false, reason: 'no_fog_adapter' };
      }
      const sceneId = context?.event?.sceneId ?? snapshot?.state?.activeSceneId ?? null;
      patchFog(snapshot?.state?.fog?.[sceneId] ?? null, {
        ...context,
        sceneId,
        patch: context?.event?.payload ?? null,
      });
      return { patched: true };
    },
  };
}
