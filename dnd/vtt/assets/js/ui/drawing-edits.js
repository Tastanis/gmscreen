// Gesture-sized changes, never a replacement of everybody's scene drawings.
export function diffDrawings(before = [], after = []) {
  const previous = new Map(before.map((entry) => [entry.id, entry]));
  const next = new Map(after.map((entry) => [entry.id, entry]));
  const edits = [];
  for (const [id, drawing] of previous) {
    if (!next.has(id)) edits.push({ id, before: drawing, after: null });
  }
  for (const [id, drawing] of next) {
    if (!previous.has(id)) edits.push({ id, before: null, after: drawing });
  }
  return edits;
}

export function applyDrawingEdits(drawings = [], edits = []) {
  const result = new Map(drawings.map((entry) => [entry.id, entry]));
  for (const edit of edits) {
    if (edit.after) result.set(edit.id, edit.after);
    else result.delete(edit.id);
  }
  return [...result.values()];
}

export function invertDrawingEdits(edits) {
  return edits.map((edit) => ({ id: edit.id, before: edit.after, after: edit.before }));
}

export function drawingCommands(sceneId, edits) {
  // Save replacement fragments before removing the original stroke. A failed
  // request must not discard the original before its replacement is accepted.
  return [...edits].sort((a, b) => Number(Boolean(b.after)) - Number(Boolean(a.after))).map((edit) => edit.after ? {
    type: 'drawing.upsert', sceneId, entityId: edit.id, payload: { drawing: edit.after },
  } : {
    type: 'drawing.remove', sceneId, entityId: edit.id, payload: {},
  });
}

export function canEditDrawing(drawing, { userId, isGM = false, levelId = 'level-0' }) {
  return (drawing.levelId || 'level-0') === levelId
    && (isGM || (Boolean(userId) && drawing.authorId === userId));
}
