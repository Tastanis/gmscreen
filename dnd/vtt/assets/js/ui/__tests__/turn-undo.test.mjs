import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describeUndoStep, undoChatLines, inUndoGroup, currentUndoTag } from '../../services/undo-client.js';
import { createAbilityAutomationHarness } from '../../../../../character_sheet/ability-automation/__tests__/support/automation-harness.mjs';

// Turn undo (Brandon, October 2026): Ctrl+Z takes back the running turn's newest action (anyone), Ctrl+Shift+Z the
// whole turn; each undo says so in chat named for who did it; "Start <name>'s turn?" once a round when acting in the
// picking phase.

const board = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = board.indexOf(start);
  const last = board.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return board.slice(first, last);
}
const names = { gob: 'Goblin 1', cal: 'Cal', zepha: 'Zepha' };
const nameOf = (id) => names[id] || '';

test('the words for an undone step', () => {
  assert.equal(describeUndoStep({ kind: 'placement', entityId: 'gob', before: { hp: { current: '10' } }, after: { hp: { current: '0' } } }, { nameOf }), '10 damage to Goblin 1');
  assert.equal(describeUndoStep({ kind: 'placement', entityId: 'cal', before: { hp: { current: '5' } }, after: { hp: { current: '12' } } }, { nameOf }), '7 healing on Cal');
  assert.equal(describeUndoStep({ kind: 'placement', entityId: 'zepha', before: { column: 1 }, after: { column: 4 } }, { nameOf, actorName: 'Zepha' }), 'move', 'a creature\'s own move reads just "move"');
  assert.equal(describeUndoStep({ kind: 'placement', entityId: 'gob', before: { column: 1 }, after: { column: 4 } }, { nameOf, actorName: 'Zepha' }), 'move of Goblin 1');
  assert.equal(describeUndoStep({ kind: 'placement', entityId: 'gob', before: { conditions: [] }, after: { conditions: [{ name: 'Prone' }] } }, { nameOf }), 'Prone on Goblin 1');
  assert.equal(describeUndoStep({ kind: 'malice', before: { malice: 5 }, after: { malice: 2 } }), '3 Malice spent');
  assert.equal(describeUndoStep({ kind: 'sheet', entityId: 'zepha', after: { counter: 'resource', delta: -2, name: 'Zepha' } }), '2 heroic resource spent by Zepha');
  assert.equal(describeUndoStep({ kind: 'placement', entityId: 'gob', hidden: true }), 'a change to a hidden creature');
});

test('chat lines: one per action named for who did it; one line for a whole turn', () => {
  const steps = [
    { kind: 'placement', entityId: 'gob', actorId: 'zepha', groupId: 'g1', label: 'Burst', before: { hp: { current: '10' } }, after: { hp: { current: '4' } } },
    { kind: 'placement', entityId: 'cal', actorId: 'zepha', groupId: 'g1', label: 'Burst', before: { conditions: [] }, after: { conditions: ['Dazed'] } },
  ];
  const actorNameOf = (id) => id.charAt(0).toUpperCase() + id.slice(1);
  assert.deepEqual(undoChatLines(steps, { nameOf, actorNameOf }), ['↶ Undid Burst: 6 damage to Goblin 1, Dazed on Cal — Zepha']);
  const move = { kind: 'placement', entityId: 'zepha', actorId: 'zepha', groupId: 'g2', before: { column: 1 }, after: { column: 3 } };
  assert.deepEqual(undoChatLines([move, ...steps], { nameOf, actorNameOf, whole: true, whose: 'Zepha' }), ['↶ Undid Zepha\'s turn: move (Zepha); Burst: 6 damage to Goblin 1, Dazed on Cal (Zepha)']);
});

test('one action is one group; commands carry it; an inner action belongs to the outer one', async () => {
  assert.deepEqual(currentUndoTag(), {});
  let inner = null;
  await inUndoGroup('Strike', async () => {
    const tag = currentUndoTag();
    assert.equal(tag.undoLabel, 'Strike');
    await inUndoGroup('Other', async () => { inner = currentUndoTag(); });
    assert.equal(inner.undoGroup, tag.undoGroup);
  });
  assert.deepEqual(currentUndoTag(), {}, 'cleared after');
  const runtime = await readFile(new URL('../../sync-v2/token-movement-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /submit\('placement\.batch', \{ actions, \.\.\.currentUndoTag\(\) \}\)/);
  assert.match(runtime, /\.\.\.\(move\.undoRevision === undefined \? currentUndoTag\(\) : \{\}\)/);
});

test('an ability use is one group and asks the page first (start-turn hook)', async () => {
  const runner = await readFile(new URL('../../../../../character_sheet/ability-automation/runner.js', import.meta.url), 'utf8');
  const open = runner.slice(runner.indexOf('  async function open(options) {'), runner.indexOf('  async function openRun(options) {'));
  assert.ok(open.indexOf('vttBeforeAbilityRun') < open.indexOf('globalThis.vttUndoGroup = { id'), 'asked before the action starts');
  assert.match(open, /if \(globalThis\.vttUndoGroup\?\.id\) return openRun\(options\);/, 'inside another action: part of it');
  assert.match(open, /label: options\?\.action\?\.name/);
  assert.match(open, /finally \{\s*if \(globalThis\.vttUndoGroup\?\.id === id\) globalThis\.vttUndoGroup = null;/);
  assert.doesNotMatch(open, /Math\.random\(/, 'never uses up a die');
  // The harness still runs abilities as before.
  const harness = await createAbilityAutomationHarness({ targets: [{ id: 'gob', name: 'Goblin' }] });
  try {
    const result = await harness.runAutomation({ automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'note', text: 'x' }] }] }, action: { id: 'a1', name: 'Burst' } });
    assert.ok(result.calls.postChat.length >= 1);
  } finally { harness.close(); }
});

test('keys: Ctrl+Z / Ctrl+Shift+Z during a turn go to the turn undo; without a turn Ctrl+Z stays the move undo', () => {
  const keys = section("  window.addEventListener('keydown', (event) => {\n    if (!(event.ctrlKey || event.metaKey) || event.altKey", '  // ---------- "Start <name>\'s turn?"');
  assert.match(keys, /if \(!turnIsRunning\(\)\) \{/);
  assert.match(keys, /event\.stopImmediatePropagation\(\);\s*performTurnUndo\(event\.shiftKey\);/);
  assert.match(keys, /target\.closest\('input, textarea, select/);
  assert.match(section('  async function performTurnUndo(whole) {', "  window.addEventListener('keydown'"), /confirmBoardAction\(`Undo all of /);
});

test('"Start <name>\'s turn?": combat on, nobody\'s turn, own creature, once a round', async () => {
  const asked = [];
  let started = null;
  const state = { combatActive: true, activeCombatantId: null, combatRound: 2, gm: false };
  const make = () => new Function('deps', `with (deps) { ${section('  const askedStartTurn = new Set();', '  if (typeof window !== \'undefined\') {\n    // The ability runner asks')}; return maybeAskStartTurn; }`)({
    get combatActive() { return state.combatActive; }, get activeCombatantId() { return state.activeCombatantId; }, get combatRound() { return state.combatRound; },
    getPlacementFromStore: (id) => ({ id, name: names[id] }), getRepresentativeIdFor: (id) => id,
    getCombatantTeam: (id) => (id === 'gob' ? 'enemy' : 'ally'), completedCombatants: new Set(['done']),
    isGmUser: () => state.gm, canCurrentUserMovePlacement: (p) => p.id === 'zepha', getCombatantLabel: (id) => names[id], tokenLabel: (p) => p.name,
    confirmBoardAction: async (message) => { asked.push(message); return true; },
    handleAutomationStartTurn: async (p) => { started = ['gm', p.placementId]; }, handlePlayerInitiatedTurn: async (id) => { started = ['player', id]; },
    lastCombatTrackerEntries: [{ id: 'zepha' }, { id: 'gob' }, { id: 'cal' }, { id: 'done' }],
    console, Set,
  });
  const ask = make();
  state.gm = true; await ask('stranger'); state.gm = false;   // even the Director, who may start anyone's turn
  assert.equal(asked.length, 0, 'a token that is not in this fight is not asked (the Map maker, October 25, 2026)');
  await ask('zepha');
  assert.deepEqual([asked, started], [["Start Zepha's turn?"], ['player', 'zepha']]);
  await ask('zepha');
  assert.equal(asked.length, 1, 'once a round');
  await ask('gob');
  assert.equal(asked.length, 1, 'a player is not asked about a monster');
  state.gm = true;
  await ask('gob');
  assert.deepEqual(started, ['gm', 'gob'], 'the Director is, for monsters');
  state.activeCombatantId = 'cal';
  await ask('cal');
  assert.equal(asked.length, 2, 'not while a turn runs');
  assert.match(board, /if \(!inTurn && \(source === 'drag' \|\| source === 'keyboard'\)\) \{[^]*?const id = moves\?\.\[0\]\?\.placementId[^]*?await maybeAskStartTurn\(id\);/);
  // Moved by someone else while the question was open: the drop is not sent from where the token stands now (it
  // would be another walk; the Map maker's Medpilis run got "blocked by a wall" from it, October 25, 2026).
  assert.match(board, /await maybeAskStartTurn\(id\);\s*if \(before !== null && at\(\) !== before\) \{[^]*?return false;/);
});

test('the floating damage number carries on through a redraw instead of playing twice', () => {
  assert.match(board, /span\.dataset\.floatStart = String\(performance\.now\(\)\);/);
  assert.match(board, /layer\.appendChild\(fragment\);\s*resumeFloatNumbers\(layer\);/);
  assert.match(section('  function resumeFloatNumbers(layer) {', '  function showStaminaFloatNow('), /span\.style\.animationDelay = `-\$\{Math\.round\(elapsed\)\}ms`/);
});

test('turn bookkeeping (a ready trigger it set off) is undone but named only when nothing else was', () => {
  const actorNameOf = (id) => id.charAt(0).toUpperCase() + id.slice(1);
  const move = { kind: 'placement', entityId: 'zepha', actorId: 'zepha', groupId: 'g', before: { column: 1 }, after: { column: 2 } };
  const ready = { kind: 'placement', entityId: 'cal', actorId: 'zepha', groupId: 'g', before: { hasReadyTrigger: false }, after: { hasReadyTrigger: true } };
  assert.deepEqual(undoChatLines([ready, move], { nameOf, actorNameOf }), ['↶ Undid move — Zepha']);
  assert.deepEqual(undoChatLines([ready], { nameOf, actorNameOf }), ["↶ Undid Cal's ready trigger — Zepha"]);
});
