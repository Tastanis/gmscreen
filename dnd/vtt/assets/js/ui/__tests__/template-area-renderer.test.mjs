import test from 'node:test';
import assert from 'node:assert/strict';
import {paintTemplateArea} from '../template-area-renderer.js';
const view={gridSize:64,gridOffsets:{left:293,top:295}};
function elements(){return {root:{style:{setProperty(name,value){this[name]=value;}}},node:{style:{}},label:{textContent:''}};}
test('circle painter preserves center, radius and node dimensions with shifted origin',()=>{
  const shape={type:'circle',radius:2,center:{column:7,row:6},elements:elements()};
  paintTemplateArea(shape,view);
  const {root,node,label}=shape.elements;
  assert.equal(root.style.left,'613px');assert.equal(root.style.top,'551px');
  assert.equal(root.style.width,'256px');assert.equal(root.style.height,'256px');
  assert.equal(node.style.left,'96px');assert.equal(node.style.width,'64px');
  assert.equal(label.textContent,'Radius: 2.0');
});
test('rotated rectangle painter uses rotated bounds and explicit anchor without moving shape data',()=>{
  const shape={type:'rectangle',length:4,width:2,start:{column:2,row:3},rotation:90,
    anchor:{column:1,row:2},elements:elements()};
  const before=JSON.stringify({...shape,elements:null});
  paintTemplateArea(shape,view);
  const {root,node,label}=shape.elements;
  assert.equal(parseFloat(root.style.left),485);assert.equal(parseFloat(root.style.top),423);
  assert.ok(Math.abs(parseFloat(root.style.width)-128)<1e-9);assert.equal(root.style.height,'256px');
  assert.equal(root.style['--vtt-rect-rotation'],'90deg');
  assert.equal(node.style.left,'-128px');assert.equal(node.style.top,'0px');
  assert.equal(label.textContent,'4.0 × 2.0');assert.equal(JSON.stringify({...shape,elements:null}),before);
});
test('rectangle without explicit anchor retains its outside control position',()=>{
  const shape={type:'rectangle',length:4,width:2,start:{column:2,row:3},rotation:0,elements:elements()};
  paintTemplateArea(shape,view);
  assert.equal(shape.elements.node.style.left,'96px');assert.equal(shape.elements.node.style.top,'-64px');
});
