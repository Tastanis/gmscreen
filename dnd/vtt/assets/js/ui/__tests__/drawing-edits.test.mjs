import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffDrawings, applyDrawingEdits, invertDrawingEdits, drawingCommands, canEditDrawing } from '../drawing-edits.js';

const stroke = (id, authorId = 'cal', levelId = 'level-0') => ({
  id, authorId, levelId, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
});

test('erase and undo preserve concurrently added drawings and the original floor', () => {
  const original = stroke('original', 'cal', 'upper');
  const fragment = stroke('fragment', 'cal', 'upper');
  const remote = stroke('remote', 'sharon');
  const edit = diffDrawings([original], [fragment]);
  const merged = applyDrawingEdits([original, remote], edit);
  assert.deepEqual(merged, [remote, fragment]);
  assert.deepEqual(applyDrawingEdits(merged, invertDrawingEdits(edit)), [remote, original]);
  const commands = drawingCommands('scene-a', edit);
  assert.deepEqual(commands.map((command) => command.type), ['drawing.upsert', 'drawing.remove']);
  assert.equal(commands[0].payload.drawing.levelId, 'upper');
  assert.ok(commands.every((command) => command.sceneId === 'scene-a'));
});

test('author and floor jointly scope erase and clear, including legacy base drawings', () => {
  assert.equal(canEditDrawing(stroke('mine'), { userId: 'cal' }), true);
  assert.equal(canEditDrawing(stroke('other', 'sharon'), { userId: 'cal' }), false);
  assert.equal(canEditDrawing(stroke('upper', 'cal', 'upper'), { userId: 'cal' }), false);
  assert.equal(canEditDrawing(stroke('other', 'sharon'), { userId: 'gm', isGM: true }), true);
  assert.equal(canEditDrawing({ ...stroke('legacy'), levelId: undefined }, { userId: 'cal' }), true);
  assert.equal(canEditDrawing(stroke('upper', 'cal', 'upper'), { isGM: true }), false);
});
