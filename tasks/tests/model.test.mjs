import test from 'node:test';
import assert from 'node:assert/strict';
import { addTask, createInitialData, deleteList, normalizeData, toggleTask } from '../assets/model.mjs';

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
