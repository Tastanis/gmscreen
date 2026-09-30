import test from 'node:test';
import assert from 'node:assert/strict';
import { wallOccupiesHeight, wallHeightIntervals, sliceWallModel, inspectionPlanePoint } from '../wall-height-slice.mjs';
const a={id:'a',x:0,y:0},b={id:'b',x:4,y:0},flat=()=>0;

test('fixed wall slices use physical half-open vertical intervals',()=>{
 const edge={baseMode:'fixed',base:2,height:2};
 assert.deepEqual(wallHeightIntervals(edge,a,b,0,flat),[]);
 assert.deepEqual(wallHeightIntervals(edge,a,b,2,flat),[[0,1]]);
 assert.deepEqual(wallHeightIntervals(edge,a,b,3.5,flat),[[0,1]]);
 assert.deepEqual(wallHeightIntervals(edge,a,b,4,flat),[]);
 assert.equal(wallOccupiesHeight({base:2,top:2},2),false);
 assert.equal(wallOccupiesHeight({base:2,top:4},2-5e-8),true);
 assert.equal(wallOccupiesHeight({base:2,top:4},4-5e-8),false);
});

test('terrain-following wall renders just its intersecting physical portion',()=>{
 const intervals=wallHeightIntervals({height:1},a,b,3,x=>x);
 assert.equal(intervals.length,1);
 assert.ok(Math.abs(intervals[0][0]-.5)<1e-6);
 assert.ok(Math.abs(intervals[0][1]-.75)<1e-6);
 const topLevel=wallHeightIntervals({height:1,topMode:'level'},a,b,3,x=>x);
 assert.equal(topLevel.length,1);
 assert.ok(Math.abs(topLevel[0][0])<1e-6);
 assert.ok(Math.abs(topLevel[0][1]-.75)<1e-6);
});

test('terrain-following wall supports disconnected visible portions',()=>{
 const intervals=wallHeightIntervals({height:1},a,b,2,x=>Math.abs(x-2));
 assert.equal(intervals.length,2);
 assert.ok(Math.abs(intervals[0][0])<1e-6);
 assert.ok(Math.abs(intervals[0][1]-.25)<1e-6);
 assert.ok(Math.abs(intervals[1][0]-.75)<1e-6);
 assert.ok(Math.abs(intervals[1][1]-1)<1e-6);
});

test('render and picking share visible edges and physical endpoint nodes without changing source',()=>{
 const model={nodes:[a,b,{id:'c',x:0,y:2},{id:'d',x:4,y:2}],segments:[
  {id:'lower',a:'a',b:'b',baseMode:'fixed',base:0,height:2},
  {id:'upper',a:'c',b:'d',baseMode:'fixed',base:2,height:2},
 ]};
 const before=JSON.stringify(model),slice=sliceWallModel(model,2,flat);
 assert.deepEqual(slice.segments.map(s=>s.edge.id),['upper']);
 assert.deepEqual([...slice.nodeIds],['c','d']);
 assert.equal(JSON.stringify(model),before);
 const partial=sliceWallModel({nodes:[a,b],segments:[{id:'slope',a:'a',b:'b',height:1}]},3,x=>x);
 assert.equal(partial.nodeIds.size,0,'Clipped mid-edge endpoints do not expose hidden corner handles.');
});

test('inspection plane pointer inversion matches height-projected wall paths',()=>{
 const project=(x,y,h)=>({x:x+h*75*.12,y:y-h*75*.36});
 for(const h of [-2,0,2,6]){
  const point={x:427.5,y:183.25};
  assert.deepEqual(inspectionPlanePoint(project(point.x,point.y,h),h,project),point);
 }
});

test('unsliced viewers retain complete canonical walls',()=>{
 assert.deepEqual(wallHeightIntervals({baseMode:'fixed',base:4,height:2},a,b,null,flat),[[0,1]]);
});
