import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {terrainContact} from '../terrain-contact.js';
import {resolveForcedDrag} from '../forced-drag.js';
import {sample} from '../terrain-math.mjs';
import {slopeIndicator} from '../slope-indicator.mjs';
const field=JSON.parse(readFileSync(new URL('../../../../api/v2/tests/fixtures/short-cliff-terrain.json',import.meta.url)));
const ground=(x,y)=>sample(field,(x-field.bounds.left)/field.bounds.width,(y-field.bounds.top)/field.bounds.height);
const from={column:0,row:0,width:1,height:1};
test('one-square faces retain the 2:1 uphill grade, minimum rise and separate fall policy',()=>{
 const ramp=(rise,run)=>x=>rise*Math.max(0,Math.min(1,(x-1.5)/run));
 assert.notEqual(terrainContact(from,{column:4,row:0},ramp(1,.5)),null);
 assert.equal(terrainContact(from,{column:4,row:0},ramp(.99,.25)),null);
 assert.equal(terrainContact(from,{column:4,row:0},ramp(1.5,1.5/1.99)),null);
 assert.equal(terrainContact(from,{column:.5,row:0},ramp(1,.5)),null,'unreached face');
 assert.equal(terrainContact(from,{column:4,row:0},ramp(1,.5),()=>10),null,'elevated support');
 assert.equal(terrainContact({...from,movementMode:'fly',flightHeight:10},{column:4,row:0},ramp(1,.5)),null);
 assert.equal(terrainContact(from,{column:4,row:0},x=>-ramp(1,.5)(x),null,-1),null,'downhill fall policy unchanged');
 assert.notEqual(terrainContact(from,{column:4,row:0},x=>x>=1.5&&x<1.875?1:0),null,'narrow quarter-run faces retained');
});
test('measured Bathhouse short cliffs agree on client/server contacts, stops and damage',()=>{
 const php=spawnSync('php',[fileURLToPath(new URL('../../../../api/v2/tests/short-cliff.test.php',import.meta.url))],{encoding:'utf8'});
 assert.equal(php.status,0,php.stderr||php.stdout);const server=JSON.parse(php.stdout);
 [[12,35,10,35],[12,36,10,36],[15,35,13,35],[10,35,12,35],[12,35,12,36]].forEach(([x,y,xx,yy],i)=>{
  const a={id:'qa',column:x,row:y,width:1,height:1,levelId:'level-0',movementMode:'ground'},b={...a,column:xx,row:yy};
  const contact=terrainContact(a,b,ground),forced=resolveForcedDrag(a,b,[],{wallBlocked:(a,b)=>terrainContact(a,b,ground)!==null});
  assert.equal(contact,server[i].contact);
  assert.deepEqual({column:forced.destination.column,row:forced.destination.row,damage:forced.damage,wall:forced.wall,collidedIds:forced.collidedIds},server[i].forced);
  if(i<3){assert.equal(forced.wall,true);assert.ok(forced.damage>0);}
  else{assert.equal(contact,null);assert.equal(forced.damage,0);}
  if(i<2){assert.equal(forced.destination.column,12);assert.equal(forced.damage,4);}
  if(i===1)assert.ok(slopeIndicator(x+.5,y+.5,ground).grade>=2,'existing marker retains the qualifying local grade');
 });
});
