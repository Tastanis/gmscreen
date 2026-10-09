import test from 'node:test';
import assert from 'node:assert/strict';
const label={textContent:''},buttons=[{disabled:true,setAttribute(){}},{disabled:true,setAttribute(){}}];
const nav={setAttribute(){},querySelector:()=>label,querySelectorAll:()=>buttons};
const savedPreferences=new Map();
globalThis.window={};globalThis.document={querySelector:()=>nav};
globalThis.localStorage={getItem:key=>savedPreferences.get(key),setItem:(key,value)=>savedPreferences.set(key,value)};
globalThis.requestAnimationFrame=()=>{};
const c={isGM:true,levelId:'level-0',selectedIds:[],state:{boardState:{activeSceneId:'a',placements:{a:[{id:'pc'}]},sceneState:{a:{mapLevels:{levels:[{id:'ground',elevationSquares:2,zIndex:1},{id:'roof',elevationSquares:6,zIndex:2}]}}}}}};
window.terrainContext=()=>c;window.terrainPrototype={groundFor:()=>3.5};
const {gmVision}=await import('../gm-vision.js');
test('GM inspection crosses floor gaps and zero without mutating shared state',()=>{
 const before=JSON.stringify(c.state);assert.equal(gmVision.height,0);gmVision.step('down');assert.equal(gmVision.height,-1);assert.equal(gmVision.playerFloorId,'level-0');
 for(let i=0;i<4;i++)gmVision.step('up');assert.equal(gmVision.height,3);assert.equal(gmVision.playerFloorId,'ground');
 for(let i=0;i<5;i++)gmVision.step('up');assert.equal(gmVision.height,8);assert.equal(gmVision.playerFloorId,'roof');
 assert.equal(JSON.stringify(c.state),before);assert.equal(label.textContent,'Height 8');assert.ok(buttons.every(b=>!b.disabled));
});
test('height control leaves a selected token viewpoint locally and a new selection restores token vision',()=>{
 c.selectedIds=['pc'];assert.equal(gmVision.manual,false);assert.equal(gmVision.height,3.5);gmVision.step('down');/* a whole square down from the height shown (4), not 2.5 */assert.equal(gmVision.height,3);assert.equal(gmVision.manual,true);assert.equal(gmVision.lighting,false);assert.deepEqual(c.selectedIds,['pc']);
 c.selectedIds=[];assert.equal(gmVision.height,3);c.selectedIds=['pc'];assert.equal(gmVision.lighting,true);assert.equal(gmVision.height,3.5);
});
test('player cannot enable GM inspection or change the saved preference',()=>{
 const saved=localStorage.getItem('gm-inspection-height:a');c.isGM=false;gmVision.step('down');assert.equal(gmVision.manual,false);assert.equal(gmVision.lighting,true);assert.equal(gmVision.playerFloorId,null);assert.equal(localStorage.getItem('gm-inspection-height:a'),saved);
});
test('fractional inspection displays the terrain square without changing exact height',()=>{
 c.isGM=true;c.selectedIds=[];
 const before=JSON.stringify(c.state);
 for(const [height,display] of [[.93,1],[2.5832915,3],[2.49,2],[-.93,-1],[-.5,0]]){
  c.state.boardState.activeSceneId='height-display-'+height;
  savedPreferences.set('gm-inspection-height:'+c.state.boardState.activeSceneId,JSON.stringify({height}));
  gmVision.syncNavigation();
  assert.equal(label.textContent,'Height '+display);
  assert.equal(label.title,'Height '+display);
  assert.equal(gmVision.height,height);
 }
 c.state.boardState.activeSceneId='a';
 assert.equal(JSON.stringify(c.state),before);
});

