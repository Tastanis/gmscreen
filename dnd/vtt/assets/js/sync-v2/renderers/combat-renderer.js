export function createCombatRenderer({ patchCombat } = {}) {
  return {
    patch(snapshot, context = {}) {
      if (typeof patchCombat !== 'function') {
        return { patched: false, reason: 'no_combat_adapter' };
      }
      const sceneId = context?.event?.sceneId ?? snapshot?.state?.activeSceneId ?? null;
      patchCombat(snapshot?.state?.combat?.[sceneId] ?? null, {
        ...context,
        sceneId,
      });
      return { patched: true };
    },
  };
}
