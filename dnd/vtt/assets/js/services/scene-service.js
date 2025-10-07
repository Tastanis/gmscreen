export async function fetchScenes(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error('Unable to load scenes');
  }
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error || 'Unable to load scenes');
  }
  return payload.data ?? { folders: [], items: [] };
}

export async function createScene(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create-scene', ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to save scene');
  }

  return data.data;
}

export async function createSceneFolder(endpoint, name) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create-folder', name }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to create folder');
  }

  return data.data;
}

export async function deleteScene(endpoint, sceneId) {
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to delete scene');
  }

  return data.data;
}
