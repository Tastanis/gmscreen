import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditTemplate, templateCommands } from '../template-edits.js';
import { normalizeTemplateEntry } from '../../state/normalize/templates.js';

const circle = (id, authorId) => ({ id, authorId, type: 'circle', center: { column: 4, row: 4 }, radius: 2 });
test('only the changed shape becomes a command, independent of metadata and property ordering', () => {
  const other = { ...circle('other', 'sharon'), _entityRevision: 8, _lastModified: 3 };
  const before = [other, circle('mine', 'cal')];
  const after = [normalizeTemplateEntry(other), { ...circle('mine', 'cal'), radius: 3 }];
  const commands = templateCommands('scene', before, after, normalizeTemplateEntry);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].entityId, 'mine');
  assert.equal(commands[0].payload.template.authorId, 'cal');
  assert.equal(templateCommands('scene', before, [other], normalizeTemplateEntry)[0].type, 'template.remove');
});
test('temporary ownership and persistent structures survive normalization', () => {
  assert.equal(canEditTemplate(circle('mine', 'cal'), { userId: 'cal' }), true);
  assert.equal(canEditTemplate(circle('other', 'sharon'), { userId: 'cal' }), false);
  assert.equal(canEditTemplate(circle('old', ''), { userId: 'cal' }), false);
  const structure = normalizeTemplateEntry({ ...circle('wall', 'cal'), persistent: true });
  assert.equal(canEditTemplate(structure, { userId: 'cal' }), false);
  assert.equal(canEditTemplate(structure, { isGM: true }), true);
});
