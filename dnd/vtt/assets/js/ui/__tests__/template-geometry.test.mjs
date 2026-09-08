import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplateGeometry} from '../template-geometry.js';
const view=()=>({mapPixelSize:{width:640,height:640},gridSize:64,gridOffsets:{left:0,top:0,right:0,bottom:0}});
test('separate geometry contexts clamp saved shapes without mutating inputs or each other',()=>{
  const small=view(),large={...view(),mapPixelSize:{width:1280,height:1280}};
  const gm=createTemplateGeometry(()=>small),preview=createTemplateGeometry(()=>large);
  const source={id:'circle',type:'circle',center:{column:19,row:19},radius:2};
  const before=structuredClone(source);
  assert.deepEqual(gm.geometryForTemplate('circle',source).center,{column:8,row:8});
  assert.deepEqual(preview.geometryForTemplate('circle',source).center,{column:18,row:18});
  assert.deepEqual(gm.geometryForTemplate('circle',source).center,{column:8,row:8});
  assert.deepEqual(source,before);
});
test('hydration preserves rectangle orientation and shifts anchors with snapped starts',()=>{
  const geometry=createTemplateGeometry(view);
  const raw={id:'rect',type:'rectangle',start:{column:2.8,row:3.4},length:4,width:2,rotation:-90,anchor:{column:3.8,row:4.4}};
  const normalized=geometry.normalizeSerializedTemplate(raw);
  const hydrated=geometry.geometryForTemplate('rectangle',normalized);
  assert.equal(hydrated.rotation,270);assert.deepEqual(hydrated.start,{column:2,row:3});
  assert.ok(Math.abs(hydrated.anchor.column-3)<1e-10);assert.ok(Math.abs(hydrated.anchor.row-4)<1e-10);
  assert.equal(geometry.normalizeSerializedTemplate({id:'bad',type:'unknown'}),null);
});
