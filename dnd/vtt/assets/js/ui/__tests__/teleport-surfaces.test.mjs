import test from 'node:test';
import assert from 'node:assert/strict';
import {teleportSurfaces,chooseTeleportHeight} from '../teleport-choice.js';
import {JSDOM} from 'jsdom';
import {terrainFloorContact,walkFloorContact} from '../floor-support.js';
test('base-floor contact removes only terrain immediately buried beneath a plate',()=>{
 const plate={id:'basement',kind:'floor',levelId:'level-0',height:0,points:[{x:0,y:0},{x:8,y:0},{x:8,y:8},{x:0,y:8}]};
 const config={mapLevels:{levels:[]},environment:{walls:{value:{roofs:[plate]}}}},context={state:{boardState:{activeSceneId:'scene',sceneState:{scene:config}}}},from={column:2,row:2,width:1,height:1,levelId:'level-0'},to={column:3,row:3};
 const choices=ground=>teleportSurfaces({from,to,context,ground:()=>ground});
 assert.equal(choices(0)[0].surfaceId,'basement','Authored floor wins physical height equality');
 assert.deepEqual(choices(-.125).map(c=>c.height),[0]);
 assert.deepEqual(choices(-2).map(c=>c.height),[-2,0]);
 assert.deepEqual(choices(-.126).map(c=>c.height),[-.126,0],'Different physical heights remain distinct despite equal rounded labels');
 assert.equal(terrainFloorContact(from,[plate],config.mapLevels,-.125),plate);
 assert.equal(walkFloorContact({...from,_supportSurfaceId:'basement'},to,[],[plate],config.mapLevels,()=>-.125),plate);
 assert.equal(walkFloorContact(from,to,[],[plate],config.mapLevels,()=>-2),null,'No ceiling acquisition from a shared base label');
 assert.deepEqual(teleportSurfaces({from,to:{column:9,row:9},context,ground:()=>-.125}).map(c=>c.height),[-.125]);
 plate.holes=[[{x:1,y:1},{x:5,y:1},{x:5,y:5},{x:1,y:5}]];
 assert.deepEqual(choices(-.125).map(c=>c.height),[-.125]);
});

function cubeFixture(squares,roofs=[]){
 const template={id:'wall-stack',type:'wall',levelId:'level-0',squares};
 const config={mapLevels:{levels:[]},environment:{walls:{value:{nodes:[],segments:[],roofs}}}};
 const context={isGM:false,view:{gridSize:64,gridOffsets:{}},state:{boardState:{activeSceneId:'scene',sceneState:{scene:config},templates:{scene:[template]}}}};
 const from={column:0,row:2,width:1,height:1,levelId:'level-0'},to={column:3,row:2};
 return {context,from,to,ground:()=>0};
}

test('stacked cube chooser offers exposed Wall top and native Roof, excluding solid interiors',()=>{
 const roof={id:'building-roof',kind:'roof',height:5,levelId:'level-0',points:[{x:3,y:2},{x:4,y:2},{x:4,y:3},{x:3,y:3}]};
 const fixture=cubeFixture([{column:3,row:2},{column:3,row:2,elevation:1},{column:3,row:2,elevation:2}],[roof]);
 const before=JSON.stringify(fixture.context.state),choices=teleportSurfaces(fixture);
 assert.deepEqual(choices.map(c=>[c.label,c.height]),[['Wall',3],['Roof',5]]);
 assert.equal(choices[0].surfaceId,'template-cube:wall-stack:3,2,2');
 assert.equal(JSON.stringify(fixture.context.state),before,'Chooser never persists derived cube geometry.');
 fixture.context.state.boardState.templates.scene=[];
 assert.deepEqual(teleportSurfaces(fixture).map(c=>[c.label,c.height]),[['Ground',0],['Roof',5]],'Deleted cube support disappears immediately.');
});

test('floating walls preserve Ground below, with fractional overlap and body-height clearance',()=>{
 const fixture=cubeFixture([{column:3,row:2,elevation:3}]);
 assert.deepEqual(teleportSurfaces(fixture).map(c=>[c.label,c.height]),[['Ground',0],['Wall',4]]);
 assert.deepEqual(teleportSurfaces({...fixture,to:{column:3.75,row:2}}).map(c=>c.label),['Ground','Wall'],'Any positive footprint overlap can support a lid.');
 assert.deepEqual(teleportSurfaces({...fixture,to:{column:4,row:2}}).map(c=>c.label),['Ground'],'Edge-only contact has no Wall support.');
 assert.deepEqual(teleportSurfaces({...fixture,from:{...fixture.from,width:4,height:4}}).map(c=>[c.label,c.height]),[['Wall',4]],'Large body cannot fit beneath elevated solid cube.');
});

test('cube chooser derives native-floor base and current independent template stacks',()=>{
 const floor={id:'raised-floor',kind:'floor',levelId:'level-0',height:2,points:[{x:3,y:2},{x:6,y:2},{x:6,y:5},{x:3,y:5}]};
 const fixture=cubeFixture([{column:3,row:2}],[floor]);
 fixture.context.state.boardState.templates.scene.push({id:'second-stack',type:'wall',levelId:'level-0',squares:[{column:3,row:2,elevation:1}]});
 assert.deepEqual(teleportSurfaces(fixture).map(c=>[c.label,c.height]),[['Ground',0],['Wall',4]],'Basement ground remains reachable but floor/lower lid inside solid stack are excluded.');
});

test('Wall choice retains selectable out-of-range warning and canonical height payload',async()=>{
 const dom=new JSDOM('<html><body></body></html>');globalThis.window=dom.window;globalThis.document=dom.window.document;
 globalThis.innerWidth=1280;globalThis.innerHeight=720;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;let arm=null;
 globalThis.setTimeout=(callback,ms)=>{assert.equal(ms,500);arm=callback;return 123;};globalThis.clearTimeout=()=>{};
 try{
  const fixture=cubeFixture([{column:3,row:2,elevation:2}]);
  const choicePromise=chooseTeleportHeight({...fixture,startHeight:0,range:1});
  const wall=[...document.querySelectorAll('.vtt-teleport-choice__location')].find(b=>b.textContent==='Wall4');
  assert.ok(wall);assert.equal(wall.disabled,true,'Existing click guard remains armed for 500ms.');
  arm();assert.equal(wall.disabled,false);assert.equal(wall.classList.contains('is-out-of-range'),true);
  wall.click();assert.deepEqual(await choicePromise,{height:3,range:1,allowOutOfRange:true});
 }finally{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;dom.window.close();}
});
