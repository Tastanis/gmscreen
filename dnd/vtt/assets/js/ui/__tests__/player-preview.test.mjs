import test from 'node:test';
import assert from 'node:assert/strict';
import {describePlayerPreview} from '../player-preview.js';
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
