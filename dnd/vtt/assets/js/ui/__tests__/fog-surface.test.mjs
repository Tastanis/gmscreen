import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFogSurface,createFogChecker,isPositionFogged} from '../fog-of-war.js';
function canvas() {
 const paints=[{color:'old black mask'}],clears=[];
 const context={clearRect(...rect){clears.push(rect);paints.length=0;},fillRect(...rect){paints.push({rect,color:this.fillStyle});}};
 return {width:0,height:0,style:{},getContext:()=>context,paints,clears};
}
test('saved enabled manual fog is inert on independent GM and player preview surfaces',()=>{
 const state={boardState:{activeSceneId:'scene',sceneState:{scene:{fogOfWar:{byLevel:{
  'level-0':{enabled:true,revealedCells:{}},upper:{enabled:true,revealedCells:{'1,1':true}},
 }}}}}};
 const before=structuredClone(state),gm=canvas(),player=canvas();
 const view={mapPixelSize:{width:40,height:40},gridSize:16,gridOffsets:{left:4,top:4}};
 renderFogSurface({state,canvas:gm,view,sceneId:'scene',gmViewing:true});
 renderFogSurface({state,canvas:player,view,sceneId:'scene',levelId:'upper'});
 assert.deepEqual(gm.paints,[]);assert.deepEqual(player.paints,[]);
 assert.deepEqual(gm.clears,[[0,0,40,40]],'Preview never paints into GM context');
 assert.deepEqual(player.clears,[[0,0,40,40]]);
 assert.equal(player.style.width,'40px');assert.equal(player.height,40);
 for(const level of ['level-0','upper'])for(const gmViewing of [false,true]){
  assert.equal(createFogChecker(state,level,{gmViewing}),null);
  assert.equal(isPositionFogged(state,0,0,level),false);
 }
 assert.deepEqual(state,before,'Retirement does not rewrite imported compatibility data');
});
