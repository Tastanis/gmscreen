import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFogSurface,createFogChecker} from '../fog-of-war.js';

function canvas() {
  const paints=[];
  const context={clearRect(){paints.length=0;},fillRect(...rect){paints.push({rect,color:this.fillStyle});}};
  return {width:0,height:0,style:{},getContext:()=>context,paints};
}
test('independent player and GM fog surfaces share cells but never context or opacity',()=>{
  const fogOfWar = {byLevel: {
    'level-0': {enabled:true, revealedCells:{'0,0':true}},
    upper: {enabled:true, revealedCells:{'1,1':true}},
  }};
  const state = {
    tokens: {items:[], folders:[]},
    boardState: {activeSceneId:'scene', placements:{scene:[]}, sceneState:{scene:{fogOfWar}}},
  };
  const before=structuredClone(state),gm=canvas(),player=canvas();
  const view={mapPixelSize:{width:40,height:40},gridSize:16,gridOffsets:{left:4,top:4,right:4,bottom:4}};
  renderFogSurface({state,canvas:gm,view,sceneId:'scene',gmViewing:true});
  const gmPaints=structuredClone(gm.paints);
  renderFogSurface({state,canvas:player,view,sceneId:'scene',levelId:'upper'});
  assert.equal(gm.paints.every(p=>p.color==='rgba(0,0,0,0.7)'),true);
  assert.equal(player.paints.every(p=>p.color==='rgba(0,0,0,1)'),true);
  assert.equal(player.paints.some(p=>JSON.stringify(p.rect)==='[20,20,16,16]'),false,'Upper revealed cell remains clear');
  assert.equal(player.paints.some(p=>JSON.stringify(p.rect)==='[4,4,16,16]'),true,'Base reveal does not reveal upper floor');
  assert.deepEqual(gm.paints,gmPaints,'Preview does not redraw GM canvas');
  const check=createFogChecker(state,'upper',{gmViewing:false});
  assert.equal(check(1,1),false);assert.equal(check(0,0),true);
  assert.equal(createFogChecker(state,'upper',{gmViewing:true}),null);
  assert.deepEqual(state,before);
  renderFogSurface({state,canvas:player,view,sceneId:null});
  assert.deepEqual(player.paints,[],'Closed scene clears preview');
});
