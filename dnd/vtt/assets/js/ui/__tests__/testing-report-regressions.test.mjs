import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePlacementEntry } from '../../state/normalize/placements.js';
import { resolveAutomationForcedMovementDistance } from '../automation-resistance.js';

const board = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../../../../../character_sheet/ability-automation/runner.js', import.meta.url), 'utf8');
function section(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last);
}

test('area enemy, ally and self filters use the caster team for both sides', () => {
  const placements = [{ id: 'hero', team: 'ally', column: 0, row: 0 }, { id: 'monster', team: 'enemy', column: 0, row: 0 }];
  const find = new Function('getPlacementsForActiveScene', 'normalizeCombatTeam', `${section(board, '  function findAutomationAreaTargets(', '  function updateAutomationAreaHover(')}; return findAutomationAreaTargets;`)(() => placements, value => value);
  for (const sourcePlacement of placements) {
    const run = creature => find({ column: 0, row: 0 }, 1, 1, { creature, sourcePlacement }).map(p => p.id);
    assert.deepEqual(run('enemy'), placements.filter(p => p.team !== sourcePlacement.team).map(p => p.id));
    assert.deepEqual(run('ally'), [sourcePlacement.id]);
    assert.deepEqual(run('self'), [sourcePlacement.id]);
  }
});

test('distinct authored trigger cards survive registration and re-registration does not stack', () => {
  const registry = { byToken: new Map(), byEvent: new Map() };
  const register = new Function('triggerRegistry', `${section(board, '  function triggerRegister(', '  function triggerUnregisterEntry(')}; return triggerRegister;`)(registry);
  const entry = (index, eventType) => ({ tokenId: 'cal', abilityId: 'life', registrationKey: `authored:${index}`, eventType, predicate: () => true });
  register(entry(0, 'startTurn')); register(entry(1, 'damage'));
  register(entry(0, 'startTurn'));
  assert.equal(registry.byToken.get('cal').length, 2);
  assert.equal(registry.byEvent.get('damage').length, 1);
  assert.equal(registry.byEvent.get('startTurn').length, 1);
  register({ ...entry(0, 'damage'), registrationKey: undefined });
  register({ ...entry(0, 'damage'), registrationKey: undefined });
  assert.equal(registry.byToken.get('cal').length, 3, 'runtime recasts replace only their own registration');
});

test('winded reads live canonical HP, PC vitals, and legacy numeric HP', () => {
  const winded = new Function(`${section(runner, '  function isActorWinded(', '  // If the block carries')} return isActorWinded;`)();
  assert.equal(winded({ hero: { vitals: { currentStamina: '5', staminaMax: '72' } } }), true);
  assert.equal(winded({ sourceToken: { hp: { current: '36', max: '72' } } }), true);
  assert.equal(winded({ sourceToken: { hp: { current: '37', max: '72' } } }), false);
  assert.equal(winded({ hero: { hp: 5, maxHp: 10 } }), true);
  assert.equal(winded({ sourceToken: { id: 'cal', hp: { current: '5', max: '72' } }, context: { getPlacementById: () => ({ hp: { current: '60', max: '72' } }) } }), false);
  assert.equal(winded({ hero: { vitals: { currentStamina: 'unknown', staminaMax: '72' } } }), false);
});

test('projected automation data survives hydration and matches GM potency and defenses', () => {
  const automationTraits = { attributes: { agility: 1 }, stability: 2, size: '2', immunities: [{ type: 'fire', value: 5 }], weaknesses: [{ type: 'cold', value: 3 }] };
  const player = normalizePlacementEntry({ id: 'enemy', automationTraits, monsterTriggerHooks: [{ name: 'Retort', blocks: [] }] });
  assert.deepEqual(player.automationTraits, automationTraits);
  assert.equal(player.monster, undefined);
  const stats = new Function('getAutomationNumber', `${section(board, '  function getMonsterAutomationStats(', '  function getMonsterAutomationFreeStrike(')} return getMonsterAutomationStats;`)((value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback);
  assert.equal(stats(player.automationTraits).agility, 1);
  const defense = new Function('normalizeAutomationDamageType', `${section(board, '  function parseMonsterDefenseDamageAdjustment(', '  function parseDamageAdjustmentEntry(')} return parseMonsterDefenseDamageAdjustment;`)(value => String(value || '').toLowerCase());
  assert.equal(defense(player.automationTraits, 'immunity', 'fire'), 5);
  assert.equal(defense(player.automationTraits, 'immunity', 'cold'), 0);
  assert.equal(defense(player.automationTraits, 'weakness', 'cold'), 3);
});

test('accepted automation damage emits the zero-stamina transition; rejected saves emit nothing', async () => {
  const events = [];
  let failed = false, resolved, rejected;
  const placement = { id: 'enemy', hp: { current: '3', max: '20' } };
  const deps = {
    parseDamageHealAmount: Number, getPlacementFromStore: () => placement,
    parseHitPointNumber: Number, ensurePlacementHitPoints: hp => hp,
    registerAuthoredTriggersForPlacement: async () => {}, getAutomationDamageAdjustment: async () => ({ immunity: 0, vulnerability: 0 }),
    resolveAutomationDamageAmount: ({amount}) => ({amount, immunity: 0}),
    applyDamageHealToPlacement: () => ({current: -2, max: 20, name: 'Enemy'}),
    awaitSuccessfulPlacementSave: async () => { if (failed) throw Error('conflict'); },
    isAutomationPlacementHidden: () => true, shouldHideEnemyHitPointValues: () => true,
    normalizeAutomationDamageType: value => value, updateStatus() {}, triggerFire: (name, payload) => events.push({name, payload}),
    shouldRevealPlacementHitPointValues: () => false,
    renderTokens() {}, boardApi: {}, tokenLayer: null, viewState: {}, refreshTokenSettings() {},
  };
  const handler = new Function('deps', `with(deps) { ${section(board, '  async function handleAutomationDamageRequest(', '  async function handleAutomationSurgeGainRequest(')} return handleAutomationDamageRequest; }`)(deps);
  const detail = {payload:{placementId:'enemy',amount:5},resolve:value=>resolved=value,reject:error=>rejected=error};
  await handler({detail});
  assert.equal(events.find(event => event.name === 'staminaZero').payload.before, 3);
  assert.equal(events.find(event => event.name === 'staminaChange').payload.delta, -5);
  assert.equal(resolved.hideHitPointValues, true);
  events.length = 0; failed = true; resolved = null;
  await handler({detail});
  assert.equal(rejected.message, 'conflict'); assert.equal(resolved, null); assert.deepEqual(events, []);
});

test('forced movement applies Stability and only the larger melee-weapon bonus', async () => {
  let selection;
  const deps = {
    getPlacementFromStore: () => ({id:'target'}), resolveAutomationSourcePlacement: value => value,
    getAutomationMoveVerb: () => 'push', getAutomationMoveVerbLabel: () => 'Push',
    getAutomationTraitsForPlacement: async () => ({size:2,stability:1}),
    getAutomationSizeRank: Number, resolveAutomationForcedMovementDistance,
    closeDamageHealWidget() {}, closeHealOverflowPopup() {}, startAutomationMoveSelection: value => selection=value,
  };
  const handler = new Function('deps', `with(deps) { ${section(board, '  async function handleAutomationForceMoveRequest(', '  function resolveAutomationSourcePlacement(')} return handleAutomationForceMoveRequest; }`)(deps);
  for (const [size, keywords, expected] of [[1,['Melee','Weapon'],1],[3,['Melee','Weapon'],2],[3,['Ranged','Weapon'],1],[3,['Melee','Magic'],1]]) {
    await handler({detail:{payload:{targetId:'target',sourcePlacement:{id:'source'},sourceTraits:{size},keywords,distance:2}}});
    assert.equal(selection.effectiveDistance,expected);
  }
});

test('healing reports and emits stamina changes only after accepted persistence', async () => {
  const events = []; let release, resolved, rejected;
  const deps = {
    parseDamageHealAmount:Number, getPlacementFromStore:()=>({id:'hero',hp:{current:'5',max:'20'}}),
    parseHitPointNumber:Number, ensurePlacementHitPoints:hp=>hp,
    applyDamageHealToPlacement:(_id,_mode,_amount,options)=>{
      assert.equal(options.fireStaminaTriggers,false);
      return {current:10,max:20,change:5,name:'Hero'};
    },
    awaitSuccessfulPlacementSave:()=>new Promise((resolve,reject)=>{release={resolve,reject};}),
    isAutomationPlacementHidden:()=>true,shouldHideEnemyHitPointValues:()=>false,
    updateStatus:()=>events.push('status'), triggerFire:(name)=>events.push(name),shouldRevealPlacementHitPointValues:()=>true,
    renderTokens(){},boardApi:{},tokenLayer:null,viewState:{},refreshTokenSettings(){},
  };
  const handler = new Function('deps', `with(deps) { ${section(board, '  async function handleAutomationHealRequest(', '  async function handleAutomationConditionRequest(')} return handleAutomationHealRequest; }`)(deps);
  const detail={payload:{placementId:'hero',amount:5},resolve:value=>resolved=value,reject:error=>rejected=error};
  let pending=handler({detail}); assert.deepEqual(events,[]); assert.equal(resolved,undefined);
  release.resolve(); await pending; assert.deepEqual(events,['status','staminaChange']); assert.equal(resolved.current,10);
  events.length=0; resolved=null; pending=handler({detail}); release.reject(Error('conflict')); await pending;
  assert.equal(rejected.message,'conflict'); assert.equal(resolved,null); assert.deepEqual(events,[]);
});
