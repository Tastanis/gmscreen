# Handoff: Update Student Importer for New Layout

## Context

The student and staff character layouts were updated from the old field structure to a new "Conflict Engine" based layout. The **modal forms** and **data structures** now use the new fields, but the **student importer** still maps incoming JSON to the old fields only.

### Old Fields (still in data structure for backward compatibility)
```
character_info: { origin, desire, fear, connection, impact, change }
details: { backstory, core_want, core_fear, other }
```

### New Fields (what the modal actually displays now)
```
conflict_engine: { want, want_tag, obstacle, action, consequence }
tension_web: [ { name, role, description }, ... ]
pressure_point: "" (single rich text field)
trajectory: "" (single rich text field)
directors_notes: "" (single rich text field, collapsed by default in UI)
```

## What Needs Updating

### 1. `students/import_student.php` — PHP backend mapping

**Current behavior (lines 165-191):** The `mapImportDataToStudent()` function maps incoming `character_information` fields to the old `character_info` object and `other_notes` to `details.other`. None of the new fields are handled.

**Needed changes:**
- Add mapping for `conflict_engine` object (want, want_tag, obstacle, action, consequence)
- Add mapping for `tension_web` array of objects (each with name, role, description)
- Add mapping for `pressure_point` (string)
- Add mapping for `trajectory` (string)
- Add mapping for `directors_notes` (string)
- Optionally: keep the old `character_information` mapping working for backward compatibility with old-format JSON exports, but also map it forward into the new fields if the new fields aren't provided

### 2. `students/js/student-import.js` — JS preview/validation

**Current behavior (lines 258-290):** The `generatePreview()` function displays previews for `character_information` (origin, desire, fear, connection, impact, change) and `other_notes`. It knows nothing about the new fields.

**Needed changes:**
- Add preview rendering for `conflict_engine` (Want, Obstacle, Action, Consequence + want_tag)
- Add preview rendering for `tension_web` entries (show name, role, description for each)
- Add preview rendering for `pressure_point`
- Add preview rendering for `trajectory`
- Add preview rendering for `directors_notes`

### 3. `students/student-import.php` — HTML example display

**Current behavior (lines 197-217):** Shows an inline JSON example using the old format with `character_information` fields.

**Needed changes:**
- Update the inline example to show the new field format
- The example should match the updated `sample-character.json`

### 4. `students/js/students.js` — Export function

**Current behavior (`cleanStudentExportSections`, ~line 2093):** The export function only exports old `character_info` and `details.other` fields. When you export a student, the new fields (conflict_engine, tension_web, etc.) are silently dropped.

**Needed changes:**
- Add export of `conflict_engine` fields (strip HTML, skip empty)
- Add export of `tension_web` array
- Add export of `pressure_point` (strip HTML, skip if empty)
- Add export of `trajectory` (strip HTML, skip if empty)
- Add export of `directors_notes` (strip HTML, skip if empty)
- Decide whether to keep exporting old `character_info`/`details` fields or drop them

## Reference Files

| File | Purpose |
|------|---------|
| `sample-character.json` | Already updated with new format — use as reference |
| `students/data-utils.php` | Blank student record structure (has both old and new fields) |
| `students/index.php` | PHP save handler — already handles new field paths |
| `students/js/students.js` | Modal rendering + export — modal uses new fields, export still uses old |
| `students/import_student.php` | PHP import backend — needs update |
| `students/js/student-import.js` | JS import preview — needs update |
| `students/student-import.php` | Import page HTML with inline example — needs update |

## Additional Consideration: Remove Legacy Fields

Once the importer and exporter are updated, the legacy `character_info` and `details` fields could be fully removed from:
- `students/data-utils.php` (blank record)
- `staff/data-utils.php` (blank record)
- `students/character-details.php` (the "Legacy" display section)
- `staff/character-details.php` (the "Legacy" display section)
- `students/index.php` (the `character_info.*` and `details.*` save handlers)
- `staff/index.php` (same)

Existing student data in `students.json` would still have the old fields in the JSON but nothing would read them. The old data would not be lost — just no longer displayed. A migration script could be written to move old field data into the new fields if desired, but it's not required since existing characters can be manually updated through the UI.
