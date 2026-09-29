import test from 'node:test';
import assert from 'node:assert/strict';
import {wallCubeModel,wallCubeBase,wallMaterial,wallSquareKey,nextWallElevation,projectWallCube} from '../wall-cubes.js';
import {movementBlocked} from '../wall-properties.mjs';
import {makeSight} from '../vision-height.mjs';
import {floorSupported,walkFloorContact,terrainFloorContact,cubeStepDown} from '../floor-support.js';

const template={id:'stack',type:'wall',levelId:'level-0',color:'gray',squares:[
 {column:3,row:2},{column:3,row:2,elevation:1},{column:3,row:2,elevation:2},
]};
const actor={column:0,row:2,width:1,height:1,levelId:'level-0'};

test('wall cubes derive independent faces and lids without changing native geometry',()=>{
 const native={version:1,nodes:[{id:'original',x:20,y:20}],segments:[],roofs:[]};
 const before=structuredClone(native),model=wallCubeModel(native,[template],{},()=>0);
 assert.deepEqual(native,before);
 assert.equal(model.nodes.length,13);assert.equal(model.segments.length,12);
 assert.deepEqual(model.roofs.map(s=>[s.base,s.height,s.templateCube]),[[0,1,true],[1,2,true],[2,3,true]]);
 assert.equal(new Set(model.roofs.map(s=>s.id)).size,3);
 assert.equal(floorSupported(actor,model.roofs),null,'cube lids do not bound an otherwise unmodeled level');
 assert.equal(terrainFloorContact({...actor,column:3},model.roofs,{},0),null,'walking on terrain never climbs a cube');
});

test('cube tops permit lower adjoining support without bridging distant cubes or climbing',()=>{
 const model=wallCubeModel({},[{...template,squares:[{column:3,row:2,elevation:2},{column:4,row:2},{column:8,row:2}]}],{},()=>0);
 const from={...actor,column:3,_supportSurfaceId:model.roofs[0].id};
 assert.equal(cubeStepDown(from,{...from,column:4},model.roofs,{}),model.roofs[1]);
 assert.equal(cubeStepDown(from,{...from,column:8},model.roofs,{}),null,'no endpoint bridge');
 assert.equal(cubeStepDown({...from,column:4,_supportSurfaceId:model.roofs[1].id},{...from,column:3},model.roofs,{}),null,'no full-square climb');
 assert.equal(cubeStepDown(from,{...from,column:3.5},model.roofs,{}),null,'retain source until footprint fully leaves');
 const nativeFloor={id:'native',kind:'floor',levelId:'upper',height:5,points:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]};
 const upper=wallCubeModel({},[{...template,levelId:'upper',squares:[{column:3,row:2},{column:4,row:2}]}],{mapLevels:{levels:[{id:'upper',elevationSquares:5}]}},()=>0);
 const source={...from,levelId:'upper',_supportSurfaceId:upper.roofs[0].id};
 assert.equal(walkFloorContact(source,{...source,column:4},[],[nativeFloor,...upper.roofs],{levels:[{id:'upper'}]},()=>0)?.id,upper.roofs[1].id,'retained cube precedes native floor below');
});

test('all materials block grounded swept movement and sight, with vertical clearance above',()=>{
 for(const color of ['gray','green','purple','blue','red']){
  const walls=wallCubeModel({},[{...template,color}],{},()=>0);
  assert.equal(movementBlocked(walls,actor,{...actor,column:6},()=>0,()=>0),true,color);
  assert.equal(movementBlocked(walls,actor,{...actor,column:6},()=>3,()=>0),false,color+' above top');
  assert.equal(movementBlocked(walls,actor,{...actor,row:1},()=>0,()=>0),false,color+' outside cube');
  const sight=makeSight({viewer:actor,groundAt:()=>0,walls});
  assert.equal(sight({x:6.5,y:2.5},1),false,color+' blocks low ray');
  assert.equal(makeSight({viewer:actor,viewerGround:3,groundAt:()=>0,walls})({x:6.5,y:2.5},4),true,color+' clears high ray');
 }
 const floating=wallCubeModel({},[{...template,squares:[{column:3,row:2,elevation:2}]}],{},()=>0);
 assert.equal(movementBlocked(floating,actor,{...actor,column:6},()=>0,()=>0),false,'empty space under elevated cube remains open');
});

test('cube bases follow supported native floor plates and stack identity follows parallax',()=>{
 const floor={id:'room',kind:'floor',levelId:'level-0',height:2,points:[{x:2,y:0},{x:6,y:0},{x:6,y:6},{x:2,y:6}]};
 const config={environment:{walls:{value:{roofs:[floor]}}}};
 assert.equal(wallCubeBase(template,template.squares[2],config,()=>-2),4);
 assert.equal(wallCubeBase(template,{column:8,row:2,elevation:1},config,()=>-2),-1);
 const upper={...template,levelId:'upper'},upperConfig={mapLevels:{levels:[{id:'upper',elevationSquares:5}]},environment:{walls:{value:{roofs:[{...floor,levelId:'upper',height:5}]}}}};
 assert.equal(wallCubeBase(upper,{column:8,row:2},upperConfig,()=>-2),-2,'authored floor bounds use terrain outside');
 assert.equal(wallCubeBase(upper,{column:8,row:2},{mapLevels:upperConfig.mapLevels},()=>-2),5,'unmodeled legacy upper floor keeps plane');
 const ramp={left:0,right:4,top:0,bottom:4,base:0,height:4,direction:'east',fromLevel:'level-0',toLevel:'upper'};
 assert.equal(wallCubeBase(template,{column:1,row:1},{environment:{walls:{value:{ramps:[ramp]}}}},()=>-2),1.5,'cube at supported ramp uses its absolute height');
 assert.equal(wallCubeBase(template,{column:3,row:1},{environment:{walls:{value:{ramps:[ramp]}}}},()=>-2),-2,'base-floor token cannot attach to unsupported ramp section');
 assert.equal(nextWallElevation({column:3,row:2},template.squares),3);
 assert.equal(nextWallElevation({column:4,row:2},template.squares),0);
 assert.notEqual(wallSquareKey(template.squares[0]),wallSquareKey(template.squares[1]));
 const low=projectWallCube(template.squares[0],0,100),high=projectWallCube(template.squares[1],1,100);
 assert.equal(high.top[0].x-low.top[0].x,12);
 assert.equal(high.top[0].y-low.top[0].y,-36);
 assert.deepEqual(['gray','green','purple','blue','red'].map(wallMaterial),['stone','dirt','metal','ice','fire']);
});

test('retained cube contact crosses adjoining same-height tops without terrain acquisition',()=>{
 const model=wallCubeModel({},[{...template,squares:[{column:3,row:2},{column:4,row:2}]}],{},()=>0);
 const from={...actor,column:3,_supportSurfaceId:model.roofs[0].id};
 assert.equal(walkFloorContact(from,{...from,column:4},[],model.roofs,{},()=>0)?.id,model.roofs[1].id);
 assert.equal(walkFloorContact(actor,{...actor,column:3},[],model.roofs,{},()=>0),null);
});

test('flush native floor and cube tops transfer contact in both directions',()=>{
 const model=wallCubeModel({},[{...template,squares:[{column:3,row:2}]}],{},()=>0);
 const floor={id:'room',kind:'floor',levelId:'room',height:1,points:[{x:4,y:0},{x:8,y:0},{x:8,y:6},{x:4,y:6}]};
 const levels={levels:[{id:'room',elevationSquares:1}]},surfaces=[floor,...model.roofs];
 const from={...actor,column:3,_supportSurfaceId:model.roofs[0].id};
 assert.equal(walkFloorContact(from,{...from,column:5},[],surfaces,levels,()=>0)?.id,floor.id);
 const returning={...actor,column:5,levelId:'room',_supportSurfaceId:floor.id};
 assert.equal(walkFloorContact(returning,{...returning,column:3},[],surfaces,levels,()=>0)?.id,model.roofs[0].id);
});

test('canonical hydration and template geometry preserve stacked squares independently',async()=>{
 const {normalizeTemplates}=await import('../../state/normalize/templates.js');
 const {createTemplateGeometry}=await import('../template-geometry.js');
 const data={...template,squares:[...template.squares,{column:3,row:2,elevation:1}]};
 const geometry=createTemplateGeometry();
 assert.deepEqual(geometry.geometryForTemplate('wall',data).squares,template.squares);
 const hydrated=normalizeTemplates({scene:[template]});
 assert.deepEqual(hydrated.scene[0].squares,template.squares);
});
