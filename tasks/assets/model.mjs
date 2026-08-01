export const DEFAULT_LIST_ID = 'inbox';
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function id(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createInitialData() {
  return {
    schemaVersion: 1,
    activeListId: DEFAULT_LIST_ID,
    lists: [{ id: DEFAULT_LIST_ID, name: 'Tasks', createdAt: new Date().toISOString() }],
    tasks: []
  };
}

export function normalizeData(value) {
  const fallback = createInitialData();
  if (!value || typeof value !== 'object') return fallback;
  const lists = Array.isArray(value.lists)
    ? value.lists.filter((item) => item && typeof item.id === 'string' && SAFE_ID.test(item.id) && typeof item.name === 'string')
    : [];
  if (!lists.length) lists.push(fallback.lists[0]);
  const listIds = new Set(lists.map((item) => item.id));
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.filter((task) => task && typeof task.id === 'string' && SAFE_ID.test(task.id) && listIds.has(task.listId)).map((task) => ({
        id: task.id,
        listId: task.listId,
        title: String(task.title || '').slice(0, 240),
        notes: String(task.notes || '').slice(0, 2000),
        completed: Boolean(task.completed),
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
        completedAt: task.completed ? (task.completedAt || task.updatedAt || new Date().toISOString()) : null
      })).filter((task) => task.title.trim())
    : [];
  return {
    schemaVersion: 1,
    activeListId: listIds.has(value.activeListId) ? value.activeListId : lists[0].id,
    lists,
    tasks
  };
}

export function addTask(data, listId, title) {
  const clean = String(title || '').trim();
  if (!clean) return data;
  const now = new Date().toISOString();
  data.tasks.unshift({ id: id('task'), listId, title: clean.slice(0, 240), notes: '', completed: false, createdAt: now, updatedAt: now, completedAt: null });
  return data;
}

export function toggleTask(data, taskId) {
  const task = data.tasks.find((item) => item.id === taskId);
  if (!task) return data;
  task.completed = !task.completed;
  task.updatedAt = new Date().toISOString();
  task.completedAt = task.completed ? task.updatedAt : null;
  return data;
}

export function deleteList(data, listId) {
  if (data.lists.length <= 1) return false;
  data.lists = data.lists.filter((list) => list.id !== listId);
  data.tasks = data.tasks.filter((task) => task.listId !== listId);
  if (data.activeListId === listId) data.activeListId = data.lists[0].id;
  return true;
}

export function mergeTaskData(remoteValue, legacyValue) {
  const remote = normalizeData(remoteValue);
  const legacy = normalizeData(legacyValue);
  if (remote.tasks.length === 0 && remote.lists.length === 1 && remote.lists[0].id === DEFAULT_LIST_ID && remote.lists[0].name === 'Tasks') {
    return legacy;
  }
  const lists = remote.lists.map((list) => ({ ...list }));
  const listIds = new Set(lists.map((list) => list.id));
  for (const list of legacy.lists) {
    if (!listIds.has(list.id)) {
      lists.push({ ...list });
      listIds.add(list.id);
    }
  }
  const tasksById = new Map(remote.tasks.map((task) => [task.id, { ...task }]));
  for (const task of legacy.tasks) {
    const existing = tasksById.get(task.id);
    if (!existing || String(task.updatedAt).localeCompare(String(existing.updatedAt)) > 0) {
      tasksById.set(task.id, { ...task });
    }
  }
  return normalizeData({
    schemaVersion: 1,
    activeListId: remote.activeListId,
    lists,
    tasks: [...tasksById.values()]
  });
}
