# Phase 6 — Unify PHP/JS Normalization (Long-Term)

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding F3), `pre-flight-investigation.md`. Phases 1, 2, 4, and 5 should be substantially done first.

## Context

`dnd/vtt/api/state.php` and `dnd/vtt/assets/js/state/store.js` **both** implement normalization for every state shape: placements, templates, drawings, pings, overlay, combat, grid, monsters. They are written independently and can drift. When they drift, sync breaks in subtle ways — the server and client disagree about what a "valid" placement looks like, and round-tripping data through both sides can corrupt fields.

This phase unifies them. It is a **research-and-design** project, not a pure refactor. You will need to talk to the user about trade-offs. Don't just start coding.

**This phase is optional and large.** Skip it unless:
1. The user has explicitly asked for it.
2. Phase 5 is complete (so the JS normalizers are already organized into submodules).
3. You have time to do it carefully.

## The core question

How do you share data-shape logic between PHP and JavaScript?

There is no one-right answer. The three main options:

### Option 1 — JSON Schema

Define each shape as a JSON Schema document. Validate inputs in both PHP and JS against the same schema. No shared code, but a single source of truth for "what's valid."

**Pros:** Language-agnostic, well-understood, libraries exist for both runtimes.
**Cons:** JSON Schema doesn't express *transformation* (coercion, defaulting, trimming). It only says yes/no. You still need normalization code in each language — you just have a shared test.

### Option 2 — Code generation

Write the shape definitions in one language (or a DSL) and generate both PHP and JS normalizers from them at build time.

**Pros:** Truly one source of truth. Forcing regeneration on every change keeps PHP and JS locked in step.
**Cons:** Adds a build step. Code generation is unpopular with humans. Hard to debug generated code.

### Option 3 — Stop normalizing on the server

The most radical: have the server just accept whatever the client sends (after authentication and authorization checks), store it as-is, and let the client be the source of truth for data shape. The server only validates what's strictly necessary for security (no SQL injection, no path traversal, reasonable size limits).

**Pros:** Eliminates the whole class of drift bugs because there is only one normalization implementation (JS).
**Cons:** Less defensive. A bug in client-side normalization can corrupt state for everyone. Migrations get harder (no central place to transform old data on load).

### Hybrid (recommended)

- Use Option 1 (JSON Schema) for **shape validation only** — "is this a valid placement structure?"
- Keep normalization code per-language, but write contract tests that assert both PHP and JS produce the same output for the same input.
- Gradually migrate high-risk shapes (overlay especially) toward Option 3 as you gain confidence.

The hybrid approach is the most pragmatic. It gets most of the safety without a big architectural shift.

## Prerequisites

- Phase 1 through Phase 5 substantially done.
- Tests green.
- User has been consulted and agreed on the approach.

## Files that will be touched

- `dnd/vtt/api/state.php` — probably heavily.
- `dnd/vtt/assets/js/state/normalize/*.js` — the submodules from Phase 5.
- New: `dnd/vtt/schemas/*.json` — JSON Schema documents, one per shape.
- New: contract tests somewhere that exercise both sides against shared fixtures.

## Investigation (before any coding)

1. **Catalog every normalizer on both sides.**
   - In JS: grep `state/normalize/*.js` for `export function normalize*`.
   - In PHP: grep `state.php` and any `lib/` file for `function normalize*`.
   Produce a table: shape name → JS function → PHP function → fields it touches.

2. **For each shape, diff the two implementations.** Read both normalizers for `placement`, for example, and note every field that one handles and the other doesn't. This is the drift you will fix.

3. **Identify the highest-risk shape.** Probably `overlay` (it has the most fields and the most drift surface) or `combat` (it has state machines). Start the hybrid work there.

4. **Check existing fixtures.** If there are example JSON files in `dnd/vtt/data/*.json.example`, use them as golden inputs for contract tests.

## Gotchas

- **Do not try to unify every shape in one pass.** Pick one, make the pattern work end-to-end, then repeat per shape.
- **Schema validation is stricter than the current code.** The current normalizers are forgiving — they accept malformed input and massage it into shape. A strict schema will reject input the old code would have accepted. Pick: loosen the schema, or update clients to always send clean data. The first is safer.
- **The server's normalization is also a safety barrier against malicious input.** You cannot just remove it. Any shape that uses user-provided names, URLs, or HTML needs server-side sanitization that schema validation alone does not provide.
- **PHP and JS have different ways of representing numbers, dates, and empty values.** `null`, `undefined`, `''`, `0`, `false` all have subtly different semantics in both languages. Contract tests must check these edge cases explicitly.
- **Migration of existing data.** If the unified schema is stricter than the current code accepts, existing saved states may now fail validation. Plan a data migration before deploying.

## The change (outline, not literal)

### A. Write one schema

Start with `placement`. Create `dnd/vtt/schemas/placement.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "placement",
  "type": "object",
  "required": ["id", "tokenId", "x", "y"],
  "properties": {
    "id": { "type": "string" },
    "tokenId": { "type": "string" },
    "x": { "type": "number" },
    "y": { "type": "number" },
    "stamina": { "type": "number", "minimum": 0 }
  },
  "additionalProperties": true
}
```

Allow extras (`additionalProperties: true`) at first to avoid breaking existing saves.

### B. Validate in both runtimes

- **PHP:** use `opis/json-schema` or a similar library. If no schema library is available, hand-roll a minimal validator — schemas are simple.
- **JS:** use `ajv` or similar. Or hand-roll.

Wire each normalizer to call the validator before returning. On failure, log and either reject (strict) or coerce (lenient).

### C. Write contract tests

Create `dnd/vtt/schemas/__tests__/placement-contract.test.mjs` (or PHPUnit equivalent) that:

1. Loads a golden input from a JSON file.
2. Runs both the PHP normalizer and the JS normalizer on it.
3. Asserts the outputs are identical.

Run these as part of the test suite.

### D. Repeat for other shapes

Once placement works, repeat for template, drawing, ping, overlay, combat, grid. Each is its own commit.

### E. Clean up drift

Where the PHP and JS normalizers produced different outputs for the same input, decide which is correct and update the other. Document the decision in the commit message.

## Verification

- Golden inputs produce identical output from both runtimes.
- The live VTT still works — no regression in normal play.
- Intentional malformed inputs are rejected or corrected consistently on both sides.

## Rollback

This phase is many commits, each independently revertible. If the whole approach proves misguided, revert each commit in reverse order.

## Commit message template

```
vtt-sync: phase 6 unify <shape> normalization with shared schema

Add schemas/<shape>.schema.json as the single source of truth for the
<shape> data structure. PHP and JS normalizers now both validate
against it. Contract test schemas/__tests__/<shape>-contract.test.mjs
asserts they produce identical output for golden inputs.

Drift found and fixed: <list of fields where PHP and JS disagreed>.
```

## After this phase

Phase 6 is never really "done" — you would add new shapes as the VTT grows. The test infrastructure it creates is the value. Once in place, any future shape change is a matter of:

1. Update the schema.
2. Update the two normalizers to match.
3. Run contract tests.

Drift becomes visible immediately instead of silently breaking sync.
