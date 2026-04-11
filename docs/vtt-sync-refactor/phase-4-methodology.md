# Phase 4 — Methodology for Dismantling `board-interactions.js`

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (findings F1 and F2), `pre-flight-investigation.md`. **Read this file before doing any individual phase-4 extraction.**

## Context

`dnd/vtt/assets/js/ui/board-interactions.js` is **19,969 lines long** and holds at least 15 distinct responsibilities. It is the biggest source of "I'm scared to edit this" friction in the codebase. Phase 4 is a series of extractions that break it into smaller, single-responsibility modules without changing behavior.

This file describes the **methodology** — the process, safety rails, and shared steps that apply to every extraction. The specific extraction targets are listed in `phase-4-extraction-targets.md`.

**Do not start an extraction without reading both this file and the target-specific instructions.** The whole point of phase 4 is to make edits *less* risky, so a sloppy extraction defeats the purpose.

## Why this is different from other phases

Phases 1, 2, and 3 change behavior. Phase 4 changes *only* structure. The code should do exactly the same thing before and after each extraction. The test suite is your safety net. If a test breaks during an extraction, one of three things is true:

1. You moved something wrong (most common).
2. The test was asserting on the *location* of a symbol, not its behavior (usually wrong, update the test).
3. Hidden coupling through a module-level variable was broken (most dangerous — see below).

Never do an extraction and a behavior change in the same commit. One or the other. Not both.

## The hidden coupling problem

`board-interactions.js` has **module-level mutable variables** that many functions silently read and write. Examples from the diagnosis:

- `isApplyingState` — true while state is being applied, to prevent re-entrant updates.
- `overlayLayerSeed` — monotonic counter for overlay layer IDs.
- `pusherConnected` — flipped by `handlePusherConnectionChange`.
- `lastBoardStateSaveCompletedAt` — timestamp of last save, used by the grace period.
- `combatStateRefreshIntervalId` — interval handle for the combat loop (already deleted if you did Phase 1-3).
- `boardStatePollerHandle` — interval handle for the main poller (added in Phase 1-2).

When you extract a function out of the file, if that function reads or writes one of these variables, the extraction will silently break unless you:

1. Move the variable too, or
2. Pass it in as an argument, or
3. Expose it through an accessor on a shared context object.

**You must map every shared variable the function touches before you extract it.** If you do not, you will get heisenbugs — the tests will pass, the extraction will look clean, and behavior will silently diverge in some rare code path nobody tests.

## The 8-step extraction process

Follow this for every extraction. Do not skip steps.

### Step 1: Read the target doc

Open `phase-4-extraction-targets.md` and find the target you're extracting. Read its full description. Note:
- The approximate line range in `board-interactions.js`.
- The responsibility it owns.
- The new file path it should live at.
- Any target-specific gotchas.

### Step 2: Map the function boundary

Use Read and Grep to find the exact start and end of the code you're moving. In particular:
- Find every `function` or `const X = (...) =>` or `let X = (...) =>` that belongs to this responsibility.
- Find module-level state variables (top of file) that only these functions use.
- Find module-level state variables that these functions use AND other functions also use — these are the shared-state risks.

Write down, in your working notes:

```
Target: <name>
Functions to move:
  - functionA (lines X-Y)
  - functionB (lines X-Y)
Module-level state only used here:
  - let localVar1
Module-level state shared with others:
  - let sharedVar1 — used by: functionA, functionX (OUTSIDE target)
  - let sharedVar2 — used by: functionB, functionY (OUTSIDE target)
External dependencies (imports, DOM queries, other module functions):
  - createSomething from '../utils.js'
  - window.requestAnimationFrame
  - document.getElementById('vtt-main')
```

If any shared variable is used by code both inside and outside the extraction target, **do not extract that variable**. It stays in `board-interactions.js`. You will pass it into the extracted functions as an argument or capture it in a factory-style closure.

### Step 3: Run the test suite on the unchanged file

Before touching anything:

```bash
cd /home/user/gmscreen/dnd/vtt && npm test
```

Green? Good. Red? Stop and tell the user.

### Step 4: Create the new file skeleton

Create the target file (path from `phase-4-extraction-targets.md`). Start with just a header comment and the necessary imports:

```js
/**
 * <Responsibility name>
 *
 * Extracted from dnd/vtt/assets/js/ui/board-interactions.js as part of
 * the phase 4 refactor. Do not add unrelated code to this file.
 */

// ... imports ...

export function create<Feature>({ /* dependencies passed from caller */ }) {
  // ... function body ...
}
```

Most extractions should use a "factory function that returns an object" shape, not module-level state. This is because the original `board-interactions.js` uses module-level state, and passing it explicitly as factory arguments is the cleanest way to make the coupling visible without changing the underlying lifecycle.

### Step 5: Move the code

Move the target functions from `board-interactions.js` into the new file. Wrap them in the factory function. Replace every use of a module-level variable with either:

- A factory argument (`dependencies.getPusherConnected()`),
- A return value from the factory (`return { step1, step2 }`),
- Or a closure-captured local (if the variable only matters to these functions).

In `board-interactions.js`, import the factory and call it at the point where it needs to be wired up, passing the dependencies it needs:

```js
import { createIndigoRotation } from './indigo-rotation.js';

// ...
const indigoRotation = createIndigoRotation({
  windowRef: window,
  boardApi,
});
indigoRotation.start();
```

Delete the original functions from `board-interactions.js`.

### Step 6: Run tests again

```bash
cd /home/user/gmscreen/dnd/vtt && npm test
```

If something broke, **stop and read the failure.** Do not mass-suppress. Common failure modes:

- **"Cannot find module"** — your new file path is wrong, or you forgot the `.js` extension.
- **"X is not defined"** — a module-level variable you missed. Go back to step 2 and remap.
- **"Expected A to equal B"** — a behavioral test caught a coupling you broke. Read the test, understand what it's checking, and fix the extraction — do not disable the test.
- **Test setup errors** — the test mocks `board-interactions.js` globally. You may need to update the test file's imports.

### Step 7: Add a smoke test for the new module

In a new `__tests__/<module-name>.test.mjs`, write at least one test that instantiates the factory and exercises one public method. This is not full coverage — it's a smoke test. The real coverage still comes from `board-interactions.test.mjs`.

### Step 8: Commit

Each extraction gets its own commit. Do not batch multiple extractions into one commit. Example commit message:

```
vtt-sync: phase 4 extract indigo rotation animation

Move the indigo rotation setInterval loop (~80 lines) from
board-interactions.js into a new ui/indigo-rotation.js factory.
Dependencies (windowRef, placement state accessor, rotation step
function) are now passed explicitly instead of read from module
scope. board-interactions.js wires it up during init.

Behavior unchanged. Tests green. Smoke test added in
__tests__/indigo-rotation.test.mjs.
```

## Safety rails

### Never in the same commit

- Never extract and rename.
- Never extract and rewrite logic.
- Never extract multiple features.
- Never extract and change imports in unrelated files.

One commit = one responsibility moved, zero behavior changes.

### When to stop

If an extraction turns up surprises — a module-level variable you didn't expect, a function with 400 lines of nested closures, a circular dependency — **stop and report to the user**. Do not force it. Phase 4 is about reducing risk, not adding it.

If after step 6 you cannot get the tests green within a reasonable amount of effort (say, an hour of focused debugging), roll back the extraction and pick a different target. Some extractions are harder than others; not every target in `phase-4-extraction-targets.md` can be done at the current state of the codebase.

### Rollback

Each extraction lives in its own commit. To roll back one:

```bash
git revert <commit-hash>
```

Do not `reset --hard` on the branch. Use revert so the history is clean.

## Order of operations

The targets in `phase-4-extraction-targets.md` are listed in recommended order — easiest and lowest risk first, hardest and highest risk last. Follow the order unless you have a reason not to. In particular:

- **Do the board state poller extraction first.** It already has dedicated tests (`__tests__/board-state-poller.test.mjs`) so the safety net is strongest. After this one extraction, `board-interactions.js` drops by ~300 lines and the file is already noticeably more navigable.
- **Do the template tool and overlay tool last.** These are the biggest chunks (each 1,500+ lines) and have the most hidden coupling. You need experience with easier extractions before attempting these.

## Using the Explore agent

Phase 4 is the first phase where using the Agent tool (`subagent_type: Explore`) is genuinely worth it. Before each extraction, consider running an Explore agent with a prompt like:

> "Read `dnd/vtt/assets/js/ui/board-interactions.js`. Find the '<target responsibility>' section — it's approximately lines X to Y. List every module-level variable it reads or writes, every function it calls outside its own section, and every DOM element or external resource it touches. Report as a dependency map. Do not suggest changes."

This frontloads the 'step 2: map boundaries' work and can catch surprises before you start editing.

## After every extraction

Tell the user:

- What module is now extracted.
- What `board-interactions.js` line count is now.
- Whether any tests needed updating.
- What the next target is.

Ask whether to continue or stop.

---

**Now open `phase-4-extraction-targets.md` for the list of specific targets and their individual gotchas.**
