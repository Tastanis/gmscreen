const activeTools = new Map();
const cancelTools = new Map();

/** Call only when entering a mode, never while refreshing its label. */
export function claimActiveTool(key, cancel) {
  cancelTools.set(key, cancel);
  for (const other of [...activeTools.keys()]) {
    if (other !== key) cancelTools.get(other)?.();
  }
}

/** Tool modules publish their actual mode; this label never changes that mode. */
export function publishActiveTool(key, label = null) {
  if (label) activeTools.set(key, label);
  else activeTools.delete(key);
  const output = typeof document !== 'undefined' ? document.querySelector('[data-active-tool]') : null;
  if (!output) return;
  const text = activeTools.size ? `Tool: ${[...activeTools.values()].join(' · ')}` : 'Tool: Select';
  if (output.textContent !== text) output.textContent = text;
}
