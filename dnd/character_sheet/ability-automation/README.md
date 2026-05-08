# Ability Automation — Implementation Plan

This document is the source of truth for the ability-automation feature on
character sheets. It captures locked-in design decisions, the v1 scope,
the data model, the folder layout, and a step-by-step build order.

Read this in full before writing code.

---

## 1. Overview

Players (and the GM) need to "automate" each ability on a character sheet so
that, in play, clicking the ability runs through targeting, dice, damage,
forced movement, and condition application without manual bookkeeping.

This feature ships in two halves:

1. **Authoring (v1, this plan):** a card-stack form on the character sheet
   that lets the user describe an ability's automation as data. Output is a
   structured `automation` field added to each ability JSON.
2. **Runtime (later):** an engine that reads that `automation` field and
   actually plays the ability on the VTT (templates, rolls, damage, push,
   etc.). **Out of scope for v1.**

v1 only builds the authoring half.

---

## 2. Locked-in design decisions

From the planning questionnaire:

- **Card order is fully flexible.** No enforcement of "target before roll"
  or similar.
- **Validity is "show, never limit."** Where the engine eventually
  computes valid push squares / valid teleport destinations, it must
  highlight and suggest, but never block the user from choosing
  otherwise. (Authoring v1 doesn't need to compute this — but the schema
  and primitives must be designed so the runtime can later.)
- **Per-step undo** during resolution (runtime concern; flag for later).
- **Save-ends conditions are already tracked by the token system.** The
  automation just applies the condition; the existing token UI handles
  the rest.
- **Multi-target abilities are a day-one design goal.** Target cards
  produce named references that effect cards consume.
- **Damage types matter.** Schema must carry a damage type per damage
  effect.
- **Five characteristics:** Might, Agility, Reason, Intuition, Presence.
- **Conditions:** use the token system's built-in condition set, plus a
  free-text "other" for non-standard cases (post-v1 nicety).
- **Validation:** warn but allow saving (red badge on cards with issues).
- **Live preview:** yes — render an ability-card-style preview as the
  user authors.
- **Storage:** each character has its own copy of every ability, so
  automation rides inside the existing character JSON. No new tables, no
  new files.
- **Resources are auto-deducted at use time** (runtime concern; v1 just
  records the cost on the ability).

---

## 3. v1 scope

### In scope

- "Automate" button injected at the bottom of every ability card in
  edit mode.
- Modal that opens when the button is clicked.
- Card-stack authoring UI inside the modal, supporting these card types:
  - **Target** — who + where (composer with shortcut presets)
  - **Power Roll** — characteristic
  - **Damage** — amount, characteristic bonus, damage type, per-tier
  - **Push** — distance, per-tier
- Drag-to-reorder cards within the stack.
- Effect cards reference a target card by ID (`appliesTo`).
- Live preview side panel.
- Save: the automation JSON is written into the existing character
  JSON via the existing save flow (no new endpoint).
- Validation: warn-but-allow, with red badge on broken cards.

### Sufficient to author this v1 example ability

> **Test Strike** — Main action, Melee 1, one creature. Power roll +
> Agility. T1: 4+A damage; push 2. T2: 6+A damage; push 4. T3: 8+A
> damage; push 6.

(This is essentially Phase Inversion Strike minus the teleport.)

### Out of scope for v1 (defer)

- The runtime engine that actually plays the ability.
- Pull / slide (only push for v1; pull and slide reuse the same primitive
  later).
- Teleport.
- Potency-gated conditions.
- Apply-condition card.
- Heal card.
- Zones / persistent areas.
- Triggered ability triggers.
- Optional "Spend N more for X" modifier card.
- Rebuy persistence.
- Cloning, drafts, JSON import/export.
- Any monster authoring.

These are all on the long-term roadmap; the v1 schema and primitive
registry must be designed so they slot in later without refactoring.

---

## 4. Folder structure

```
dnd/character_sheet/ability-automation/
  README.md            (this file)
  builder.js           Modal controller + card stack UI logic
  builder.css          Styling for cards, modal, preview pane
  primitives.js        Primitive registry — one entry per card type
  schema.js            Validation: returns list of warnings, never blocks
```

Files modified outside the new folder:

- `dnd/character_sheet/sheet.js` — inject the "Automate" button at the
  bottom of each action card render (around line 2515, inside
  `renderActionSection`). Edit-mode only. Wire its click to
  `AbilityAutomation.open(actionId, actionType)` exported by
  `builder.js`.
- `dnd/character_sheet/index.php` — `<link>` builder.css and `<script>`
  builder.js + primitives.js + schema.js.
- `dnd/character_sheet/handler.php` — **no changes needed.** The
  existing save action persists the entire `sheetState`, so the new
  `automation` field on each ability is saved automatically.

---

## 5. Data model

The new field on each ability:

```json
{
  "id": "action_1730000000000_abc",
  "name": "Phase Inversion Strike",
  "actionLabel": "Main Action",
  "tags": ["Melee", "Psionic", "Strike", "Weapon"],
  "range": "Melee 1",
  "target": "One creature or object",
  "cost": "",
  "description": "...",
  "useWhen": "",
  "tests": [ /* existing manual test rows — leave alone */ ],
  "trigger": "",

  "automation": {
    "version": 1,
    "steps": [
      {
        "id": "step_target_1",
        "type": "target",
        "who": "enemy",
        "where": { "kind": "melee", "distance": 1 }
      },
      {
        "id": "step_roll_1",
        "type": "powerRoll",
        "characteristic": "agility"
      },
      {
        "id": "step_damage_1",
        "type": "damage",
        "appliesTo": "step_target_1",
        "tiers": {
          "t1": { "amount": 4, "plus": "agility", "damageType": "physical" },
          "t2": { "amount": 6, "plus": "agility", "damageType": "physical" },
          "t3": { "amount": 8, "plus": "agility", "damageType": "physical" }
        }
      },
      {
        "id": "step_push_1",
        "type": "push",
        "appliesTo": "step_target_1",
        "tiers": {
          "t1": { "distance": 2 },
          "t2": { "distance": 4 },
          "t3": { "distance": 6 }
        }
      }
    ]
  }
}
```

### Field semantics

- `automation` is **optional**; abilities without it just don't run
  through the engine. v1 simply omits the field for un-automated abilities.
- `version: 1` lets us migrate the schema later without breaking old data.
- `steps` is an ordered array — order matters for display and for
  runtime execution, but authoring imposes no ordering rules.
- Each step has a unique `id`. Generate as
  `step_{type}_{shortRandom}`.
- Effect steps reference a target step via `appliesTo: "<step_id>"`. If
  there is exactly one Target card in the stack, default `appliesTo` to
  it. If zero or multiple, the form must prompt the author to pick.
- Tier keys are `t1`, `t2`, `t3` — corresponding to ≤11, 12–16, 17+ on
  the power roll. Use these keys consistently (do not reuse the
  existing `low/mid/high` from the manual tests; keep the two systems
  cleanly separate for now).

### Primitive registry (`primitives.js`)

Each primitive declares: `type`, `label`, `defaults()`, `fields[]` (form
schema), `summary(step)` (one-line text for the collapsed card).

Primitives required for v1:

| type | summary template |
|---|---|
| `target` | "Target: {who} — {where description}" |
| `powerRoll` | "Power Roll + {Characteristic}" |
| `damage` | "Damage: {t1}/{t2}/{t3} {type}" |
| `push` | "Push {t1}/{t2}/{t3}" |

Primitives planned but **not built in v1** (stub the registry so they
can be added later without restructuring): `pull`, `slide`, `teleport`,
`applyCondition`, `heal`, `optionalSpend`, `zone`, `rebuy`, `trigger`.

### Targeting taxonomy (composer)

`who` — string from this fixed set:
`self`, `ally`, `enemy`, `selfOrAlly`, `anyCreature`, `creatureOrObject`,
`specificToken`, `multipleTokens`.

`where` — object:
- `{ kind: "self" }`
- `{ kind: "melee", distance: 1 }`
- `{ kind: "ranged", distance: 10 }`
- `{ kind: "cube", size: 3, range: 10 }`
- `{ kind: "line", length: 6 }`
- `{ kind: "burst", radius: 2, origin: "self" | "target" }`

Shortcut presets in the UI map onto these (e.g. "Melee 1, one creature"
= who:`enemy`, where:`{ kind: "melee", distance: 1 }`).

---

## 6. UI specification

### 6.1 The Automate button

- Rendered inside every action card, edit mode only.
- Position: at the very bottom of the card (after description block).
- Visual: small, low-emphasis. Use a CSS class like
  `action-card__automate-btn`. Match existing edit-mode chrome —
  reference the `.edit-only` pattern at sheet.js:3119 and the chip
  styling on the card head.
- Label: "Automate" (no icon needed for v1; can add later).
- If the ability already has an `automation` block, the button reads
  "Edit Automation" instead and shows a small green dot.
- Click: opens the builder modal for this ability.

### 6.2 The builder modal

- Use the existing modal pattern (reference `sheet.js:1924`,
  `styles.css:1985`).
- Layout: two columns inside the modal body.
  - **Left (≈60%):** the card stack — toolbar at top, draggable cards
    below, "Add card" button at bottom.
  - **Right (≈40%):** live preview rendered as an ability-card-style
    block, plus a validation badge area.
- Footer: Save / Cancel.
- Cancel discards changes (in-memory only; nothing is persisted until
  Save).

### 6.3 Card stack

- Each card has: a colored left border by type (target=blue,
  powerRoll=purple, damage=red, push=orange), a title (the
  primitive `label`), a one-line summary when collapsed, an expand
  toggle, drag handle, and delete button.
- Expanded card shows the form fields declared by the primitive.
- Drag-and-drop reordering by handle. Use the simplest viable
  approach (HTML5 drag-and-drop or a tiny library) — do not pull in a
  large dep.
- The "Add card" button opens a small popover listing only the v1 card
  types. (Planned-but-not-built primitives must not appear yet.)
- Tier-aware fields: damage and push render three rows (T1 / T2 / T3)
  inside the card. A "Fill all tiers from T1" helper button speeds
  authoring uniform abilities.

### 6.4 Live preview

- Re-renders on every change.
- Renders a read-only summary of the ability the way it will eventually
  appear at use time. For v1 a simple text rendering is enough:
  ```
  Target: Each enemy in Melee 1
  Power Roll + Agility
    T1 (≤11): 4 + Agility damage; push 2
    T2 (12–16): 6 + Agility damage; push 4
    T3 (17+):   8 + Agility damage; push 6
  ```

### 6.5 Validation (warn-but-allow)

- Run `schema.validate(automation)` on every change.
- Returns `{ warnings: [{ stepId, message }] }`.
- Cards with warnings show a red badge with a tooltip listing issues.
- Save is **never blocked**, but the modal footer shows a count
  ("⚠ 2 warnings — save anyway?").

Required v1 warnings:
- Effect card with `appliesTo` pointing at a non-existent step.
- Effect card with no `appliesTo` and 0 or >1 target cards in the stack.
- Power roll card missing a characteristic.
- Damage card with no amount in any tier.
- Push card with no distance in any tier.

---

## 7. Persistence

The save flow is the existing one:

1. Builder writes to an in-memory copy of the action object.
2. On Save, the builder calls a hook on `sheet.js` that updates the
   master `sheetState.actions[type][index].automation` and triggers a
   normal save.
3. `handler.php` writes the whole sheet — automation is included for
   free.

`builder.js` must not call `fetch` directly. It hands the new
`automation` object back to a callback supplied by `sheet.js`, which
then runs the existing save.

---

## 8. Build order (recommended sequence)

1. **Skeleton wiring.** Create the four files in
   `ability-automation/` (empty stubs). Add `<link>`/`<script>` tags in
   `index.php`. Inject the "Automate" button at sheet.js:2515 with a
   click handler that just `console.log`s for now. Confirm the button
   renders only in edit mode.
2. **Modal shell.** Open/close a modal using the existing modal
   pattern. Wire Save/Cancel buttons (no logic yet).
3. **Primitive registry.** Implement `primitives.js` with the four
   v1 types. Each entry: `type`, `label`, `defaults()`, `fields[]`,
   `summary(step)`.
4. **Card rendering.** From the in-memory `automation.steps` array,
   render one card per step. Implement expand/collapse, summary text,
   delete.
5. **Add card flow.** Toolbar button → popover → user picks a type →
   new step pushed onto the array with `defaults()`.
6. **Field editing.** Bind primitive `fields[]` to inputs. Edits update
   the in-memory step and re-render the card and preview.
7. **Drag-to-reorder.** Implement reordering. Re-render after.
8. **`appliesTo` wiring.** Effect cards show a target picker dropdown
   listing all current target steps by id. Auto-select the only one if
   exactly one exists.
9. **Live preview.** Implement a simple text-based renderer in
   `builder.js`. Re-render on every change.
10. **Validation.** Implement `schema.validate()`. Render warnings
    inline on cards and in the footer.
11. **Save integration.** Wire the modal Save button to call back
    into `sheet.js` with the new `automation` block. Make sure it
    persists across reload.
12. **Manual test:** author the v1 example ability (Test Strike) end
    to end. Reload the page. Confirm the data round-trips. Confirm the
    "Automate" button now reads "Edit Automation" with a green dot.

Stop at step 12. Do not begin the runtime engine.

---

## 9. Coding conventions to follow

- Match existing BEM-style class naming
  (`.ability-automation__card--target`, etc.).
- Reuse existing CSS variables (`--accent`, `--panel`, `--border`,
  etc.) from `styles.css:1`.
- Keep `builder.js` self-contained — expose a single global
  `window.AbilityAutomation = { open(actionId, actionType, currentAutomation, onSave) }`.
- No new external dependencies. Plain JS, no framework.
- No comments explaining what code does — only why, when non-obvious.
- Run with the version system (`Version::displayVersion()`) — the
  existing footer will tick automatically. Manually bump minor on
  feature merge.

---

## 10. Things specifically NOT to do in v1

- Do **not** build any runtime / play-mode execution of automation.
- Do **not** modify or migrate the existing `tests` array on abilities.
- Do **not** create a new database table or new save endpoint.
- Do **not** add primitives for teleport, conditions, heal, zones, or
  triggers (registry placeholders are fine; UI must not surface them).
- Do **not** integrate with the VTT board, dice roller, or token system.
- Do **not** write tests automation can run; runtime is a separate
  later phase.
- Do **not** add ability cloning, drafts, JSON import.
