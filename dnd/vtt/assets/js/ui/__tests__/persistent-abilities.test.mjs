import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeHeroicResourceAutomation } from '../heroic-resource-automation.js';
import { createAbilityAutomationHarness } from '../../../../../character_sheet/ability-automation/__tests__/support/automation-harness.mjs';

// Zepha (Elementalist) and the start of his turn, November 10, 2026. Brandon: "Zepha was taking his turn, and it kept
// popping up with like start your turn ... it just kept asking him if he wanted to start his turn like 3 or 4 times
// during his one turn. While he was actively taking it." And: "Check that they [his persistent abilities] do work the
// way they're intended."

const board = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = board.indexOf(start);
  const last = board.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return board.slice(first, last);
}

// Zepha's Essence rules as on his sheet (heroic-resource/v1).
const ZEPHA_ESSENCE = {
  schema: 'heroic-resource/v1',
  rules: [
    { id: 'elementalist-combat-start-victories', event: 'combatStart', effect: { kind: 'set', amount: { from: 'victories' } }, autoApply: true },
    { id: 'elementalist-turn-start-essence', event: 'turnStart', filter: { whose: 'self' }, effect: { kind: 'gain', amount: 2 }, prompt: 'Gain {amount} {resource}: start of your turn.' },
    { id: 'elementalist-font-of-essence-damage', event: 'damage', filter: { withinSquares: 10 }, limit: { scope: 'round', key: 'elementalist-font-of-essence-damage' }, effect: { kind: 'gain', amount: 2 } },
    { id: 'elementalist-combat-end-reset', event: 'combatEnd', effect: { kind: 'set', amount: 0 }, autoApply: true },
  ],
};

test('Escape on the page no longer cancels the running turn; Cancel Turn stays on its button', () => {
  const prompt = section('  function openTurnPrompt(combatantId) {', '  function closeTurnPrompt() {');
  assert.match(prompt, /cancelButton\?\.addEventListener\('click', handleCancel\);/, 'the button still cancels');
  assert.doesNotMatch(prompt, /key === 'Escape'[^]*?handleCancel\(\)/, 'no Escape shortcut to cancel');
  // The page-wide listener it registers does nothing with Escape (the ruler, the dice, a panel each use it).
  const line = prompt.match(/const handleKeydown = [^;]*;/)[0];
  let canceled = 0;
  const handleKeydown = new Function('handleCancel', `${line}; return handleKeydown;`)(() => { canceled += 1; });
  const event = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  handleKeydown(event);
  assert.equal(canceled, 0);
  assert.equal(event.defaultPrevented, false, 'the Escape is left for whatever it was meant for');
});

test('a start (or end) of turn rule is once a round by default; "limit": false opts out; other events unchanged', () => {
  const { rules, warnings } = normalizeHeroicResourceAutomation(ZEPHA_ESSENCE);
  assert.deepEqual(warnings, []);
  const turnStart = rules.find((rule) => rule.event === 'turnStart');
  assert.deepEqual(turnStart.limit, { scope: 'round', key: 'elementalist-turn-start-essence', target: 'self', markOn: 'offered' });
  assert.equal(rules.find((rule) => rule.event === 'combatStart').limit, null);
  assert.equal(rules.find((rule) => rule.event === 'damage').limit.markOn, 'applied', 'an authored limit is kept as written');
  const end = normalizeHeroicResourceAutomation({ rules: [{ id: 'e', event: 'turnEnd', effect: { kind: 'gain', amount: 1 } }] }).rules[0];
  assert.equal(end.limit.scope, 'round');
  const every = normalizeHeroicResourceAutomation({ rules: [{ id: 'x', event: 'turnStart', limit: false, effect: { kind: 'gain', amount: 1 } }] }).rules[0];
  assert.equal(every.limit, null);
  const own = normalizeHeroicResourceAutomation({ rules: [{ id: 'y', event: 'turnStart', limit: { scope: 'turn', key: 'k', markOn: 'applied' }, effect: { kind: 'gain', amount: 1 } }] }).rules[0];
  assert.deepEqual(own.limit, { scope: 'turn', key: 'k', target: 'self', markOn: 'applied' });
});

test('the start-of-turn question (Essence / keep persistent abilities) is asked once a turn, however often the turn starts', async () => {
  // The real limit marks and offer gate from board-interactions.js; the popup itself is a stand-in.
  const placements = { zepha: { id: 'zepha', name: 'Zepha' } };
  const state = { combatRound: 2, activeCombatantId: 'zepha', combatEncounterId: 'enc-1' };
  const asked = [];
  const deps = {
    get combatRound() { return state.combatRound; },
    get activeCombatantId() { return state.activeCombatantId; },
    get combatEncounterId() { return state.combatEncounterId; },
    pendingResourceLimitKeys: new Set(),
    getPlacementFromStore: (id) => placements[id] || null,
    updatePlacementById: (id, fn) => { fn(placements[id]); return true; },
    Object, String, Boolean, Set, console,
  };
  const api = new Function('deps', `with (deps) { ${section('  function heroicResourceLimitKey(', '  // The fight starts or ends: every rule may be used again.')}
    ${section('  async function offerHeroicResourceRule({', '  async function offerHeroicResourceRuleNow({')}
    return { offerHeroicResourceRule, markHeroicResourceRuleLimit, hasHeroicResourceRuleLimit }; }`)(deps);
  // As offerHeroicResourceRuleNow does: an "offered" limit is used as the popup shows (checked below in its source).
  deps.offerHeroicResourceRuleNow = async ({ rule, placement, eventTargetId }) => {
    if (rule.limit?.markOn === 'offered') api.markHeroicResourceRuleLimit(rule, placement.id, eventTargetId);
    asked.push(`round ${state.combatRound}`);
    return { applied: true };
  };
  const rule = normalizeHeroicResourceAutomation(ZEPHA_ESSENCE).rules.find((item) => item.event === 'turnStart');
  const offer = (extra = {}) => api.offerHeroicResourceRule({ eventType: 'turnStart', payload: { placementId: 'zepha' }, placement: placements.zepha, profileId: 'zepha', rule, eventTargetId: 'zepha', ...extra });

  await offer();                                  // his turn starts: asked
  assert.deepEqual(asked, ['round 2']);
  state.activeCombatantId = null;                 // the turn is cancelled ...
  state.activeCombatantId = 'zepha';              // ... and started again, the same round
  await offer();
  await offer();
  assert.deepEqual(asked, ['round 2'], 'not asked again in the same round');
  assert.equal(api.hasHeroicResourceRuleLimit(rule, 'zepha', 'zepha'), true, 'the page that runs a turn start sends no second popup either');

  // Started by the Director: the Director's page marks it as it sends the popup to Zepha's player (routing), and
  // the player's page still shows that one popup.
  state.combatRound = 3;
  api.markHeroicResourceRuleLimit(rule, 'zepha', 'zepha');      // routeHeroicResourcePromptToOwner, markOn offered
  await offer({ routed: true });
  assert.deepEqual(asked, ['round 2', 'round 3'], 'the popup sent here is shown');
  await offer();
  assert.deepEqual(asked, ['round 2', 'round 3'], 'a restart in round 3 does not ask again');

  // The source keeps the parts the stand-in leans on.
  const now = section('  async function offerHeroicResourceRuleNow({', '  // The gain (or loss, or damage) taken:');
  assert.ok(now.indexOf("if (rule.limit?.markOn === 'offered') {") < now.indexOf('queueMaintainPrompt('), 'marked before the start-of-turn question shows');
  assert.match(section('  function routeHeroicResourcePromptToOwner(', '  // Prompt-record ids this client'), /if \(rule\.limit\?\.markOn === 'offered'\) \{\s*markHeroicResourceRuleLimit\(rule, placement\.id, eventTargetId\);/);
  assert.match(section('  async function runPendingHeroResourcePrompt(', '  function removePendingHeroResourcePromptRecord('), /routed: true,/);
});

test('"Start Zepha\'s turn?" itself is still once a round', () => {
  const ask = section('  async function maybeAskStartTurn(placementId) {', '  if (typeof window !== \'undefined\') {\n    // The ability runner asks');
  assert.match(ask, /if \(!placementId \|\| !combatActive \|\| activeCombatantId\) return;/, 'never while a turn runs');
  assert.match(ask, /if \(askedStartTurn\.has\(key\)\) return;\s*askedStartTurn\.add\(key\);/);
});

// ---------------------------------------------------------------- Zepha's persistent abilities
const FLESH = {
  id: 'action_flesh', name: 'The Flesh, a Crucible', actionLabel: 'Main Action', cost: '3 Essence',
  description: 'Fire engulfs your target and continues to churn.<div><br></div><div>Power Roll + Reason: ≤11: 5 + R fire damage; 12–16: 8 + R fire damage; 17+: 11 + R fire damage.</div><div><br></div><div>Persistent 1: If the target is within distance at the start of your turn, you can make the power roll again without spending Essence (no action required).</div>',
};
const CONFLAGRATION = {
  id: 'action_conflagration', name: 'Conflagration', actionLabel: 'Main Action', cost: '5 Essence',
  description: 'A storm of fire descends upon your enemies.<div><br></div><div>Persistent 2: At the start of your turn, you can use a maneuver to use this ability again without spending Essence.</div>',
};
const FLOWER = {
  id: 'action_flower', name: 'O Flower Aid, O Earth Defend', actionLabel: 'Maneuver', cost: '5 Essence',
  description: '<div>Effect: Until the start of your next turn, the area gains all the following effects:</div><div>• The area is difficult terrain for enemies.</div><div>Persistent 1: The area remains until the start of your next turn. As a maneuver, you can move the area up to 5 squares. This ability ends if the area is ever not within your line of effect.</div>',
};
const UNQUIET = {
  id: 'action_unquiet', name: 'Unquiet Ground', actionLabel: 'Main Action', cost: 'Free!',
  description: 'A sudden storm of detritus assaults your foes.<div>Effect: The ground beneath the area is difficult terrain for enemies.</div>',
};
const NOTE = { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'note', text: 'x' }] }] };

async function actionUsed(action, contextExtra = {}) {
  const harness = await createAbilityAutomationHarness({ targets: [{ id: 'gob', name: 'Goblin' }] });
  try {
    const result = await harness.runAutomation({ automation: NOTE, action, ...contextExtra });
    const used = result.calls.fireTriggerEvent.filter((call) => call.eventType === 'actionUsed');
    assert.equal(used.length, 1, `${action.name}: one actionUsed`);
    return used[0].payload;
  } finally { harness.close(); }
}

test('each persistent ability reports its Persistent value from its own words (the maintain question rides on it)', async () => {
  assert.equal((await actionUsed(FLESH)).persistent, 1);
  assert.equal((await actionUsed(CONFLAGRATION)).persistent, 2);
  assert.equal((await actionUsed(FLOWER)).persistent, 1);
  assert.equal((await actionUsed(UNQUIET)).persistent, 0, 'Unquiet Ground is an area, not a persistent ability: no maintain question');
  const first = await actionUsed(FLESH);
  assert.equal(first.actionKind, 'main');
  assert.equal(first.maintainRerun, false);
});

test('used again at the start of the turn, it takes what its Persistent words say, not its own action', async () => {
  const flesh = await actionUsed({ ...FLESH, _maintainRerun: true });
  assert.equal(flesh.maintainRerun, true, 'not asked to maintain again');
  assert.equal(flesh.actionKind, 'free', 'The Flesh, a Crucible: no action required (it was marking his main action used)');
  const fire = await actionUsed({ ...CONFLAGRATION, _maintainRerun: true });
  assert.equal(fire.actionKind, 'maneuver', 'Conflagration: a maneuver (it was marking his main action used)');
  assert.equal((await actionUsed({ ...UNQUIET, _maintainRerun: true })).actionKind, 'main', 'words that name no action leave its own');
});

test('a maintained area stays past the start of the turn; one let go at the question ends then (the Director asked first)', () => {
  const placements = {
    zepha: { id: 'zepha', name: 'Zepha', maintainedAbilities: [{ id: 'action_flower', abilityId: 'action_flower', name: FLOWER.name, value: 1 }] },
  };
  let zones = [
    { id: 'z-flower', casterId: 'zepha', abilityId: 'action_flower', abilityName: FLOWER.name, expiresAt: 'startOfTurn' },
    { id: 'z-other', casterId: 'zepha', abilityId: 'action_hole', abilityName: 'Something else', expiresAt: 'startOfTurn' },
    { id: 'z-ground', casterId: 'zepha', abilityId: 'action_unquiet', abilityName: 'Unquiet Ground', expiresAt: 'never' },
  ];
  const ended = [];
  const deps = {
    getActivePersistentZones: () => zones,
    getPlacementFromStore: (id) => placements[id] || null,
    tokenLabel: (placement) => placement?.name || '',
    endPersistentZonesByTime: async (list, reason) => { ended.push([list.map((zone) => zone.id), reason]); return true; },
    Array, Number, String, Boolean, console,
  };
  const api = new Function('deps', `with (deps) { ${section('  function getMaintainedAbilities(placement) {', '  function setMaintainedAbilities(')}
    ${section('  function expirePersistentZonesForOwner(ownerId, when) {', "  // ---------- a zone's time is up")}
    return { expirePersistentZonesForOwner, endZonesOfDroppedMaintenance }; }`)(deps);

  api.expirePersistentZonesForOwner('zepha', 'startOfTurn');
  assert.deepEqual(ended, [[['z-other'], "start of Zepha's turn"]], 'O Flower Aid is maintained: its area stays for the question');

  ended.length = 0;
  placements.zepha.maintainedAbilities = null;      // he unticked Keep at the start-of-turn question
  api.endZonesOfDroppedMaintenance('zepha', [{ id: 'action_flower', abilityId: 'action_flower', name: FLOWER.name, value: 1 }]);
  assert.deepEqual(ended, [[['z-flower'], `Zepha stopped maintaining ${FLOWER.name}`]]);

  ended.length = 0;
  api.expirePersistentZonesForOwner('zepha', 'startOfTurn');
  assert.deepEqual(ended[0][0], ['z-flower', 'z-other'], 'not maintained: the area ends at the start of his turn as written');
  // The question's answer ends what was let go.
  assert.match(section('  async function offerHeroicResourceRuleNow({', '  // The gain (or loss, or damage) taken:'),
    /setMaintainedAbilities\(placement\.id, choice\.kept\);\s*endZonesOfDroppedMaintenance\(placement\.id, maintained\.filter\(\(item\) => !choice\.kept\.some/);
});
