import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heroicResourceTimingAllows, normalizeHeroicResourceAutomation } from '../heroic-resource-automation.js';
import { createAbilityAutomationHarness } from '../../../../../character_sheet/ability-automation/__tests__/support/automation-harness.mjs';

// Zepha (Elementalist) and the start of his turn, November 10, 2026. Brandon: "Zepha was taking his turn, and it kept
// popping up with like start your turn ... it just kept asking him if he wanted to start his turn like 3 or 4 times
// during his one turn. While he was actively taking it." And: "Check that they [his persistent abilities] do work the
// way they're intended."

const board = (await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
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
  assert.match(section('  async function runPendingHeroResourcePrompt(', '  function claimPendingHeroResourcePromptRecord('), /routed: true,/);
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
    /endZonesOfDroppedMaintenance\(placement\.id, dropped\)/);
});

test('classes with rolled gains or no turn-start gain get one upkeep decision', async () => {
  const attach = new Function(section('  function attachTurnMaintenance(', '  async function processHeroicResourceAutomationEvent(') + '; return attachTurnMaintenance;')();
  const [fallback] = attach([]);
  const gains = [1,2].map(n => ({id:'gain' + n, effect:{kind:'gain', amount:n}}));
  const [rolled, extra] = attach(gains);
  assert.equal(rolled.maintenanceOffer, true);
  assert.equal(extra.maintenanceOffer, false);

  for (const [rule, hasDice] of [[fallback,false], [rolled,true]]) {
    const placement = {id:'caster', maintainedAbilities:[{id:'test',value:1}]};
    const timing = {active:true, encounterId:'practice', round:1, turnId:'caster'};
    const offers = [], applied = [];
    const deps = {
      heroicResourceTimingAllows, heroicResourceCombatTiming: () => timing,
      characterSummaryCache: new Map(), getAutomationSheetForPlacement: async () => ({hero:{resource:{value:1}}}),
      noteResourceLevel() {}, getSheetHeroicResourceContext: () => ({}), resourceOpeningEncounterId: null,
      previewHeroicResourceAmount: () => ({amount:0, hasDice, label:'1d3'}),
      resolveHeroicResourceAmount: () => ({amount:hasDice ? 3 : 0}),
      normalizeHeroicResourceChange: (_rule,_sheet,amount) => ({current:1, next:1+amount, resourceName:'Test resource'}),
      getPlacementFromStore: () => placement, getMaintainedAbilities: token => token.maintainedAbilities,
      formatHeroicResourcePrompt: () => '', heroicResourceEventSentence: () => '', markHeroicResourceRuleLimit() {},
      queueMaintainPrompt: async ({gain, maintained}) => { offers.push(gain); return {applied:true,kept:maintained,again:[]}; },
      queueHeroicResourcePrompt: async () => ({applied:true}),
      getActiveSceneId: () => 'practice', combatRound:1, activeCombatantId:'caster',combatActive:true, combatEncounterId:'practice',
      setMaintainedAbilities() {},endZonesOfDroppedMaintenance() {}, updateStatus() {}, tokenLabel: () => 'Caster',
      inCausingUndoGroup: (_group,_label,take) => take(), takeHeroicResourceRule: data => applied.push(data.amount),
    };
    const offer = new Function('deps', `with(deps) { ${section('  function reconcileMaintenanceChoice(', '  function setMaintainedAbilities(')}
      ${section('  async function offerHeroicResourceRuleNow(', '  // The gain (or loss, or damage) taken:')}
      return offerHeroicResourceRuleNow; }`)(deps);
    await offer({eventType:'turnStart',rule,placement,timing,sheet:{hero:{}},resource:{value:1}});
    assert.deepEqual(offers, [hasDice ? 3 : 0]);
    assert.deepEqual(applied, hasDice ? [2] : []);
  }
});

// Brandon, November 23, 2026: "triggered actions have to happen after because we cant click to activate them instantly.
// So there has to be account for pause." The Director had moved on to the next creature before the player pressed
// Apply, and the answer was dropped without a word: no gain, no upkeep, the casts neither kept nor let go.
test('a slow answer to the start-of-turn choice still counts after the Director has moved on', async () => {
  const gain = { id: 'gain', effect: { kind: 'gain', amount: 2 }, maintenanceOffer: true, limit: { scope: 'round', key: 'gain', markOn: 'offered' } };
  const cast = { id: 'test', value: 1 };
  async function answer(during, extra = {}) {
    const placement = { id: 'caster', maintainedAbilities: [cast] };
    const timing = { active: true, encounterId: 'practice', round: 1, turnId: 'caster' };
    const applied = [], kept = [], said = [];
    const deps = {
      heroicResourceTimingAllows, heroicResourceCombatTiming: () => ({ active: deps.combatActive, encounterId: deps.combatEncounterId, round: deps.combatRound, turnId: deps.activeCombatantId }),
      characterSummaryCache: new Map(), getAutomationSheetForPlacement: async () => ({ hero: { resource: { value: 1 } } }),
      noteResourceLevel() {}, getSheetHeroicResourceContext: () => ({}), resourceOpeningEncounterId: null,
      previewHeroicResourceAmount: () => ({ amount: 2, hasDice: false }), resolveHeroicResourceAmount: () => ({ amount: 2 }),
      normalizeHeroicResourceChange: (_rule, _sheet, amount) => ({ current: 1, next: 1 + amount, resourceName: 'Essence' }),
      getPlacementFromStore: () => placement, getMaintainedAbilities: (token) => token.maintainedAbilities,
      formatHeroicResourcePrompt: () => '', heroicResourceEventSentence: () => '', markHeroicResourceRuleLimit() {},
      queueMaintainPrompt: async ({ maintained }) => { during(deps); return { applied: true, kept: maintained, again: [] }; },
      queueHeroicResourcePrompt: async () => ({ applied: true }),
      getActiveSceneId: () => 'practice', combatRound: 1, activeCombatantId: 'caster', combatActive: true, combatEncounterId: 'practice',
      setMaintainedAbilities: (_id, list) => kept.push(list), endZonesOfDroppedMaintenance() {}, updateStatus: (text) => said.push(text), tokenLabel: () => 'Caster',
      inCausingUndoGroup: (_group, _label, take) => take(), takeHeroicResourceRule: (data) => applied.push(data.amount),
    };
    const offer = new Function('deps', `with(deps) { ${section('  function reconcileMaintenanceChoice(', '  function setMaintainedAbilities(')}
      ${section('  async function offerHeroicResourceRuleNow(', '  // The gain (or loss, or damage) taken:')}
      return offerHeroicResourceRuleNow; }`)(deps);
    await offer({ eventType: 'turnStart', rule: gain, placement, timing, sheet: { hero: {} }, resource: { value: 1 }, ...extra });
    return { applied, kept, said };
  }
  const late = await answer((deps) => { deps.activeCombatantId = 'goblin'; });
  assert.deepEqual(late.applied, [1], 'the next creature\'s turn has begun: the gain less the upkeep is still given');
  assert.deepEqual(late.kept, [[cast]], 'and the casts chosen are kept');
  const over = await answer((deps) => { deps.combatActive = false; });
  assert.deepEqual(over.applied, []);
  assert.match(over.said.join(' '), /fight is over/, 'after the fight it is said, not hidden');
  const elsewhere = await answer(() => {}, { stillOffered: () => false });
  assert.deepEqual([elsewhere.applied, elsewhere.kept], [[], []], 'answered on another page first (a reload, a second window): this answer does nothing');
});

test('a question open at the start of a turn stays on the token until it is answered, so a reloaded page shows it again', () => {
  const pending = section('  function processPendingHeroResourcePrompts(', '  // Every page looks again now and then.');
  // A page that has just loaded reads its tokens before the saved ones arrive: every page, not only the Director's, looks again.
  assert.match(board, /window\.setInterval\(\(\) => \{\s*try \{\s*processPendingHeroResourcePrompts\(boardApi\.getState\?\.\(\) \?\? \{\}\);\s*if \(isGmUser\(\)\) \{/);
  assert.doesNotMatch(pending, /removePendingHeroResourcePromptRecord/, 'showing it no longer takes it off the token');
  assert.match(pending, /if \(claimedBy && claimedBy !== currentUserId\) continue;/, 'another user\'s open question is left alone');
  assert.match(pending, /const unclaimed = !mine && !claimedBy && isGmUser\(\)/, 'the Director is asked only when nobody has it open');
  assert.match(section('  async function runPendingHeroResourcePrompt(', '  function claimPendingHeroResourcePromptRecord('),
    /stillOffered: \(\) => heroResourcePromptRecordStands\(placementId, record\.id\),\s*\}\);\s*\} finally \{\s*removePendingHeroResourcePromptRecord\(placementId, record\.id\);/, 'it goes when the question is answered or dismissed');
  // The page that starts the turn asks at once and keeps the same record, already its own.
  const local = section('  async function processHeroicResourceAutomationEvent(', '  let pendingHeroResourcePromptCounter = 0;');
  assert.match(local, /const kept = isController && eventType === 'turnStart' && \(!rule\.autoApply \|\| rule\.maintenanceOffer\)\s*\? keepHeroResourcePromptRecord\(/);
  assert.match(local, /\} finally \{\s*if \(kept\) removePendingHeroResourcePromptRecord\(placement\.id, kept\.id\);/);
});

test('a turn-start decision preserves new casts and charges only chosen casts still on the board', () => {
  const reconcile = new Function(section('  function reconcileMaintenanceChoice(', '  function setMaintainedAbilities(') + '; return reconcileMaintenanceChoice;')();
  const [keep, drop, expired, added] = ['keep','drop','expired','new'].map(id => ({ id, value: 2 }));
  const result = reconcile([keep, drop, added], [keep, drop, expired], [keep, expired]);
  assert.deepEqual(result, { remaining: [keep, added], dropped: [drop], upkeep: 2 });
});

// ---------------------------------------------------------------- markings (Brandon, November 11, 2026)
// "perhaps it is added as a condition or marking or something on the token he is using the ability on. and he can
// trigger it for creatures he has the persistent condition on? then stopping it is just clicking the x"

function markingBoard({ gm = false, me = 'zepha-player' } = {}) {
  const placements = [
    { id: 'zepha', name: 'Zepha', maintainedAbilities: [
      { id: 'action_flesh', abilityId: 'action_flesh', name: FLESH.name, value: 1, targetIds: ['gob'] },
      { id: 'action_flower', abilityId: 'action_flower', name: FLOWER.name, value: 1, targetIds: [] },
    ] },
    { id: 'gob', name: 'Goblin' },
    { id: 'cal', name: 'Cal' },
  ];
  const calls = { ended: [], chat: [], status: [] };
  const deps = {
    boardApi: { getState: () => ({}) },
    getActiveScenePlacements: () => placements,
    getActiveSceneId: () => 'test-scene',
    getPlacementFromStore: (id) => placements.find((p) => p.id === id) || null,
    updatePlacementById: (id, fn) => { fn(placements.find((p) => p.id === id)); return true; },
    tokenLabel: (p) => p?.name || '',
    isGmUser: () => gm,
    getCurrentUserId: () => me,
    normalizeProfileId: (v) => (typeof v === 'string' && v ? v.toLowerCase() : null),
    getLinkedProfileUserIdForPlacement: (id) => (id === 'zepha' ? 'zepha-player' : null),
    getAutomationProfileIdForPlacement: (id) => (id === 'zepha' ? 'zepha' : ''),
    endZonesOfDroppedMaintenance: (ownerId, dropped) => calls.ended.push([ownerId, dropped.map((item) => item.name)]),
    sayInChat: (message) => calls.chat.push(message),
    updateStatus: (message) => calls.status.push(message),
    renderTokens: () => {}, tokenLayer: null, viewState: {},
    queueHeroicResourcePrompt: async () => ({ applied: true }),
    combatActive: true, combatRound: 2,
    Array, Number, String, Boolean, console,
  };
  const api = new Function('deps', `with (deps) { ${section('  function getMaintainedAbilities(placement) {', '  function sayInChat(')}
    ${section('  async function offerMaintainPersistentAbility(used = {}) {', "  // The start of the hero's turn: each maintained")}
    return { getMaintainedMarkingsFor, stopMaintainingAbility, offerMaintainPersistentAbility, getMaintainedAbilities }; }`)(deps);
  return { api, placements, calls };
}

test('a maintained ability shows on the creature it is on; one with no creature (an area) shows on the hero', () => {
  const { api, placements } = markingBoard();
  const on = (id) => api.getMaintainedMarkingsFor(placements.find((p) => p.id === id)).map((m) => [m.text, m.endable]);
  assert.deepEqual(on('gob'), [[`${FLESH.name} (Zepha)`, true]]);
  assert.deepEqual(on('zepha'), [[`${FLOWER.name} (Zepha)`, true]], 'O Flower Aid: an area, so on Zepha');
  assert.deepEqual(on('cal'), []);
  placements.splice(1, 1);                         // the goblin is gone from the map: the marking falls back to Zepha
  assert.deepEqual(on('zepha').map(([text]) => text), [`${FLESH.name} (Zepha)`, `${FLOWER.name} (Zepha)`]);
});

test('cumulative damage asks once per cast at its threshold and only ends confirmed casts', async () => {
  const hero = { id: 'hero', name: 'Practice hero', maintainedAbilities: [
    {id:'ward', castId:'ward', name:'Ward', value:1, damageThreshold:10},
    {id:'web', castId:'web', name:'Web', value:1, damageThreshold:15},
    {id:'third', castId:'third', name:'Other effect', value:1},
  ] };
  const ended = [], prompts = [];
  const deps = {
    combatActive:true, combatRound:1, activeCombatantId:'foe',
    getPlacementFromStore: () => hero, updatePlacementById: (id, edit) => edit(hero),
    getAutomationProfileIdForPlacement: () => 'hero', getLinkedProfileUserIdForPlacement: () => 'player',
    getCurrentUserId: () => 'player', normalizeProfileId: id => id,
    queueHeroicResourcePrompt: async prompt => { prompts.push(prompt.message); return {applied: prompts.length === 2}; },
    endZonesOfDroppedMaintenance: (id, list) => ended.push(...list.map(item=>item.id)),
    tokenLabel: placement => placement.name, sayInChat: () => {},
  };
  const hit = new Function('deps', `with (deps) { ${section('  function getMaintainedAbilities(placement) {', '  function sayInChat(')}
    ${section('  async function noteMaintainedDamage(', '  function clearMaintainedAbilitiesAtCombatEnd(')}
    return noteMaintainedDamage; }`)(deps);
  for (const amount of [6,4,2,3]) await hit({targetId:hero.id, amount});
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /Ward \(10\)/);
  assert.match(prompts[1], /Web \(15\)/);
  assert.deepEqual(ended, ['web']);
  assert.deepEqual(hero.maintainedAbilities.map(item=>item.id), ['ward','third']);
});

test('two structured casts of the same spell keep individual targets and zone IDs through a retry and reload', async () => {
  const {api,placements}=markingBoard({gm:true,me:'gm'});
  const actor=placements[0];
  actor.maintainedAbilities=[];
  const metadata={actorId:actor.id,actionId:'practice-spell',actionName:'The Flesh, a Crucible',persistent:1,maintenance:{mode:'targets',action:'free'}};
  for(const [castId,targetId] of [['cast-a','gob'],['cast-b','cal'],['cast-a','gob']]) {
    await api.offerMaintainPersistentAbility({...metadata,castId,targetIds:[targetId]});
  }
  actor.maintainedAbilities=JSON.parse(JSON.stringify(actor.maintainedAbilities));
  const before=api.getMaintainedAbilities(actor);
  assert.deepEqual(before.map(item=>[item.id,item.targetIds]),[['cast-a',['gob']],['cast-b',['cal']]]);
  const matches=new Function(section('  function zoneBelongsToMaintained(', '  // Abilities let go')+'; return zoneBelongsToMaintained;')();
  assert.equal(matches({abilityId:'practice-spell',castId:'cast-a'},before[1]),false);
  assert.equal(matches({abilityId:'practice-spell',castId:'cast-a'},before[0]),true);
  assert.equal(api.stopMaintainingAbility(actor.id,'cast-a'),true);
  assert.deepEqual(api.getMaintainedAbilities(actor).map(item=>item.id),['cast-b']);
});

test("the × is for Zepha's player and the Director only; it stops the maintenance, its area and its markings", () => {
  const other = markingBoard({ me: 'cal-player' });
  assert.equal(other.api.getMaintainedMarkingsFor(other.placements[1])[0].endable, false, 'another player sees it, no ×');
  assert.equal(other.api.stopMaintainingAbility('zepha', 'action_flesh'), false);
  assert.equal(other.api.getMaintainedAbilities(other.placements[0]).length, 2);

  const director = markingBoard({ gm: true, me: 'gm' });
  assert.equal(director.api.getMaintainedMarkingsFor(director.placements[1])[0].endable, true, 'never blocked for the Director');

  const { api, placements, calls } = markingBoard();
  assert.equal(api.stopMaintainingAbility('zepha', 'action_flower'), true);
  assert.deepEqual(api.getMaintainedAbilities(placements[0]).map((item) => item.name), [FLESH.name], 'its upkeep stops with it');
  assert.deepEqual(calls.ended, [['zepha', [FLOWER.name]]], 'its area ends the usual way (the Director asked)');
  assert.deepEqual(calls.chat, [`Zepha stops maintaining ${FLOWER.name}.`]);
  assert.deepEqual(api.getMaintainedMarkingsFor(placements[0]), [], 'its marking is gone');
  placements[0].maintainedAbilities = null;        // any other ending (untick, damage break, end of fight)
  assert.deepEqual(api.getMaintainedMarkingsFor(placements[1]), [], 'markings go with it');
});

test('maintaining keeps who it was used on; using it again moves the marking to whoever it went to', async () => {
  const { api, placements } = markingBoard();
  placements[0].maintainedAbilities = null;
  await api.offerMaintainPersistentAbility({ actorId: 'zepha', actionId: 'action_flesh', actionName: FLESH.name, persistent: 1, targetIds: ['gob'] });
  assert.deepEqual(api.getMaintainedAbilities(placements[0])[0].targetIds, ['gob']);
  await api.offerMaintainPersistentAbility({ actorId: 'zepha', actionId: 'action_flesh', actionName: FLESH.name, persistent: 1, maintainRerun: true, targetIds: ['cal'] });
  const list = api.getMaintainedAbilities(placements[0]);
  assert.equal(list.length, 1, 'not maintained twice');
  assert.deepEqual(list[0].targetIds, ['cal']);
});

test('used again, it goes to the creatures carrying the marking; out of range is warned, never refused', async () => {
  const harness = await createAbilityAutomationHarness({ targets: [{ id: 'gob', name: 'Goblin' }] });
  try {
    const automation = { schema: 'ability-automation/v3', cards: [
      { type: 'target', name: 'target', mode: 'token', predicate: 'creatureOrObject', count: { value: 1, mode: 'exact' }, distance: { form: 'ranged', value: 10 } },
      { type: 'effect', target: 'target', effects: [{ kind: 'note', text: 'x' }] },
    ] };
    const result = await harness.runAutomation({ automation, action: { ...FLESH, _maintainRerun: true }, contextOverrides: { presetTargetIds: ['gob'] } });
    assert.deepEqual(result.calls.selectTarget.map((call) => call.autoPickTargetIds), [['gob']], 'the picker is handed the marked creature');
    const used = result.calls.fireTriggerEvent.find((call) => call.eventType === 'actionUsed').payload;
    assert.deepEqual(used.targetIds, ['gob'], 'who it went to rides on the use');
  } finally { harness.close(); }
  const request = section('  function handleAutomationTargetRequest(event) {', '  function clearAutomationTargetPrompt() {');
  assert.match(request, /autoPickTargetIds[^]*?acceptAutomationTargetPlacement\(/, 'picked through the ordinary pick');
  assert.match(section('  function acceptAutomationTargetPlacement(placement) {', '  function handleAutomationAreaRequest('), /Targeted anyway\./, 'which warns past range and goes on');
  const rerun = section('  async function runMaintainedAgain(', '  // Damage to a hero who maintains something');
  assert.match(rerun, /getMaintainedAbilities\(fresh\)\.filter/);
  assert.match(rerun, /markedIds\.filter\(targetId => getPlacementFromStore\(targetId\)\)/);
});

test('the marking is drawn with the conditions, in its own look, with an × only where it may be stopped', async () => {
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.className = ''; this.textContent = ''; this.title = ''; this.style = {}; this.classList = { toggle() {}, add() {}, remove() {} }; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    querySelector(sel) { const cls = sel.slice(1); const walk = (n) => { for (const c of n.children) { if (String(c.className).split(' ').includes(cls)) return c; const f = walk(c); if (f) return f; } return null; }; return walk(this); }
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new El(tag) };
  try {
    const { paintTokenConditionLabel } = await import('../token-status-presentation.js');
    const token = new El('div');
    const marking = { key: 'zepha|action_flesh', text: `${FLESH.name} (Zepha)`, endable: true };
    paintTokenConditionLabel(token, [{ name: 'Dazed' }], { interactive: true, markings: [marking] });
    const label = token.querySelector('.vtt-token__condition');
    assert.equal(label.children.length, 2, 'Dazed and the marking');
    const line = label.children[1];
    assert.match(line.className, /vtt-token__condition-line--maintained/);
    assert.equal(line.children[1].getAttribute('data-token-maintained-end'), 'zepha|action_flesh');
    paintTokenConditionLabel(token, [], { interactive: true, markings: [{ ...marking, endable: false }] });
    const alone = token.querySelector('.vtt-token__condition');
    assert.equal(alone.children.length, 1, 'shown with no condition on the creature');
    assert.equal(alone.children[0].children.length, 1, 'no × for someone who may not stop it');
    paintTokenConditionLabel(token, [], { interactive: true, markings: [] });
    assert.equal(token.querySelector('.vtt-token__condition'), null, 'gone when the maintenance is');
  } finally { globalThis.document = previous; }
  assert.match(board, /\[data-token-hidden-effect\], \[data-token-maintained-end\]'\)\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/, 'pressing the × does not grab the token');
  assert.match(board, /markings: getMaintainedMarkingsFor\(wholePlacement\)/);
});
