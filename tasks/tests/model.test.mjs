import test from 'node:test';
import assert from 'node:assert/strict';
import { addTask, createInitialData, deleteList, mergeTaskData, normalizeData, toggleTask } from '../assets/model.mjs';

test('adds and toggles a task', () => {
  const data = createInitialData();
  addTask(data, 'inbox', 'Buy milk');
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].title, 'Buy milk');
  toggleTask(data, data.tasks[0].id);
  assert.equal(data.tasks[0].completed, true);
  toggleTask(data, data.tasks[0].id);
  assert.equal(data.tasks[0].completed, false);
});

test('deleting a list deletes only its tasks and selects a remaining list', () => {
  const data = createInitialData();
  data.lists.push({ id: 'work', name: 'Work' });
  data.activeListId = 'work';
  addTask(data, 'work', 'Report'); addTask(data, 'inbox', 'Milk');
  assert.equal(deleteList(data, 'work'), true);
  assert.deepEqual(data.tasks.map((task) => task.title), ['Milk']);
  assert.equal(data.activeListId, 'inbox');
});

test('normalization rejects tasks for unknown lists', () => {
  const data = normalizeData({ lists: [{ id: 'a', name: 'A' }], activeListId: 'missing', tasks: [{ id: 'x', listId: 'missing', title: 'Nope' }] });
  assert.equal(data.activeListId, 'a');
  assert.equal(data.tasks.length, 0);
});

test('normalization rejects unsafe IDs before they reach HTML attributes', () => {
  const data = normalizeData({ lists: [{ id: 'bad\" onclick=\"x', name: 'Bad' }], tasks: [] });
  assert.equal(data.lists[0].id, 'inbox');
});

test('legacy merge adds unique items and keeps the newer matching task', () => {
  const remote = createInitialData();
  remote.tasks.push({ id: 'same', listId: 'inbox', title: 'Remote', notes: '', completed: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' });
  const legacy = createInitialData();
  legacy.lists.push({ id: 'work', name: 'Work', createdAt: '2026-01-01T00:00:00Z' });
  legacy.tasks.push({ id: 'same', listId: 'inbox', title: 'Legacy old', notes: '', completed: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-15T00:00:00Z' });
  legacy.tasks.push({ id: 'work-task', listId: 'work', title: 'Imported', notes: '', completed: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
  const merged = mergeTaskData(remote, legacy);
  assert.equal(merged.lists.some((list) => list.id === 'work'), true);
  assert.equal(merged.tasks.find((task) => task.id === 'same').title, 'Remote');
  assert.equal(merged.tasks.find((task) => task.id === 'work-task').title, 'Imported');
});

test('legacy merge preserves full list organization when the server is still empty', () => {
  const remote = createInitialData();
  const legacy = createInitialData();
  legacy.lists[0].name = 'Personal';
  legacy.lists.push({ id: 'work', name: 'Work', createdAt: '2026-01-01T00:00:00Z' });
  legacy.activeListId = 'work';
  const merged = mergeTaskData(remote, legacy);
  assert.equal(merged.lists[0].name, 'Personal');
  assert.equal(merged.activeListId, 'work');
});
