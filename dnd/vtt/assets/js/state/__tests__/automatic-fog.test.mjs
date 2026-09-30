import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFogOfWarEntry} from '../normalize/fog.js';
import {initializeState,getState,updateState} from '../store.js';
test('explicit automatic fog boolean survives normalization/bootstrap/recovery independently of legacy enabled',()=>{
 for(const automaticEnabled of [false,true]){
  const raw={automaticEnabled,byLevel:{'level-0':{enabled:!automaticEnabled,revealedCells:[]}}};
  assert.equal(normalizeFogOfWarEntry(raw).automaticEnabled,automaticEnabled);
  initializeState({boardState:{activeSceneId:'scene',sceneState:{scene:{fogOfWar:raw}}}});
  assert.equal(getState().boardState.sceneState.scene.fogOfWar.automaticEnabled,automaticEnabled);
  updateState(draft=>{draft.boardState.sceneState.scene.fogOfWar=structuredClone(raw);});
  assert.equal(getState().boardState.sceneState.scene.fogOfWar.automaticEnabled,automaticEnabled);
 }
 assert.equal(Object.hasOwn(normalizeFogOfWarEntry({enabled:false,revealedCells:{}}),'automaticEnabled'),false,'Legacy data uses accessor default true');
 assert.equal(Object.hasOwn(normalizeFogOfWarEntry({automaticEnabled:'false'}),'automaticEnabled'),false,'Strings cannot disable automatic privacy');
});
