function resolveTemplate(snapshot, sceneId, entityId) {
  return snapshot?.state?.templates?.[sceneId]?.[entityId] ?? null;
}

export function createTemplateRenderer({ upsertTemplate, removeTemplate } = {}) {
  return {
    patch(snapshot, context = {}) {
      const event = context.event ?? {};
      const sceneId = event.sceneId ?? snapshot?.state?.activeSceneId ?? null;
      const entityId = event.entityId ?? null;
      if (!sceneId || !entityId) {
        return { patched: false, reason: 'missing_template_identity' };
      }
      if (event.type === 'template.removed') {
        removeTemplate?.(entityId, { ...context, sceneId });
        return { patched: typeof removeTemplate === 'function', action: 'removed' };
      }
      const template = resolveTemplate(snapshot, sceneId, entityId);
      if (!template || typeof upsertTemplate !== 'function') {
        return { patched: false, reason: 'missing_template_adapter' };
      }
      upsertTemplate(entityId, template, { ...context, sceneId });
      return { patched: true, action: 'upserted' };
    },
  };
}
