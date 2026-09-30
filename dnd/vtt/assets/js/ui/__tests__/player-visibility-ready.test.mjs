import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {beginPlayerVisibility,preparePlayerVisibility,confirmPlayerFogPaint,confirmPlayerHeightPaint,confirmPlayerNoHeightPaint} from '../player-visibility-ready.js';
const state=(id,height=false)=>({boardState:{activeSceneId:id,mapUrl:`/${id}.jpg`,sceneState:{[id]:{environment:height?{terrain:{value:{}}}:{}}},templates:{[id]:[]}}});
const view={mapLoaded:true,mapPixelSize:{width:100,height:100}};
function dom(){globalThis.document=new JSDOM('<html><body><div id="vtt-map-transform"></div></body></html>').window.document;return ()=>document.documentElement.classList.contains('vtt-player-visibility-pending');}

test('player map stays hidden until every required initial privacy mask is painted',()=>{
 const pending=dom(),s=state('height',true);beginPlayerVisibility(s);
 assert.equal(pending(),true);assert.equal(document.getElementById('vtt-map-transform').inert,true);
 confirmPlayerFogPaint(s,{mapLoaded:false});assert.equal(pending(),true);
 confirmPlayerFogPaint(s,{mapLoaded:true,mapPixelSize:{width:0,height:0}});assert.equal(pending(),true);
 confirmPlayerFogPaint(s,view);assert.equal(pending(),true);
 confirmPlayerHeightPaint(s,view);assert.equal(pending(),false);assert.equal(document.getElementById('vtt-map-transform').inert,false);
});

test('same-map floor changes require both newly matching masks',()=>{
 const pending=dom(),s=state('floors',true);beginPlayerVisibility(s);confirmPlayerFogPaint(s,view);confirmPlayerHeightPaint(s,view);assert.equal(pending(),false);
 preparePlayerVisibility(s,{levelId:'upper'});assert.equal(pending(),true);
 confirmPlayerFogPaint(s,view);confirmPlayerHeightPaint(s,view);assert.equal(pending(),true,'old floor masks cannot reopen new floor');
 confirmPlayerFogPaint(s,view,false,'upper');confirmPlayerHeightPaint(s,view,false,'upper');assert.equal(pending(),false);
});

test('flat maps require an initialized renderer decision; scene replacement ignores an earlier mask receipt',()=>{
 const pending=dom(),old=state('old',true),next=state('next');beginPlayerVisibility(old);confirmPlayerHeightPaint(old,view);assert.equal(pending(),true);
 preparePlayerVisibility(next);confirmPlayerFogPaint(old,view);confirmPlayerHeightPaint(old,view);assert.equal(pending(),true);
 confirmPlayerFogPaint(next,view);assert.equal(pending(),true,'ordinary fog alone cannot infer renderer readiness');confirmPlayerNoHeightPaint(next,view);assert.equal(pending(),false);
 beginPlayerVisibility(next);assert.equal(pending(),true);
});

test('automatic geometry activation invalidates an earlier flat-map decision',()=>{
 const pending=dom(),s=state('activation');beginPlayerVisibility(s);confirmPlayerFogPaint(s,view);confirmPlayerNoHeightPaint(s,view);assert.equal(pending(),false);
 s.boardState.sceneState.activation.environment={terrain:{value:{}}};preparePlayerVisibility(s);assert.equal(pending(),true);
 confirmPlayerFogPaint(s,view);confirmPlayerNoHeightPaint(s,view);assert.equal(pending(),true);
 confirmPlayerHeightPaint(s,view);assert.equal(pending(),false);
});

test('GM mask callbacks do not alter GM map presentation',()=>{
 const pending=dom(),s=state('gm',true);beginPlayerVisibility(s,{isGm:true});confirmPlayerFogPaint(s,view,true);confirmPlayerHeightPaint(s,view,true);assert.equal(pending(),false);
});
