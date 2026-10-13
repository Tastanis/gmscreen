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
  // Where the move began is taken from the server's own receipt for this very move. The page's picture of the
  // token is no guide: an arrow-key move is drawn before it is confirmed, so by now the page already shows the
  // token on its new square, and every press after the first looked like no move at all.
  const receipt = placement._movementUndo?.history?.at?.(-1);
  const began = receipt && event.operationId && receipt.operationId === event.operationId && receipt.from
    && Number.isFinite(Number(receipt.from.column)) && Number.isFinite(Number(receipt.from.row))
    ? { ...previous, column: receipt.from.column, row: receipt.from.row, levelId: receipt.from.levelId || previous.levelId }
    : previous;
  const from = footprint(began), to = footprint(placement);
  if (from.column === to.column && from.row === to.row && from.levelId === to.levelId) return null;
  const corners = Array.isArray(event.payload?.path)
    ? event.payload.path.filter((point) => Number.isFinite(Number(point?.column)) && Number.isFinite(Number(point?.row))).map((point) => ({ column: Number(point.column), row: Number(point.row) }))
    : [];
  return { placementId, sceneId, from, to, kind: kind === 'walk' ? 'normal' : kind, ...(corners.length ? { path: corners } : {}),
    movementOperationId:event.operationId ?? null,movementRevision:event.revision ?? null };
}
