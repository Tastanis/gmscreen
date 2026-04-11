# VTT Sync Refactor — Handoff Documentation

**You are a fresh Claude Code instance. You have no prior context. Read this entire file before doing anything else.**

---

## What this is

This folder contains a multi-phase plan to fix real-time sync lag and correctness bugs in the D&D Virtual Tabletop (VTT) at `/home/user/gmscreen/dnd/vtt`. Each "fix" is a self-contained markdown document you can execute without needing any of the other fixes already done, **as long as you follow the dependency order listed below**.

The diagnosis that produced this plan was done by three separate investigation agents. Their findings are recorded in `diagnosis-findings.md`. You should treat that file as the authoritative description of "what's wrong" — do not re-diagnose from scratch. Use it as your ground truth and verify only the specific claims relevant to the fix you're doing.

## The problem in plain language

Players in this VTT complain that when someone moves a token on one computer, it takes too long to show up on other computers, and sometimes tokens "snap back" to their old positions. The system already uses Pusher Channels (a hosted realtime service) to broadcast updates, *plus* a 1-second HTTP polling fallback, *plus* a separate 5-second combat state refresh loop. These three systems are fighting each other. On top of that, there's a server-side race condition where two simultaneous writes can get the same version number, which breaks the client's version-based staleness guards.

The goal of this refactor is:
1. Make Pusher actually be the primary transport and let the poller become a real safety net.
2. Fix the version race so "newer" and "older" are always well-defined.
3. Stop sending the entire board state on every move.
4. Break the 19,969-line `board-interactions.js` into something humans can edit safely.

## How to use these docs

Each fix document is structured identically:

1. **Context** — a paragraph of what this fix does and why it matters.
2. **Prerequisites** — which branch to be on, which earlier fixes must already be in, which tests must be green before you start.
3. **Files you will need to load into memory** — read these first. This is the minimum context you need.
4. **Investigation to run before touching anything** — specific commands, greps, and in some cases a subagent task. Do all of it before editing.
5. **Gotchas already discovered** — things the diagnosis agents found that can trip you up. Read these carefully, they are not theoretical.
6. **The change** — described as "find X, replace with Y" in prose plus small code snippets. Line numbers drift, so the instructions describe *what* to find, not which line.
7. **Verification** — the exact commands to run and what to look for in the output and browser.
8. **Rollback** — how to undo if things go wrong.
9. **Commit message template** — a suggested commit message.

**You must not skip any section.** In particular, "Investigation" and "Gotchas" exist because the diagnosis turned up things that are not obvious from reading the code.

## Dependency order

You can only do a fix if its prerequisites are already merged to the branch. The safe order is:

| Fix | Depends on |
|---|---|
| `phase-0-security.md` | nothing |
| `phase-1-1-init-order.md` | nothing |
| `phase-1-2-dynamic-poller.md` | 1-1 |
| `phase-1-3-combat-loop.md` | 1-1, 1-2 |
| `phase-1-4-socket-id.md` | 1-1 |
| `phase-1-5-nonblocking-broadcast.md` | nothing (server-side only) |
| `phase-2-1-version-in-lock.md` | nothing (server-side only) |
| `phase-2-2-consolidate-version.md` | 2-1 |
| `phase-2-3-client-version-guard.md` | 2-1 |
| `phase-3-delta-sync.md` | all of phase 1 and phase 2 |
| `phase-4-methodology.md` | should be read before any phase-4 extraction |
| `phase-4-extraction-targets.md` | all of phase 1 (so you're not refactoring around a moving target) |
| `phase-5-store-cleanup.md` | phase 4 partially done |
| `phase-6-normalization-unification.md` | phase 5 |
| `phase-7-css-split.md` | nothing |

**The biggest "bang for buck" is Phase 1.** If you do nothing else, doing all five Phase 1 fixes will kill most of the user-visible lag. Phase 2 is cheap and fixes correctness. Phases 3–7 are performance and maintainability improvements.

## Branch workflow

- All work goes on branch **`claude/app-communication-architecture-y5g1l`**. This branch already exists.
- Never push to `main`.
- Commit after each fix, with the commit message template from the fix doc.
- Push with `git push -u origin claude/app-communication-architecture-y5g1l`.
- Do NOT open a pull request unless the user explicitly asks.
- Do NOT amend previous commits or force-push.

## Running tests

The JavaScript test suite lives under `dnd/vtt/assets/js/**/__tests__/` and uses Node's built-in test runner. To run it:

```bash
cd /home/user/gmscreen/dnd/vtt
npm test
```

If there is no `package.json` at that path yet, look for `package.json` at the repo root or inside `dnd/`, and check its `test` script. If no script exists, tests are run via:

```bash
cd /home/user/gmscreen
node --test dnd/vtt/assets/js/**/__tests__/*.test.mjs
```

**Before you start any fix, run the test suite and confirm it is green.** If it is already red before you start, stop and tell the user — do not try to fix pre-existing failures as part of your fix.

There are no PHP tests in this codebase today. Server-side fixes must be verified manually (see each fix's Verification section).

## Version system reminder

This codebase has an auto-incrementing version badge (see `/home/user/gmscreen/CLAUDE.md` for details). Every PHP page that includes `version.php` bumps the patch version on load. If you're editing PHP files, the version will tick automatically — that is expected, do not try to prevent it.

## Glossary

These terms come up repeatedly in the docs and the codebase:

- **Pusher** — [pusher.com](https://pusher.com), a hosted WebSocket service. The VTT uses Pusher Channels with cluster `us3` and app ID `2106273`. The public key is in `dnd/vtt/templates/layout.php`. The secret is in `dnd/vtt/config/pusher.php` (currently committed — see `phase-0-security.md`).
- **Pusher channel** — named `vtt-board`. All clients subscribe to it; the server publishes state updates to it.
- **Socket ID** — Pusher gives every connected client a unique short-lived ID. If the server is told "broadcast this but exclude socket X," the client with socket X will not receive that broadcast. Used for self-dedup.
- **Board state** — the canonical JSON blob stored at `dnd/vtt/data/board-state.json`. Contains placements (tokens on the map), templates (spell areas), drawings, pings, scene state, fog, combat, etc.
- **Placement** — one token instance on one scene. A token in the library becomes a placement when you drag it onto the map.
- **Scene** — one map. The VTT has many scenes; only one is active at a time.
- **Version / `_version`** — a monotonically increasing integer stamped on the board state. Clients use it to reject stale updates. See the version race docs in `diagnosis-findings.md`.
- **Snap-back** — the user-visible symptom where a token moves, then reverts to its old position, then updates again. Caused by stale polls overwriting fresh Pusher updates.
- **The poller / board state poller** — the `setInterval`-driven HTTP fallback in `board-interactions.js` that fetches `api/state.php` every 1 or 10 seconds.
- **The combat state refresh loop** — a separate `setInterval` in the same file that refreshes combat state every 5 seconds. Redundant with Pusher.
- **Stamina sync** — a feature that broadcasts token stamina changes across multiple open tabs in the same browser via `BroadcastChannel`. Split across `board-interactions.js` and `token-library.js`.
- **Overlay tool** — the GM-only fog-of-war and image-overlay editor. Lives inside `board-interactions.js` starting around line 16,000.
- **Template tool** — the spell area (cone / circle / square) placement tool. Lives inside `board-interactions.js` around line 17,200.
- **Indigo rotation** — a visual animation on some tokens where they rotate at intervals. `board-interactions.js` around line 1,700.
- **`persistBoardStateSnapshot`** — the client function that packages the entire current board state and POSTs it to the server on every change.
- **`withVttBoardStateLock`** — the PHP function that flock()s `board-state.json` for exclusive access. Defined in `dnd/vtt/bootstrap.php` around line 115.

## If you get stuck

If during a fix you find that reality diverges from what the doc claims — for example, a line range doesn't match, or a function has been renamed — **stop and re-investigate** before making changes. Use the Agent tool with `subagent_type: Explore` to map out the current state. Do not paper over the inconsistency. The doc might be out of date because an earlier fix moved things around, or because something else in the repo evolved. Re-read `diagnosis-findings.md` if you need context.

If your fix breaks tests you did not expect to break, that is a signal that you are touching hidden coupling. Stop, read the failing test, understand what it's asserting, and only proceed if you are confident your change is correct and the test needs to be updated. Never disable or skip tests to get green.

If you genuinely cannot complete the fix, leave the branch in a clean state (either fully reverted or at a known-good commit), and report back to the user with (a) what you tried, (b) what you found, (c) what blocked you.

---

Start with `phase-0-security.md` or `phase-1-1-init-order.md` depending on what the user asks for. If they don't specify, ask.
