export async function fetchTokens(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error('Unable to load tokens');
  }
  const payload = await response.json();
  return payload.data ?? [];
}
