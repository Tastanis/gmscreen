/** Plain-text inventory tables. No HTML interpretation or implicit progression rules. */
export const EFFECT_TABLE_LIMITS = Object.freeze({ rows: 200, columns: 32, cellLength: 8000, textLength: 200000 });

export function normalizeEffectTable(table) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) throw new Error('A table needs headers and rows.');
  const { headers, rows } = table;
  if (headers.length < 2 || headers.length > EFFECT_TABLE_LIMITS.columns) throw new Error('Use 2 to 32 columns.');
  if (!rows.length || rows.length > EFFECT_TABLE_LIMITS.rows) throw new Error('Use 1 to 200 rows.');
  const copyRow = row => {
    if (!Array.isArray(row) || row.length !== headers.length) throw new Error('Every row must have the same number of cells.');
    return row.map(cell => {
      if (typeof cell !== 'string' || cell.length > EFFECT_TABLE_LIMITS.cellLength) throw new Error('Cells must be text of at most 8000 characters.');
      return cell;
    });
  };
  const copy = { headers: copyRow(headers), rows: rows.map(copyRow), selectedRow: table.selectedRow ?? 0 };
  if (!Number.isInteger(copy.selectedRow) || copy.selectedRow < 0 || copy.selectedRow >= rows.length) throw new Error('Select a row that exists in the table.');
  if (copy.headers.concat(...copy.rows).reduce((n, cell) => n + cell.length, 0) > EFFECT_TABLE_LIMITS.textLength) throw new Error('The table is too large.');
  return copy;
}

function markdownCells(line) {
  line = line.trim();
  if (line.startsWith('|')) line = line.slice(1);
  // An escaped final pipe belongs to the cell, not to the outer border.
  let slashCount = 0;
  for (let i = line.length - 2; i >= 0 && line[i] === '\\'; i--) slashCount++;
  if (line.endsWith('|') && slashCount % 2 === 0) line = line.slice(0, -1);
  const cells = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && (line[i + 1] === '|' || line[i + 1] === '\\')) cell += line[++i];
    else if (line[i] === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += line[i];
  }
  cells.push(cell.trim());
  return cells;
}

function spreadsheetRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, afterQuote = false;
  const endCell = () => { row.push(cell); cell = ''; afterQuote = false; };
  const endRow = () => { endCell(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else cell += char;
    } else if (char === '\t') endCell();
    else if (char === '\n') endRow();
    else if (char === '"' && cell === '' && !afterQuote) quoted = true;
    else {
      if (afterQuote) throw new Error('Unexpected text after a quoted spreadsheet cell.');
      cell += char;
    }
  }
  if (quoted) throw new Error('A quoted spreadsheet cell is missing its closing quote.');
  if (cell !== '' || row.length || afterQuote) endRow();
  return rows;
}

export function parseEffectTable(text) {
  if (typeof text !== 'string' || text.length > EFFECT_TABLE_LIMITS.textLength) throw new Error('Paste a table of at most 200000 characters.');
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.trim().split('\n');
  let rows;
  const separator = lines.length > 1 ? markdownCells(lines[1]) : [];
  if (separator.length >= 2 && separator.every(cell => /^:?-{3,}:?$/.test(cell))) {
    rows = [markdownCells(lines[0]), ...lines.slice(2).map(markdownCells)];
    if (separator.length !== rows[0].length) throw new Error('The Markdown separator must match the header columns.');
  } else {
    rows = spreadsheetRows(text);
  }
  return normalizeEffectTable({ headers: rows[0], rows: rows.slice(1), selectedRow: 0 });
}

export function effectTableToTsv(table) {
  const normalized = normalizeEffectTable(table);
  const quote = cell => /[\t\n\r"]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  return [normalized.headers, ...normalized.rows].map(row => row.map(quote).join('\t')).join('\n');
}
