import test from 'node:test';
import assert from 'node:assert/strict';
import {teleportSurfaces} from '../teleport-choice.js';
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
