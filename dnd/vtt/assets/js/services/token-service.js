export async function fetchTokens(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error('Unable to load tokens');
  }
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error || 'Unable to load tokens');
  }
  return payload.data ?? { folders: [], items: [] };
}

export async function createToken(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create-token', ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to create token');
  }

  return data.data;
}

export async function createTokenFolder(endpoint, name) {
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

export async function updateToken(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update-token', ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to update token');
  }

  return data.data;
}

export async function deleteToken(endpoint, tokenId) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-token', id: tokenId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to delete token');
  }

  return data.data;
}
