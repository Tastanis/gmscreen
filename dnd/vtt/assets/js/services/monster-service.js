const DEFAULT_CREDENTIALS = 'same-origin';

function buildUrl(endpoint) {
  if (!endpoint) {
    throw new Error('Monster endpoint is not configured.');
  }

  try {
    return new URL(endpoint, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
  } catch (error) {
    throw new Error('Invalid monster endpoint.');
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url.toString(), options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {
    const errorMessage = payload?.error || 'Unable to load monster data.';
    throw new Error(errorMessage);
  }

  return payload?.data;
}

export async function fetchMonsterIndex(endpoint, { credentials = DEFAULT_CREDENTIALS } = {}) {
  const url = buildUrl(endpoint);
  return requestJson(url, { credentials });
}

export async function fetchMonsterDetail(
  endpoint,
  id,
  { credentials = DEFAULT_CREDENTIALS } = {}
) {
  if (typeof id === 'undefined' || id === null || id === '') {
    throw new Error('A monster identifier is required.');
  }

  const url = buildUrl(endpoint);
  url.searchParams.set('id', String(id));

  return requestJson(url, { credentials });
}

export default {
  fetchMonsterIndex,
  fetchMonsterDetail,
};
