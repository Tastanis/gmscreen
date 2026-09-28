import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reduceCanonicalEvent} from '../../sync-v2/event-reducer.js';
import {terrainContact} from '../terrain-contact.js';
import {terrainPatch} from '../environment-sync.mjs';
import {resolveForcedDrag} from '../forced-drag.js';
import {fallDamage,ownsFall,fallerLandsProne,landingTargetProne,nextReviewableFall} from '../fall-review.js';
import {teleportDistance} from '../teleport-choice.js';
import {createEntityStore} from '../../sync-v2/entity-store.js';
import {createEventStream} from '../../sync-v2/event-stream.js';
const php=spawnSync('php',['-r','echo PHP_BINARY;'],{encoding:'utf8'}).stdout.trim();
const hasSqlite=spawnSync(php,['-r',"echo extension_loaded('pdo_sqlite') ? 'yes' : 'no';"],{encoding:'utf8'}).stdout.trim()==='yes';
const phpArgs=hasSqlite?[]:process.platform==='win32'?['-d',`extension_dir=${path.join(path.dirname(php),'ext')}`,'-d','extension=pdo_sqlite']:['-d','extension=pdo_sqlite'];
test('oversize delivery notice fetches complete authenticated recovery without skipping revisions',async()=>{
 const store=createEntityStore({revision:0,state:{}});let calls=0;
 const stream=createEventStream({store,recoveryClient:{recoverAfter:async revision=>{calls++;assert.equal(revision,0);return {mode:'snapshot',snapshot:{revision:2,state:{sceneConfig:{s:{environment:{terrain:{revision:1,value:{n:2,m:2,h:[1,2,3,4]}}}}}}}};}}});
 await stream.ingest({type:'sync.recoveryRequired',revision:2,operationId:'large-map'});assert.equal(calls,1);assert.equal(store.getRevision(),2);assert.deepEqual(store.getSnapshot().state.sceneConfig.s.environment.terrain.value.h,[1,2,3,4]);
});
test('teleport range, chosen surface and airborne arrival; terrain parity',()=>{
 const r=spawnSync(php,[...phpArgs,fileURLToPath(new URL('../../../../api/v2/tests/teleport-landing.test.php',import.meta.url))],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);
 const values=JSON.parse(r.stdout).terrainContacts;
 [.3,1,1.5,2,4].forEach((rise,i)=>assert.equal(terrainContact({column:0,row:0},{column:4,row:0},x=>rise*Math.max(0,Math.min(1,(x-1.375)/.125))),values[i]));
 assert.equal(teleportDistance({column:0,row:0},{column:3,row:0},5,1),4);
});
test('canonical falls and legacy ledger migration',()=>{
 const r=spawnSync(php,[...phpArgs,fileURLToPath(new URL('../../../../api/v2/tests/fall-outcome.test.php',import.meta.url))],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);
});
test('fall damage thresholds, cap, forced descent and actor-only prompt routing',()=>{
 assert.equal(fallDamage(3,2),0);assert.equal(fallDamage(4,2),4);assert.equal(fallDamage(100,0),50);assert.equal(fallDamage(4,2,true),8);
 assert.equal(fallDamage(3,-1),6,'Negative Agility cannot increase falling damage');
 assert.equal(fallDamage(3,0),6);assert.equal(fallDamage(1,-2),0,'Negative Agility cannot turn a short fall into a damaging one');
 assert.equal(fallDamage(3,-1,true),6);assert.equal(fallDamage(3,5),0);
 const r={kind:'fall',status:'pending',actorId:'Cal',sceneId:'s'};assert.equal(ownsFall(r,'cal','s'),true);assert.equal(ownsFall(r,'GM','s'),false);assert.equal(ownsFall(r,'cal','other'),false);
});
test('fall Prone distinguishes cushioned landings and each creature underneath',()=>{
 assert.equal(fallerLandsProne({squares:3},2),false);
 assert.equal(fallerLandsProne({squares:3},-1),true);
 assert.equal(fallerLandsProne({squares:1},0),false);
 assert.equal(fallerLandsProne({squares:3,forcedDown:true},5),true);
 assert.equal(fallerLandsProne({squares:1,collidedIds:['other']},5),true);
 assert.equal(landingTargetProne('1L',0),true);
 assert.equal(landingTargetProne(2,2),false);
 assert.equal(landingTargetProne(2,3),false);
 assert.equal(landingTargetProne(3,2),true);
});

test('missing fallers or landing creatures cannot block later actor-owned fall reviews',()=>{
 const record={kind:'fall',status:'pending',actorId:'GM',sceneId:'s',targetId:'present',details:{collidedIds:[]}};
 const records=[{...record,targetId:'deleted'}, {...record,details:{collidedIds:['deleted']}},
  {...record,actorId:'sharon'}, {...record,sceneId:'other'}, {...record,status:'needs_review'},
  {...record,status:'completed'}, {...record,status:'dismissed'}, record];
 const before=structuredClone(records),placement=id=>id==='present'?{id}:null;
 assert.equal(nextReviewableFall(records,'gm','s',placement),record);
 assert.deepEqual(records,before,'Queue selection never changes or settles receipts');
 assert.equal(nextReviewableFall(records.slice(0,-1),'gm','s',placement),undefined);
 assert.equal(nextReviewableFall(records,'gm','s',id=>({id})),records[0],'Restored targets can still be reviewed');
});
test('portal events, terrain patches and authoritative state reduce identically',()=>{
 const r=spawnSync(php,[...phpArgs,fileURLToPath(new URL('../../../../api/v2/tests/environment-handoff.test.php',import.meta.url))],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const data=JSON.parse(r.stdout);let current=data.before;const original=structuredClone(current);
 for(const event of data.events){const result=reduceCanonicalEvent(current,event);assert.equal(result.status,'applied',result.reason);current=result.snapshot;}
 assert.deepEqual(data.before,original);assert.deepEqual(current.state,data.after.state);
});
test('terrain patches cover changed vertices and preserve unedited samples',()=>{
 const a={n:3,m:2,h:[0,0,0,0,0,0]},b={...a,h:[0,2,0,0,3,0]};
 assert.deepEqual(terrainPatch(a,b),{i0:1,j0:0,i1:1,j1:1,values:[2,3]});
});
const from={column:0,row:0,width:1,height:1};
test('terrain noise, ledges, yellow slopes and unreached cliffs',()=>{
 assert.equal(terrainContact(from,{column:4,row:0},x=>x>=1?.3:0),null);
 assert.equal(terrainContact(from,{column:4,row:0},x=>1.5*x),null);
 assert.ok(terrainContact(from,{column:4,row:0},x=>x>=1?1:0)!==null);
 assert.ok(terrainContact(from,{column:4,row:0},x=>2*x)!==null);
 assert.equal(terrainContact(from,{column:.1,row:0},x=>x>=1?3:0),null);
});
test('wall stops use the 75 percent threshold and end on grid squares',()=>{
 for(const [contact,expected] of [[2.8,3],[2.5,2]]){
  const r=resolveForcedDrag(from,{column:5,row:0},[],{wallBlocked:(a,b)=>b.column>contact});
  assert.equal(r.destination.column,expected);assert.equal(r.damage,2+5-expected);
 }
 const diagonal=resolveForcedDrag(from,{column:5,row:3},[],{wallBlocked:(a,b)=>b.column>2.8});
 assert.equal(Number.isInteger(diagonal.destination.column)&&Number.isInteger(diagonal.destination.row),true);
});
