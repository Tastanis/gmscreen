# Pre-Flight Investigation (Do Before Every Fix)

**Every fix doc references this file.** Before you begin any fix, do these steps. They take under five minutes and prevent most of the ways a refactor can go wrong.

## 1. Confirm you are on the right branch

```bash
git status
git branch --show-current
```

Expected: branch is `claude/app-communication-architecture-y5g1l`. If it is not, switch to it:

```bash
git checkout claude/app-communication-architecture-y5g1l
```

If the branch does not exist locally, create it from the current `main`:

```bash
git fetch origin
git checkout -b claude/app-communication-architecture-y5g1l origin/claude/app-communication-architecture-y5g1l 2>/dev/null || \
  git checkout -b claude/app-communication-architecture-y5g1l
```

Confirm working tree is clean (`git status` shows "nothing to commit"). If there are stray uncommitted changes that you did not make, **stop and report to the user** — don't assume they are yours to overwrite.

## 2. Pull latest changes

```bash
git pull origin claude/app-communication-architecture-y5g1l
```

If there is no remote branch yet, this will error harmlessly. Proceed.

## 3. Verify tests pass before you start

There is a JavaScript test suite under `dnd/vtt/assets/js/**/__tests__/`. Before editing anything, run it and confirm it is green. The exact command depends on the repo's package.json setup. Try in this order:

```bash
# Most likely
cd /home/user/gmscreen/dnd/vtt && npm test

# If that fails with "no package.json" or similar:
cd /home/user/gmscreen && npm test

# If neither works, use node --test directly:
cd /home/user/gmscreen && node --test dnd/vtt/assets/js/**/__tests__/*.test.mjs
```

**If tests are already failing before you start, stop.** Do not try to fix pre-existing failures as part of your fix. Report the failures to the user and ask whether to proceed or fix them first.

There are no PHP tests. Server-side fixes must be manually verified. See each fix's Verification section.

## 4. Read the diagnosis

Read `docs/vtt-sync-refactor/diagnosis-findings.md` if you have not already in this session. It is the authoritative description of what is broken. Fixes will reference findings by code (C1, C2, S1, etc.); you need to know what those mean.

## 5. Verify line references

The fix docs cite specific line ranges (for example, "around lines 3871-3874 in `board-interactions.js`"). Lines drift every time anyone edits the file. **Open the file and confirm the reference is still accurate before acting on it.** If the reference has drifted, use Grep to find the actual code block by content, not by line number.

Example: a doc says "modify the code at `board-interactions.js:3871-3874`". You should verify like this:

```
Read board-interactions.js lines 3860-3890
```

and confirm you see the `startBoardStatePoller(); startCombatStateRefreshLoop(); initializePusherSync();` sequence. If you don't, search for `initializePusherSync();` with Grep and navigate from there.

## 6. Identify which fixes are already in

Some fixes depend on previous ones. Before starting, check the git log to see what's already applied on the branch:

```bash
git log --oneline -30 claude/app-communication-architecture-y5g1l
```

Each fix in this plan uses a commit message prefix like `vtt-sync: phase 1-1 fix init order`. You can grep the log for `vtt-sync:` to see what's done.

If a fix's prerequisites are not in the log, **stop and tell the user**. Do not try to do prerequisites implicitly; each fix should be its own commit.

## 7. Check for in-progress work elsewhere

If the user mentions they have another Claude Code session running, ask which branch and which files it is working on. Do not both edit the same file at the same time.

## 8. Never

- Never force-push.
- Never amend a previous commit.
- Never skip hooks (`--no-verify`).
- Never rotate or delete the Pusher secret in the dashboard yourself — that is the user's action.
- Never push to `main`.
- Never open a pull request unless the user explicitly asks.

## 9. If something unexpected happens

If during any fix you hit a surprise — an unfamiliar file, an unexpected import, a test that fails in a way the doc didn't predict — **stop editing** and use the Agent tool (`subagent_type: Explore`) to investigate before continuing. It is always better to pause and re-read than to ship something you don't understand.

---

**Once all nine steps pass, you are cleared to open the specific fix document and begin.**
