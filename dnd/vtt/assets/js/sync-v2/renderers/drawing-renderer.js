function resolveDrawing(snapshot, sceneId, entityId) {
  return snapshot?.state?.drawings?.[sceneId]?.[entityId] ?? null;
}

export function createDrawingRenderer({ upsertDrawing, removeDrawing } = {}) {
  return {
    patch(snapshot, context = {}) {
      const event = context.event ?? {};
      const sceneId = event.sceneId ?? snapshot?.state?.activeSceneId ?? null;
      const entityId = event.entityId ?? null;
      if (!sceneId || !entityId) {
        return { patched: false, reason: 'missing_drawing_identity' };
      }
      if (event.type === 'drawing.removed') {
        removeDrawing?.(entityId, { ...context, sceneId });
        return { patched: typeof removeDrawing === 'function', action: 'removed' };
      }
      const drawing = resolveDrawing(snapshot, sceneId, entityId);
      if (!drawing || typeof upsertDrawing !== 'function') {
        return { patched: false, reason: 'missing_drawing_adapter' };
      }
      upsertDrawing(entityId, drawing, { ...context, sceneId });
      return { patched: true, action: 'upserted' };
    },
  };
}
