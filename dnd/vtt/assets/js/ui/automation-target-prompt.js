function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAutomationTargetPromptHtml(targetConfig = {}, promptText = '', pickedNames = []) {
  const title = targetConfig.promptTitle || 'Pick Target';
  const text = (promptText || targetConfig.promptText || 'Click a token on the map.').replace(/\s*\(\d+\/\d+\)(?=\.?$)/, '');
  const total = Number(targetConfig.pickTotal) || 0;
  const index = Number(targetConfig.pickIndex) || 1;
  const counter = total > 1 ? `Target ${Math.min(index, total)} of ${total}` : (targetConfig.allowDone && pickedNames.length ? `Target ${pickedNames.length + 1}` : '');
  const names = pickedNames.filter(Boolean);
  return `
    <section class="dice-modal dice-modal--vtt vtt-automation-picker-prompt__modal" role="dialog" aria-modal="false">
      <header class="dice-modal-header vtt-automation-picker-prompt__header">
        <div class="dice-modal-heading-group">
          <h2 class="dice-modal-title">${escapeHtml(title)}</h2>
          <span class="dice-modal-project-label">Target Selection</span>
        </div>
        <button class="dice-modal-close" type="button" data-automation-target-cancel aria-label="Cancel target selection">&times;</button>
      </header>
      <div class="dice-modal-content vtt-automation-picker-prompt__body">
        ${counter ? `<p class="vtt-automation-picker-prompt__count"><b>${escapeHtml(counter)}</b></p>` : ''}
        <p>${escapeHtml(text)}</p>
        ${names.length ? `<p class="vtt-automation-picker-prompt__picked">Picked: ${names.map((n, i) => `<b>${i + 1}. ${escapeHtml(n)}</b>`).join(', ')}</p>` : ''}
        ${targetConfig.optional || targetConfig.allowDone ? `
          <div class="vtt-automation-picker-prompt__actions">
            ${targetConfig.allowDone ? '<button type="button" class="dice-clear-btn" data-automation-target-done>Done</button>' : ''}
            ${targetConfig.optional ? '<button type="button" class="dice-clear-btn" data-automation-target-skip>Skip</button>' : ''}
            <button type="button" class="dice-clear-btn" data-automation-target-cancel>Cancel</button>
          </div>
        ` : ''}
      </div>
    </section>
  `;
}
