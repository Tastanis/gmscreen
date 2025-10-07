export async function fetchScenes(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error('Unable to load scenes');
  }
  const payload = await response.json();
  return payload.data ?? [];
}
