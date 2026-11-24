import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

const reference = await readFile(new URL('../../../ai-reference/characters/zepha-automations.md', import.meta.url), 'utf8');
const recipes = JSON.parse(await readFile(new URL('../../../ai-reference/vtt-json/elementalist-shared-hooks.json', import.meta.url),'utf8'));
const caster = { id: 'caster', name: 'Test caster', team: 'ally', column: 1, row: 1 };
const a = { id: 'first', name: 'First enemy', team: 'enemy', column: 4, row: 1 };
const b = { id: 'second', name: 'Second enemy', team: 'enemy', column: 7, row: 1 };
const ally = { id: 'friend', name: 'Test ally', team: 'ally', column: 8, row: 1, entityKind: 'creature' };
const actors = [caster, a, b, ally];

function saved(name) {
  const section = reference.split('### ' + name + '\n')[1] || reference.split('### ' + name + '\r\n')[1];
  return JSON.parse(section.split('`'.repeat(3) + 'json')[1].split('`'.repeat(3))[0]);
}

async function run(t, cards, options = {}) {
  const harness = await createAbilityAutomationHarness({ targets: actors });
  t.after(() => harness.close());
  return harness.runAutomation({ automation: { schema: 'ability-automation/v3', cards }, sourcePlacement: caster,
    randomValues: [0.45, 0.45], targetSelections: [a, b], hero: {stats: {reason: 0}}, ...options });
}

test('all ten reference recipes pass strict schema validation without any sheet writes', async t => {
  const h = await createAbilityAutomationHarness();
  t.after(()=>h.close());
  assert.equal(Object.keys(recipes).length,10);
  for(const [name,recipe] of Object.entries(recipes)) {
    const {issues}=h.validateAutomation(recipe,{strict:true});
    assert.equal(issues.length,0,name);
  }
});

function rollEvents(result) {
  return result.calls.fireTriggerEvent.filter(e => e.eventType === 'powerRoll').map(e => e.payload);
}

for (const name of ['Bifurcated Incineration', 'Conflagration', 'Behold the Mystery']) {
  test(name + ' uses one roll and applies both accepted tiers', async t => {
    const card = name === 'Behold the Mystery' ? { fields: {name}, automation: structuredClone(recipes[name]) } : saved(name);
    const roll = card.automation.cards.find(c => c.type === 'powerRoll');
    roll.targetTiers = true;

    const result = await run(t, card.automation.cards, { action: { ...card.fields, name },
      areaSelections: [{ targets: [a,b] }], rollRowClick: { row: 1, kind: 'edge' } });
    const [event] = rollEvents(result);
    assert.equal(rollEvents(result).length, 1);
    assert.deepEqual(event.targetResults.map(r => [r.id,r.tier]), [['first','tier1'],['second','tier2']]);
    assert.deepEqual(result.calls.applyDamage.map(hit => hit.amount), ['tier1','tier2'].map(key => roll.tiers[key].effects[0].amount));
  });
}

test('board suggestions per target and one per-roll rider remain independent', async t => {
  const card = saved('Bifurcated Incineration');
  const roll = card.automation.cards[1];
  roll.targetTiers = true;
  roll.oncePerRoll = { tier1: [{ kind: 'surgeGain', amount: 1 }] };
  const result = await run(t, card.automation.cards, { contextOverrides: {
    getPowerRollSuggestions: ({targetIds}) => targetIds.length === 1 && targetIds[0] === b.id ? [{ id:'flank',kind:'edge',active:true }] : [],
  } });
  assert.deepEqual(rollEvents(result)[0].targetResults.map(r => r.tier), ['tier1','tier2']);
  assert.equal(result.calls.applySurgeGain.length,1);
});

test('Practical Magic reads the effective range and Grasp of Beyond reads Reason, including a missing-stat ruling', async t => {
  const number = { source:'attribute',name:'Reason' };
  const range = { source:'abilityRange',name:'Hurl Element' };
  const cards = [
    { type:'target',name:'friend',mode:'token',distance:{form:'ranged',value:range} },
    { type:'effect',target:'friend',effects:[{ kind:'teleport',distance:number,rangeOrigin:'self' }] },
  ];
  for (const missing of [false,true]) {
    let asked = 0;
    const result = await run(t,cards,{ targetSelections:[ally], hero:{stats:missing ? {} : {reason:3}},
      contextOverrides:{ getAbility: () => ({name:'Hurl Element',range:'Ranged 12'}), askActionNumber: () => { asked++; return '4'; } } });
    assert.equal(result.calls.selectTarget[0].distance.value,12);
    assert.match(result.calls.selectTarget[0].promptText,/12 from Hurl Element/);
    assert.equal(result.calls.applyTeleport[0].distance,missing ? 4 : 3);
    assert.equal(result.calls.applyTeleport[0].placementId,'friend');
    assert.equal(result.calls.applyTeleport[0].rangeOrigin.id,'caster');
    assert.equal(asked,missing ? 1 : 0);
  }
});

test('Practical Magic uses the Hurl Element range after matching a feature bonus', async t => {
  const hurl = {name:'Hurl Element', tags:['Ranged','Magic'], range:'Ranged 10', automation:{
    schema:'ability-automation/v3', cards:[{type:'target', name:'primary', distance:{form:'ranged',value:10}}],
  }};
  const out = await run(t, [], { automation:recipes['Practical Magic'], action:{name:'Practical Magic'},
    features:[{title:'Practice range bonus',automation:{modifiers:[{match:{keywordsAll:['Ranged']},apply:{rangeBonus:3}}]}}],
    choiceSelections:['damage'], damageTypeChoices:['cold'],targetSelections:[a],contextOverrides:{getAbility:()=>hurl},
  });
  assert.equal(out.calls.selectTarget[0].distance.value, 13);
  assert.equal(hurl.automation.cards[0].distance.value, 10);
});

test('Earth Rejects You accepts enemies and objects, excludes known allies, asks about unknown props', async t => {
  const prop = {id:'prop',name:'Scene prop'}, barrel = {id:'barrel',name:'Barrel',entityKind:'object'};
  const candidates = [a, ally, barrel, prop];
  const cards = recipes['Earth Rejects You'].cards;
  for (const include of [true,false]) {
    const result = await run(t,cards,{areaSelections:[{targets:candidates}],promptAnswers:[include],contextOverrides:{
      getPlacementById: id => [caster,...candidates].find(t=>t.id===id),
    }});
    assert.deepEqual(result.calls.applyDamage.map(hit=>hit.placementId),include ? ['first','barrel','prop'] : ['first','barrel']);
  }
});

test('The Flesh, a Crucible rerolls once for two maintained targets without rearming them', async t => {
  const card = saved('The Flesh, a Crucible');
  card.automation.maintenance = {cost:1,mode:'targets',action:'free'};
  card.automation.cards[1].targetTiers = true;
  const result = await run(t,[],{automation:card.automation,action:{...card.fields,_maintainRerun:true},
    contextOverrides:{presetTargetIds:[a.id,b.id],maintenanceCastId:'old-cast'}});
  assert.equal(result.calls.selectTarget.length,2);
  assert.equal(rollEvents(result).length,1);
  assert.deepEqual(result.calls.applyDamage.map(hit=>hit.placementId),[a.id,b.id]);
  const used = result.calls.fireTriggerEvent.find(e=>e.eventType==='actionUsed').payload;
  assert.equal(used.maintainRerun,true);
  assert.equal(used.castId,'old-cast');
});

test('extending Web of All That’s Come Before cannot replay its opening hit', async t => {
  const result = await run(t,[],{action:{name:'Web of All That’s Come Before',_maintainRerun:true},
    automation:{schema:'ability-automation/v3',maintenance:{cost:1,mode:'extend'},cards:[
      {type:'effect',target:'self',effects:[{kind:'damage',amount:10}]},
    ]}});
  assert.equal(result.calls.applyDamage.length,0);
});

test('Ward of Nature’s Affection uses current Reason as trigger distance and lets the player override it', async t => {
  const cards = recipes["Ward of Nature's Affection"].cards;
  for (const [distance, answer, moves] of [[2,true,1],[6,false,0],[6,true,1]]) {
    const result=await run(t,cards,{hero:{stats:{reason:3}},action:{name:'Ward of Nature’s Affection',actionLabel:'Free Triggered Action'},
      attributes:{Reason:3},actionType:'triggers',triggerPayload:{eventType:'damage',payload:{placementId:caster.id,sourceId:a.id,amount:6}},
      contextOverrides:{getDistanceBetween:()=>distance},promptAnswers:[answer]});
    assert.equal(result.calls.forceMove.length,moves);
    if (moves) assert.equal(result.calls.forceMove[0].distance, 3);
  }
});

test('Translated Through Flame chooses an ally, measures from the caster, and resolves enemies by the actual landing', async t => {
  const cards = recipes['Translated Through Flame'].cards;
  const landed={...ally,column:2,row:2}; let moved=false;
  const result=await run(t,cards,{targetSelections:[ally,{done:true}],contextOverrides:{
    applyTeleport:async p=>{assert.equal(p.rangeOrigin.id,caster.id);assert.equal(p.previewTargets.predicate,'enemy');moved=true;return {applied:true};},
    getActiveScenePlacements:()=>[caster,landed,a,b],getPlacementById:id=>[caster,moved?landed:ally,a,b].find(t=>t.id===id),
    getDistanceBetween:(from,to)=>moved&&from===ally.id&&to===a.id?1:7,
  }});
  assert.equal(moved,true);
  assert.deepEqual(result.calls.applyDamage.map(d=>d.placementId),[a.id]);

  const skipped = await run(t, cards, { targetSelections: [ally], contextOverrides: {
    applyTeleport: () => ({ skipped: true }),
    getActiveScenePlacements: () => actors, getDistanceBetween: () => 1,
  } });
  // No teleport, so nobody is next to a landing: nothing is damaged, but the roll window still opens and chat says why.
  assert.equal(skipped.calls.applyDamage.length, 0);
  assert.equal(rollEvents(skipped).length, 1);
  assert.equal(rollEvents(skipped)[0].targetResults, undefined);
  assert.ok(skipped.calls.postChat.some(line => /no teleport was made/.test(line.message)));
  assert.ok(skipped.calls.postChat.some(line => /no targets were picked/.test(line.message)));
});

test('Practical Magic can use each printed option, including a confirmed unfunded teleport', async t => {
  const recipe = recipes['Practical Magic'];
  for (const option of ['knockback','damage','teleport']) {
    const out = await run(t,[],{automation:recipe,action:{name:'Practical Magic'},choiceSelections:[option],damageTypeChoices:option === 'damage' ? ['sonic'] : [],
      targetSelections:[a],hero:{stats:{reason:2,might:2}},sourcePlacement:{...caster,size:'1M'},contextOverrides:{
        getAbility:()=>({name:'Hurl Element',range:'Ranged 12'}), getPlacementById:id=>({...actors.find(x=>x.id===id),size:'2'}),
        spendHeroicResource:()=>({spent:0,overrideAmount:3,resource:'Essence'}),
      }});
    if(option==='knockback') assert.equal(out.calls.forceMove[0].distance,1);
    if(option==='damage') assert.equal(out.calls.applyDamage.length,1);
    if(option==='teleport') assert.equal(out.calls.applyTeleport[0].distance,5);
  }
});

test('the Web attack and the maintained area have the same cast identity', async t => {
  const name="Web of All That's Come Before";
  let zone;
  const out=await run(t,[],{automation:recipes[name],action:{id:'practice-web',name},areaSelections:[{targets:[a,b],template:{column:1,row:1,width:4,height:4}}],
    contextOverrides:{registerPersistentZone:record=>{zone=JSON.parse(JSON.stringify(record));return {zoneId:"test-zone"};}}});
  const resolved=out.calls.fireTriggerEvent.filter(e=>e.eventType==='maintenanceCastResolved');
  assert.equal(resolved.length,1);
  assert.ok(zone);
  assert.equal(zone.castId,resolved[0].payload.castId);
  assert.deepEqual(zone.triggers,['onOccupantTurnEnd']);
  assert.equal(zone.terrainCost,2);
  assert.equal(out.calls.applyDamage.length,2);
});

test('an instance can run selected cards with restored targets after reconnect', async t => {
  const cards=[{type:'target',id:'opening-pick',name:'original'},{type:'effect',id:'opening-hit',target:'original',effects:[{kind:'damage',amount:20}]},
    {type:'effect',id:'upkeep-hit',target:'original',effects:[{kind:'damage',amount:1}]}];
  const result=await run(t,[],{automation:{schema:'ability-automation/v3',maintenance:{mode:'steps',cost:1,steps:['upkeep-hit']},cards},
    action:{id:'demo',name:'Test maintained effect',_maintainRerun:true},
    contextOverrides:{maintenanceCastId:'saved-cast',maintenanceBindings:{groups:{original:[b.id]}},getPlacementById:id=>actors.find(p=>p.id===id)}});
  assert.equal(result.calls.selectTarget.length,0);
  assert.deepEqual(result.calls.applyDamage.map(d=>[d.placementId,d.amount]),[[b.id,1]]);
});

test('separate rolls are explicit for Instantaneous Excavation', async t => {
  const card=saved('Bifurcated Incineration');
  const roll = card.automation.cards[1];
  Object.assign(roll, {rollMode:'individual', allowCritical:false});
  for (const tier of Object.values(roll.tiers)) tier.effects[0].target = roll.target;
  const result=await run(t,card.automation.cards,{randomValues:[0,0,0.95,0.95]});
  assert.deepEqual(rollEvents(result).map(e=>e.targetIds),[[a.id],[b.id]]);
  assert.deepEqual(result.calls.applyDamage.map(hit=>[hit.placementId, hit.amount]),[[a.id,2],[b.id,6]]);
});

test('a spent action warns before any damage and honors the player’s answer', async t => {
  const cards = [{ type: 'effect', target: 'self', effects: [{ kind: 'damage', amount: 1 }] }];
  for (const actionType of ['mains', 'maneuvers', 'triggers']) {
    for (const answer of [false, true]) {
      const triggered = actionType === 'triggers';
      const result = await run(t, cards, {
        actionType,
        action: { name: 'Practice action', actionLabel: triggered ? 'Triggered Action' : actionType },
        promptAnswers: [answer],
        contextOverrides: {
          manualTriggerResolution: triggered,
          getPlacementById: () => ({ ...caster, mainActionUsedThisTurn: true, maneuverUsedThisTurn: true }),
          consumeTriggeredAction: () => ({ blocked: true, reason: 'already-used' }),
        },
      });
      assert.equal(result.calls.applyDamage.length, Number(answer), actionType);
    }
  }
  // Off its own turn there is no question (Brandon, November 23, 2026): the ability goes through.
  for (const actionType of ['mains', 'maneuvers']) {
    const offTurn = await run(t, cards, {
      actionType, action: { name: 'Practice action', actionLabel: actionType }, promptAnswers: [false],
      contextOverrides: { isTurnOf: () => false, getPlacementById: () => ({ ...caster, mainActionUsedThisTurn: true, maneuverUsedThisTurn: true }) },
    });
    assert.equal(offTurn.calls.applyDamage.length, 1, actionType + ' off turn: not asked, so the "no" waiting is never used');
  }
  const missing = await run(t, cards, {
    actionType: 'triggers', action: { name: 'Practice reaction', actionLabel: 'Triggered Action' },
    contextOverrides: { manualTriggerResolution: true, consumeTriggeredAction: () => ({ blocked: true, reason: 'not-found' }) },
  });
  assert.equal(missing.calls.applyDamage.length, 0);
});

test('Grasp of Beyond teleports the caster after damaging its selected target', async t => {
  const result = await run(t, [], {
    automation: recipes['Grasp of Beyond'], attributes: {Reason: 2}, hero: {stats: {reason: 2}},
    targetSelections: [a], powerRollTiers: ['tier1'],
  });
  assert.deepEqual(result.calls.applyDamage.map(hit => [hit.placementId, hit.amount]), [[a.id, 5]]);
  assert.deepEqual(result.calls.applyTeleport.map(move => [move.placementId, move.distance]), [[caster.id, 2]]);
});

// November 23, 2026 review fixes: a row's effects stay on that row's target, a spend is one question per roll, and a
// per-target roll with nobody picked still opens its window.
const third = { id: 'third', name: 'Third enemy', team: 'enemy', column: 8, row: 2 };
function perTargetCards(effects, roll = {}) {
  const tiers = Object.fromEntries(['tier1', 'tier2', 'tier3'].map(key => [key, { effects: typeof effects === 'function' ? effects(key) : effects }]));
  return [
    { type: 'target', name: 'targets', mode: 'token', predicate: 'creature', count: { value: 3, mode: 'exact' }, distance: { form: 'ranged', value: 10 } },
    { type: 'powerRoll', attribute: 'Reason', target: 'targets', targetTiers: true, tiers, ...roll },
  ];
}
const hit = [{ kind: 'damage', amount: 3 }];

for (const [label, wrapped, roll] of [
  ['ifKeyword', [{ kind: 'ifKeyword', any: ['Magic'], then: hit, else: hit }]],
  ['ifStrained', [{ kind: 'ifStrained', then: hit, else: hit }]],
  ['ifPrompt', [{ kind: 'ifPrompt', question: 'Burn {target}?', then: hit }]],
  ['ifScopedFlag', [{ kind: 'ifScopedFlag', scope: 'round', key: 'probe', mode: 'unset', then: hit, else: hit }]],
  ['ifRoll on a roll card with no target of its own', [{ kind: 'ifRoll', tier: ['tier1', 'tier2', 'tier3'], then: hit, else: hit }], { target: undefined }],
]) {
  test('a per-target row applies an effect inside ' + label + ' to its own target only, once', async t => {
    const result = await run(t, perTargetCards(wrapped, roll), { targetSelections: [a, b, third], action: { name: 'Probe', keywords: 'Magic' }, strictValidation: false });
    assert.deepEqual(result.calls.applyDamage.map(d => d.placementId), [a.id, b.id, third.id]);
    assert.equal(rollEvents(result).length, 1);
    assert.equal(rollEvents(result)[0].targetResults.length, 3);
  });
}

test('a spend inside per-target tiers is asked and charged once for the roll, and each row keeps to its own target', async t => {
  const spend = [{ kind: 'spend', resource: 'Essence', amount: 1, effects: hit }];
  for (const [answer, damaged] of [[{ spent: 1, resource: 'Essence' }, [a.id, b.id, third.id]], [{ canceled: true }, []]]) {
    const result = await run(t, perTargetCards(spend), { targetSelections: [a, b, third], spendHeroicResourceResults: [answer] });
    assert.equal(result.calls.spendHeroicResource.length, 1);
    assert.deepEqual(result.calls.applyDamage.map(d => d.placementId), damaged);
  }
  // The same question written into each tier with that tier's own effect is still one question for the roll: the
  // second target's row is moved up a tier (one edge), and both rows honour the single answer with their own amount.
  const perTier = key => [{ kind: 'spend', resource: 'Essence', amount: 1, effects: [{ kind: 'damage', amount: { tier1: 1, tier2: 2, tier3: 3 }[key] }] }];
  const mixed = await run(t, perTargetCards(perTier).map(card => card.type === 'target' ? { ...card, count: { value: 2, mode: 'exact' } } : card),
    { rollRowClick: { row: 1, kind: 'edge' } });
  assert.equal(mixed.calls.spendHeroicResource.length, 1);
  assert.deepEqual(mixed.calls.applyDamage.map(d => [d.placementId, d.amount]), [[a.id, 1], [b.id, 2]]);
  // Two spends asking the same thing in one tier are two questions (and then no more for the later rows).
  const twice = [...spend, { kind: 'spend', resource: 'Essence', amount: 1, effects: [{ kind: 'damage', amount: 5 }] }];
  const two = await run(t, perTargetCards(twice), { targetSelections: [a, b, third] });
  assert.equal(two.calls.spendHeroicResource.length, 2);
  assert.deepEqual(two.calls.applyDamage.map(d => [d.placementId, d.amount]), [[a.id, 3], [a.id, 5], [b.id, 3], [b.id, 5], [third.id, 3], [third.id, 5]]);
});

test('a roll without per-target results still asks a spend once, as it always did', async t => {
  const cards = perTargetCards([{ kind: 'spend', resource: 'Essence', amount: 1, effects: hit }], { targetTiers: undefined });
  const result = await run(t, cards, { targetSelections: [a, b, third] });
  assert.equal(result.calls.spendHeroicResource.length, 1);
  assert.deepEqual(result.calls.applyDamage.map(d => d.placementId), [a.id, b.id, third.id]);
});

test('named groups are whole again after a per-target roll', async t => {
  const cards = [...perTargetCards([{ kind: 'ifKeyword', any: ['Magic'], then: hit, else: hit }]),
    { type: 'effect', target: 'targets', effects: [{ kind: 'damage', amount: 1 }] }];
  const result = await run(t, cards, { targetSelections: [a, b, third], action: { name: 'Probe', keywords: 'Magic' } });
  assert.deepEqual(result.calls.applyDamage.map(d => [d.placementId, d.amount]),
    [[a.id, 3], [b.id, 3], [third.id, 3], [a.id, 1], [b.id, 1], [third.id, 1]]);
});

test('a per-target roll with nobody picked still opens the roll window and says so in chat', async t => {
  const said = result => result.calls.postChat.map(line => line.message);
  // Done with none.
  const none = await run(t, perTargetCards(hit), { targetSelections: [{ done: true }] });
  assert.equal(rollEvents(none).length, 1);
  assert.equal(none.calls.applyDamage.length, 0);
  assert.ok(said(none).some(line => /no targets were picked/.test(line)));
  assert.ok(said(none).some(line => /rolled/.test(line)));
  // A count read from an attribute that is 0.
  const cards = perTargetCards(hit);
  cards[0].count = { value: { source: 'attribute', name: 'Reason' }, mode: 'exact' };
  const zero = await run(t, cards, { hero: { stats: { reason: 0 } } });
  assert.equal(zero.calls.selectTarget.length, 0);
  assert.equal(rollEvents(zero).length, 1);
  assert.ok(said(zero).some(line => /Target count 0 from Reason \(0\), so no targets were picked/.test(line)));
  assert.ok(said(zero).some(line => /Roll, then apply the result by hand/.test(line)));
  // Separate rolls for each target, with no target: one roll, not none.
  const separate = await run(t, perTargetCards(hit, { targetTiers: undefined, rollMode: 'individual' }), { targetSelections: [{ done: true }] });
  assert.equal(rollEvents(separate).length, 1);
  assert.ok(said(separate).some(line => /no targets were picked/.test(line)));
  // A roll without per-target results says nothing new.
  const classic = await run(t, perTargetCards(hit, { targetTiers: undefined }), { targetSelections: [{ done: true }] });
  assert.equal(rollEvents(classic).length, 1);
  assert.ok(!said(classic).some(line => /no targets were picked/.test(line)));
});

test('the pick prompt names creatureOrObject in words and leaves the other predicates as they were', async t => {
  const pick = (predicate, count, extra = {}) => [{ type: 'target', name: 'targets', mode: 'token', predicate, count, distance: { form: 'ranged', value: 10 }, ...extra },
    { type: 'powerRoll', attribute: 'Reason', target: 'targets', tiers: { tier1: { effects: hit }, tier2: { effects: hit }, tier3: { effects: hit } } }];
  const two = await run(t, pick('creatureOrObject', { value: 2, mode: 'exact' }));
  assert.deepEqual(two.calls.selectTarget.map(c => c.promptText),
    ['Pick 2 creatures or objects within 10 (1/2).', 'Pick 2 creatures or objects within 10 (2/2).']);
  assert.deepEqual(two.calls.selectTarget.map(c => [c.creature, c.predicate]), [['creatureOrObject', 'creatureOrObject'], ['creatureOrObject', 'creatureOrObject']]);
  const upTo = await run(t, pick('selfOrAlly', { value: 2, mode: 'upTo' }, { distance: { form: 'melee', value: 1 } }));
  assert.equal(upTo.calls.selectTarget[0].promptText, 'Pick up to 2 allies (or yourself) within reach (1) (1/2).');
  // One pick with no board prompt: nothing is sent, so the board shows no second prompt.
  const one = await run(t, pick('creatureOrObject', { value: 1, mode: 'exact' }), { targetSelections: [a] });
  assert.equal(one.calls.selectTarget[0].promptText, '');
  assert.equal(one.calls.selectTarget[0].showPrompt, false);
  // A card's own wording wins.
  const own = await run(t, pick('creatureOrObject', { value: 2, mode: 'exact' }, { promptText: 'Two things to burn.' }));
  assert.equal(own.calls.selectTarget[0].promptText, 'Two things to burn.');
  // Predicates that are already words: untouched.
  for (const predicate of ['creature', 'enemy', 'ally', 'object']) {
    const plain = await run(t, pick(predicate, { value: 2, mode: 'exact' }));
    assert.equal(plain.calls.selectTarget[0].promptText, '', predicate);
  }
  const h = await createAbilityAutomationHarness();
  t.after(() => h.close());
  const summarize = h.window.AbilityAutomationSchema.summarizeBlock;
  assert.equal(summarize({ type: 'target', mode: 'token', predicate: 'creatureOrObject', count: { value: 2, mode: 'exact' }, distance: { value: 10 } }), 'Pick 2 creatures or objects within 10.');
  assert.equal(summarize({ type: 'target', mode: 'token', predicate: 'creatureOrObject', count: { value: 1, mode: 'exact' }, distance: { value: 10 } }), 'Pick 1 creature or object within 10.');
  assert.equal(summarize({ type: 'target', mode: 'token', predicate: 'enemy', count: { value: 2, mode: 'exact' }, distance: { value: 10 } }), 'Pick 2 enemy within 10.');
});
