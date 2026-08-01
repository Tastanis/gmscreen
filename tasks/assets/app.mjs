import { addTask, createInitialData, deleteList, id, normalizeData, toggleTask } from './model.mjs';
import { createStorage } from './storage.mjs';

const config = window.TASK_APP_CONFIG || {};
const storage = createStorage(config);
let data = createInitialData();
let editingTaskId = null;
let editingListMode = 'new';
let completedOpen = false;
let saveTimer = null;

const $ = (selector) => document.querySelector(selector);
const els = {
  nav: $('#list-nav'), title: $('#list-title'), count: $('#task-count'), tasks: $('#task-list'),
  completed: $('#completed-list'), completedSection: $('#completed-section'), completedToggle: $('#completed-toggle'),
  empty: $('#empty-state'), addForm: $('#add-task-form'), addInput: $('#new-task-input'), sidebar: $('#sidebar'),
  scrim: $('#scrim'), taskDialog: $('#task-dialog'), taskForm: $('#task-form'), taskTitle: $('#edit-task-title'),
  taskNotes: $('#edit-task-notes'), listDialog: $('#list-dialog'), listForm: $('#list-form'), listName: $('#list-name-input'),
  deleteList: $('#delete-list-button'), storageNote: $('#storage-note'), toast: $('#toast')
};

function activeList() { return data.lists.find((list) => list.id === data.activeListId) || data.lists[0]; }
function escapeHtml(value) { const span = document.createElement('span'); span.textContent = value; return span.innerHTML; }
function formatNotes(notes) { return escapeHtml(notes).replace(/\n/g, '<br>'); }

function taskMarkup(task) {
  return `<article class="task-row ${task.completed ? 'is-complete' : ''}" data-task-id="${task.id}">
    <button class="check-button" type="button" data-action="toggle" aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}"><span>✓</span></button>
    <button class="task-text" type="button" data-action="edit"><strong>${escapeHtml(task.title)}</strong>${task.notes ? `<small>${formatNotes(task.notes)}</small>` : ''}</button>
    <button class="row-menu" type="button" data-action="edit" aria-label="Edit ${escapeHtml(task.title)}">›</button>
  </article>`;
}

function render() {
  data = normalizeData(data);
  const current = activeList();
  data.activeListId = current.id;
  const activeTasks = data.tasks.filter((task) => task.listId === current.id && !task.completed);
  const doneTasks = data.tasks.filter((task) => task.listId === current.id && task.completed)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));

  els.nav.innerHTML = data.lists.map((list) => {
    const remaining = data.tasks.filter((task) => task.listId === list.id && !task.completed).length;
    return `<button type="button" class="list-link ${list.id === current.id ? 'active' : ''}" data-list-id="${list.id}"><span class="list-dot">✓</span><span>${escapeHtml(list.name)}</span><small>${remaining || ''}</small></button>`;
  }).join('');
  els.title.textContent = current.name;
  els.count.textContent = `${activeTasks.length} ${activeTasks.length === 1 ? 'task' : 'tasks'} remaining`;
  els.tasks.innerHTML = activeTasks.map(taskMarkup).join('');
  els.completed.innerHTML = doneTasks.map(taskMarkup).join('');
  els.completedSection.hidden = doneTasks.length === 0;
  els.completedToggle.textContent = `${completedOpen ? '⌄' : '›'}  Completed (${doneTasks.length})`;
  els.completedToggle.setAttribute('aria-expanded', String(completedOpen));
  els.completed.hidden = !completedOpen;
  els.empty.hidden = activeTasks.length > 0 || doneTasks.length > 0;
  document.title = `${current.name} · ${config.appName || 'My Tasks'}`;
}

async function persist() {
  clearTimeout(saveTimer);
  try { await storage.save(data); }
  catch (error) { showToast(error.message || 'Save failed'); }
}

function persistSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 80); }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2600); }
function closeSidebar() { els.sidebar.classList.remove('open'); els.scrim.hidden = true; }
function openSidebar() { els.sidebar.classList.add('open'); els.scrim.hidden = false; }

els.addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = els.addInput.value.trim();
  if (!title) return;
  addTask(data, activeList().id, title);
  els.addInput.value = '';
  render(); persistSoon();
});

function onTaskClick(event) {
  const row = event.target.closest('[data-task-id]');
  if (!row) return;
  const taskId = row.dataset.taskId;
  if (event.target.closest('[data-action="toggle"]')) { toggleTask(data, taskId); render(); persistSoon(); return; }
  if (event.target.closest('[data-action="edit"]')) openTaskDialog(taskId);
}
els.tasks.addEventListener('click', onTaskClick);
els.completed.addEventListener('click', onTaskClick);

function openTaskDialog(taskId) {
  const task = data.tasks.find((item) => item.id === taskId);
  if (!task) return;
  editingTaskId = taskId; els.taskTitle.value = task.title; els.taskNotes.value = task.notes; els.taskDialog.showModal();
  setTimeout(() => els.taskTitle.focus(), 0);
}

els.taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const task = data.tasks.find((item) => item.id === editingTaskId);
  const title = els.taskTitle.value.trim();
  if (!task || !title) return;
  task.title = title; task.notes = els.taskNotes.value.trim(); task.updatedAt = new Date().toISOString();
  els.taskDialog.close(); render(); persistSoon();
});

$('#delete-task-button').addEventListener('click', () => {
  const task = data.tasks.find((item) => item.id === editingTaskId);
  if (!task || !confirm(`Delete “${task.title}”?`)) return;
  data.tasks = data.tasks.filter((item) => item.id !== editingTaskId);
  els.taskDialog.close(); render(); persistSoon(); showToast('Task deleted');
});

els.nav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-list-id]');
  if (!button) return;
  data.activeListId = button.dataset.listId; completedOpen = false; render(); persistSoon(); closeSidebar();
});

function openListDialog(mode) {
  editingListMode = mode;
  $('#list-dialog-title').textContent = mode === 'new' ? 'New list' : 'List options';
  els.listName.value = mode === 'new' ? '' : activeList().name;
  els.deleteList.hidden = mode === 'new' || data.lists.length <= 1;
  els.listDialog.showModal(); setTimeout(() => els.listName.focus(), 0);
}

$('#add-list-button').addEventListener('click', () => openListDialog('new'));
$('#list-menu-button').addEventListener('click', () => openListDialog('edit'));
els.listForm.addEventListener('submit', (event) => {
  event.preventDefault(); const name = els.listName.value.trim(); if (!name) return;
  if (editingListMode === 'new') {
    const newList = { id: id('list'), name: name.slice(0, 80), createdAt: new Date().toISOString() };
    data.lists.push(newList); data.activeListId = newList.id;
  } else { activeList().name = name.slice(0, 80); }
  els.listDialog.close(); render(); persistSoon();
});

els.deleteList.addEventListener('click', () => {
  const list = activeList();
  if (!confirm(`Delete “${list.name}” and all of its tasks?`)) return;
  if (deleteList(data, list.id)) { els.listDialog.close(); render(); persistSoon(); showToast('List deleted'); }
});

$('#menu-button').addEventListener('click', openSidebar);
els.scrim.addEventListener('click', closeSidebar);
els.completedToggle.addEventListener('click', () => { completedOpen = !completedOpen; render(); });
window.addEventListener('beforeunload', () => { if (saveTimer) storage.save(data); });

async function start() {
  els.storageNote.textContent = storage.label;
  try { data = await storage.load(); }
  catch (error) { showToast(`${error.message} Starting with an empty list.`); }
  render();
  if ('serviceWorker' in navigator && config.storageMode === 'browser') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
start();
