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
  assert.equal(skipped.calls.applyDamage.length, 0);
  assert.equal(rollEvents(skipped).length, 0);
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
