/** Walking/shift hooks run only for local acknowledgments. Forced/teleport handle entry separately. */
export function normalMovementDetail(sceneId, placementId, previous, placement, context = {}) {
  const event = context.event;
  if (context.source !== 'acknowledgement' || !previous || !placement) return null;
  if (event?.type !== 'token.moved' && event?.type !== 'placement.batchApplied') return null;
  const kind = event.payload?.movementKind ?? (event.type === 'token.moved' ? 'walk' : null);
  if (!['walk','shift'].includes(kind)) return null;
  const footprint = (token) => ({
    column: Number(token.column) || 0, row: Number(token.row) || 0,
    width: Number(token.width) || 1, height: Number(token.height) || 1,
    levelId: token.levelId || 'level-0',
  });
  const from = footprint(previous), to = footprint(placement);
  if (from.column === to.column && from.row === to.row && from.levelId === to.levelId) return null;
  return { placementId, sceneId, from, to, kind: kind === 'walk' ? 'normal' : kind,
    movementOperationId:event.operationId ?? null,movementRevision:event.revision ?? null };
}
