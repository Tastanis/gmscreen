# Phase 7 — Split `board.css`

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding F2), `pre-flight-investigation.md`. No dependencies on earlier phases.

## Context

`dnd/vtt/assets/css/board.css` is 4,553 lines. It mixes grid styling, token styling, overlay styling, effects, chrome (UI borders/buttons), fog of war, templates, drawings, pings, and more. Editing it is painful because you can't find anything and unrelated rules live next to each other.

This phase splits the file into category-scoped CSS files that are concatenated or imported together so the final bundle is the same. Pure mechanical refactor. Low risk.

**This phase is independent of every other phase.** You can do it anytime.

## Prerequisites

- Tests green.
- The VTT renders correctly before you start (take a few screenshots of key screens for comparison).

## Files you will need to load into memory

1. **`dnd/vtt/assets/css/board.css`** — the whole file. Yes, all 4,553 lines. You need to see the structure.
2. **Any PHP/HTML file that links `board.css`.** Grep:
   ```
   Grep for "board.css" in dnd/vtt
   ```
   There will be at least one `<link rel="stylesheet" href="assets/css/board.css">` in a template.

## Investigation

1. **Scan `board.css` for section comments.** Large CSS files usually have `/* === Section === */` dividers. They are probably already grouped by concern. Use the existing section structure as the split line.

2. **Confirm no dynamic CSS selectors.** Sometimes PHP echoes CSS with placeholders. Grep:
   ```
   Grep for "<?php" in dnd/vtt/assets/css
   ```
   It should be empty. CSS is pure.

3. **Find every CSS selector prefix.** CSS is scoped by class prefixes like `.vtt-`, `.board-`, `.token-`, `.overlay-`. These prefixes align with the natural split.

## Gotchas

- **Cascade order matters.** CSS rules are applied in the order they appear. If rule A in "grid" overrides rule B in "tokens", splitting them into two files is fine ONLY if the files are loaded in the same order. You will load them in the same order as they currently appear in `board.css`.
- **Media queries may cross category boundaries.** If `@media (max-width: 800px)` has rules for grids, tokens, AND overlays, you cannot cleanly split them. Options: (a) duplicate the media query in each category file, (b) put all media queries in a final `board-responsive.css`. Pick (a) for simplicity unless the count is huge.
- **`:root` variables and global resets.** If the top of `board.css` has `:root { --var: value; }` blocks, those are global. Keep them in a file that loads first, e.g. `board-vars.css`.
- **`@import` vs `<link>`.** You could use `@import` inside a master `board.css`, but HTTP/2 or modern bundlers prefer separate `<link>` tags in parallel. Unless there's a build system, use separate `<link>` tags.
- **Do not change any selectors or property values.** Only move them between files. Any functional change is a different commit.

## The change

### A. Create the new files

Propose these category files under `dnd/vtt/assets/css/board/`:

```
board/
  board-vars.css       (CSS custom properties, :root, resets — loads first)
  board-grid.css       (.vtt-grid, grid lines, coordinates, calibration UI)
  board-tokens.css     (.token, token images, names, stamina bars, auras)
  board-overlay.css    (.overlay-*, fog of war, layer editor)
  board-templates.css  (.template-*, spell area shapes)
  board-drawings.css   (.drawing-*, freehand)
  board-pings.css      (.ping, ping animations)
  board-chrome.css     (panels, buttons, borders, tooltips, scrollbars)
  board-effects.css    (animations, transitions, highlights)
  board-responsive.css (all @media queries if any, loads last)
```

Start by reading `board.css` and sorting each rule into one of these buckets. Use your judgment; there is no formal rule.

### B. Move rules

One bucket per commit. For each bucket:

1. Copy the relevant rules from `board.css` to the new file.
2. Delete them from `board.css`.
3. Save both files.
4. Refresh the browser. Verify nothing is visually broken (compare against your pre-split screenshots).

### C. Update the `<link>` tags

Find the template that imports `board.css`:

```
Grep for 'board.css' in dnd/vtt/templates
```

Replace the single `<link>` with one per new file, in load order:

```html
<link rel="stylesheet" href="assets/css/board/board-vars.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-grid.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-tokens.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-overlay.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-templates.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-drawings.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-pings.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-chrome.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-effects.css?v=<?= $assetVersion ?>">
<link rel="stylesheet" href="assets/css/board/board-responsive.css?v=<?= $assetVersion ?>">
```

Delete the old `<link rel="stylesheet" href="assets/css/board.css">` line.

### D. Delete the old `board.css`

After all rules have been moved and the template updated:

```bash
# Make sure there are no remaining rules in the old file
wc -l dnd/vtt/assets/css/board.css
# Should be 0 or just a comment header.
rm dnd/vtt/assets/css/board.css
```

### E. Verify

- Hard refresh the VTT in a browser.
- Compare against your pre-split screenshots.
- Click through: main board, token library, scene manager, settings panel, combat tracker.
- Resize the window to trigger responsive rules.

If anything looks wrong, `git diff` the new files against the old `board.css` to see which rules got lost or reordered.

## Rollback

```bash
git checkout HEAD -- dnd/vtt/assets/css/board.css dnd/vtt/templates/*.php
rm -rf dnd/vtt/assets/css/board/
```

## Commit messages

Commit per bucket:
```
vtt-sync: phase 7 split board-<category> rules into board/<category>.css

Move the <category> rules from board.css into the new file. No
functional changes - cascade order is preserved by loading files in
the same order the rules appeared.
```

Final commit after deletion:
```
vtt-sync: phase 7 delete obsolete board.css after split

All rules have been moved to board/board-*.css files. The template
now loads them in order. Old file removed.
```

## After this phase

The other oversized CSS file is `settings.css` at 1,266 lines. It can get the same treatment if the user wants, but it's much smaller and not as painful. Same methodology. Not worth a dedicated doc.
