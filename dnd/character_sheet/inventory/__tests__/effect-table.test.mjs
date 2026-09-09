import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEffectTable, normalizeEffectTable, effectTableToTsv } from '../effect-table.mjs';

test('Markdown level matrices preserve every supplied row and value', () => {
  const text = '| Level | Result |\n|---:|---|\n' + Array.from({ length: 20 }, (_, i) => `| ${i + 1} | Supplied result ${i + 1} |`).join('\n');
  const table = parseEffectTable(text);
  assert.equal(table.rows.length, 20);
  assert.deepEqual(table.rows[19], ['20', 'Supplied result 20']);
  assert.equal(table.selectedRow, 0);
  const other = normalizeEffectTable({ ...table, selectedRow: 7 });
  assert.equal(table.selectedRow, 0);
  assert.equal(other.selectedRow, 7);
  other.rows[0][1] = 'Changed';
  assert.equal(table.rows[0][1], 'Supplied result 1');
});

test('spreadsheet paste round-trips quoted tabs, newlines, quotes and plain HTML text', () => {
  const source = { headers: ['Level', 'Result'], rows: [['1', 'Line one\nLine two\t"quoted"'], ['2', '<script>alert(1)</script>']], selectedRow: 0 };
  assert.deepEqual(parseEffectTable(effectTableToTsv(source)), source);
  assert.deepEqual(parseEffectTable('\uFEFFLevel\tResult\r\n1\t\r\n').rows, [['1', '']]);
});

test('escaped Markdown pipes and empty cells are preserved', () => {
  assert.deepEqual(parseEffectTable('| Level | Result |\n|---|---|\n| 1 | a\\|b |\n| 2 | |').rows, [['1', 'a|b'], ['2', '']]);
});

test('malformed or oversized input is rejected instead of silently truncating values', () => {
  for (const text of ['ordinary item notes', 'A\tB\n1', 'A\tB\n1\t"unfinished', 'A\tB\n1\t"closed"extra', '|A|B|\n|---|---|---|\n|1|2|']) assert.throws(() => parseEffectTable(text));
  assert.throws(() => parseEffectTable('A\tB\n1\t' + 'x'.repeat(8001)));
  assert.throws(() => normalizeEffectTable({ headers: ['A', 'B'], rows: [['1', '2']], selectedRow: 2 }));
});
