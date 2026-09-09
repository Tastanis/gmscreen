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


### Inventory stale-field protection - 1.19.136

Inventory load/item responses include response-only _fieldRevisions. Current field
edits send expected_revision and compare it under the existing request-wide lock
before mutation. Conflicts preserve the saved file and use the existing error line;
the unsaved local draft remains dirty/visible. Successful responses update only
related field revisions, so an unrelated edit cannot silently rebase a stale name.
Charges/hasCharges and effect/effectSections share dependency fingerprints and
serialize together in the client. Failed groups discard queued/debounced automatic
continuations. Metadata is never persisted into item records.

New PHP regression proves stale rejection with unchanged file bytes, independent
fields, sequential accepted revisions and charge-field dependencies. Real two-editor
browser regression proves stale name rejection, retained text and an independent
description save. Existing refresh/save-order browser checks pass; save-order now
asserts each outgoing expected revision. No live inventory was changed.

Boundary: legacy callers omitting expected_revision remain compatible; save_item,
image upload, deletion and moves are not made revision-guarded by this slice.
Unconfirmed-save recovery and inventory table UI remain unfinished. Do not claim
all inventory mutation paths or old already-open client versions are protected.


### Reviewed inventory deletion and moves - 1.19.137

Current delete/share/take controls send expected_item_fields from their last known
field revisions. The locked server compares every field before removal/move;
stale requests leave the original inventory unchanged. Take checks visibility
before revision comparison. Legacy callers omitting the guard remain compatible.
The UI never rebases unseen fields merely because another field save succeeded.

PHP tests cover stale delete/move file preservation and freshly reviewed successful
move/delete. Two real browser editors now exercise rejected Delete and Move buttons
in addition to stale field editing. All use disposable localhost data. Whole-item
save/image upload guards, pending-unsaved-edit behavior during move, and unknown
write outcomes remain unfinished; do not claim all mutation paths are protected.
