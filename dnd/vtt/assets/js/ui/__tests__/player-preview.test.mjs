import test from 'node:test';
import assert from 'node:assert/strict';
import {describePlayerPreview} from '../player-preview.js';
import {buildPlayerPreviewState} from '../player-preview-map.js';
import {createFogChecker} from '../fog-of-war.js';
test('preview PC fog reveals use the same normalized team aliases as the player board',()=>{
  const config={fogOfWar:{byLevel:{'level-0':{enabled:true,revealedCells:{}}}}};
  const preview={snapshot:{state:{routing:{activeSceneId:'scene'},sceneConfig:{scene:config},
    placements:{scene:{hero:{id:'hero',team:'ally',column:2,row:3,width:1,height:1}}}}}};
  const before=structuredClone(preview);
  const state=buildPlayerPreviewState(preview);
  const fog=createFogChecker(state,'level-0',{gmViewing:false});
  assert.equal(fog(2,3),false);assert.equal(fog(1,3),true);
  assert.deepEqual(preview,before);
  preview.snapshot.state.placements.scene.hero.column=2.5;
  assert.equal(buildPlayerPreviewState(preview).boardState.placements.scene[0].column,2.5,'Canonical fractional positions survive preview');
});
test('player details use their saved floor and canonical primary association',()=>{
  const preview={userId:'cal',snapshot:{revision:8,state:{routing:{activeSceneId:'player-scene'},sceneConfig:{'player-scene':{
    mapLevels:{levels:[{id:'upper',name:'Balcony'}]},userLevelState:{cal:{levelId:'upper',followToken:false}},
    pcTokenAssociations:{cal:null}},},placements:{'player-scene':{copy:{id:'copy',profileId:'cal'}}}}}};
  const view=describePlayerPreview(preview);
  assert.equal(view.sceneId,'player-scene');assert.equal(view.levelId,'upper');
  assert.equal(view.floorName,'Balcony');assert.equal(view.following,false);
  assert.equal(view.primary,null,'No fallback to a duplicate when primary is unavailable');
  preview.snapshot.state.sceneConfig['player-scene'].userLevelState.cal.levelId='deleted';
  assert.equal(describePlayerPreview(preview).levelId,'level-0');
  preview.snapshot.state.routing.activeSceneId=null;
  assert.equal(describePlayerPreview(preview).sceneId,null);
});
