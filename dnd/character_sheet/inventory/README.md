# Inventory effect tables

Each `effectSections` entry may contain a `table` with plain-text `headers`, an
array of equal-width `rows`, and a zero-based `selectedRow`. Selection belongs to
that effect, not to the character level. The normal inventory permissions and
request-wide lock apply; no new endpoint or ability-automation fields are added.

`effect-table.mjs` parses Markdown/TSV and validates local data.
`../InventoryEffectTable.php` validates data before inventory writes. Both use
2-32 columns, 1-200 data rows, 8000 UTF-16 code units per cell and 200000 total cell
code units. The paste parser additionally caps source text at 200000 characters.
No truncation or HTML execution is permitted; renderers must escape every cell.

Omitting `table` while editing an existing section preserves its saved table by
section ID, supporting older clients. Explicit `table: null` removes it. Removing
a section removes its table. Ordinary client section normalization and DOM text
editing retain tables. Table rows are copied by the JS normalizer so effects can
be edited independently.

The storage and parser are implemented. The inventory table display/editor is
not yet connected; the compact layout proposal still awaits a user response.
