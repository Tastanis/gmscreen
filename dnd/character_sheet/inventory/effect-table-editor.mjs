/** Local draft only. Caller owns permission checks and acknowledged persistence. */
export function openEffectTableEditor({ table, helpers, onApply }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ci-table-editor';
  dialog.setAttribute('aria-label', 'Edit effect table');
  dialog.innerHTML = '<h3>Edit table</h3><details><summary>Paste table</summary><label>Markdown or spreadsheet table<textarea class="ci-input" data-paste></textarea></label><button type="button" class="ci-btn" data-import>Use pasted table</button></details><div class="ci-effect-table__scroll" data-grid></div><div class="ci-table-editor__actions"><button type="button" class="ci-btn" data-row>+ Row</button><button type="button" class="ci-btn" data-column>+ Column</button><button type="button" class="ci-btn" data-remove>Remove table</button><button type="button" class="ci-btn" data-cancel>Cancel</button><button type="button" class="ci-btn" data-apply>Apply</button></div><p role="alert"></p>';
  let draft = table ? helpers.normalizeEffectTable(table) : { headers: ['Level', 'Effect'], rows: [['1', '']], selectedRow: 0 };
  const error = message => { dialog.querySelector('[role=alert]').textContent = message; };
  function paint() {
    const grid = document.createElement('table');
    [draft.headers, ...draft.rows].forEach((cells, row) => {
      const tr = grid.insertRow();
      cells.forEach((value, column) => {
        const input = document.createElement('input');
        input.className = 'ci-input'; input.value = value;
        input.setAttribute('aria-label', `${row ? 'Row ' + row : 'Heading'} column ${column + 1}`);
        input.addEventListener('input', () => { cells[column] = input.value; });
        tr.insertCell().append(input);
      });
    });
    dialog.querySelector('[data-grid]').replaceChildren(grid);
  }
  function close() { dialog.close(); dialog.remove(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.querySelector('[data-cancel]').onclick = close;
  dialog.querySelector('[data-import]').onclick = () => {
    try { draft = helpers.parseEffectTable(dialog.querySelector('[data-paste]').value); error(''); paint(); }
    catch (err) { error(err.message); }
  };
  dialog.querySelector('[data-row]').onclick = () => {
    if (draft.rows.length >= helpers.EFFECT_TABLE_LIMITS.rows) return error('Use up to 200 rows.');
    draft.rows.push(draft.headers.map((_, i) => i === 0 ? String(draft.rows.length + 1) : '')); paint();
  };
  dialog.querySelector('[data-column]').onclick = () => {
    if (draft.headers.length >= helpers.EFFECT_TABLE_LIMITS.columns) return error('Use up to 32 columns.');
    draft.headers.push('Column ' + (draft.headers.length + 1)); draft.rows.forEach(row => row.push('')); paint();
  };
  dialog.querySelector('[data-remove]').onclick = () => { onApply(null); close(); };
  dialog.querySelector('[data-apply]').onclick = () => {
    try { const result = helpers.normalizeEffectTable(draft); onApply(result); close(); }
    catch (err) { error(err.message); }
  };
  paint(); document.body.append(dialog); dialog.showModal();
}
