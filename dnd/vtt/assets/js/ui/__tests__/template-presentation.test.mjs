import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTemplateLevelPresentation,applyTemplateVisibilityMask,clearTemplateVisibilityMask} from '../template-presentation.js';

const view={gridSize:64,gridOffsets:{left:293,top:295}};
function fixture() {
  return {
    shape:{levelId:'level-0',elements:{root:{style:{left:'293px',top:'295px',width:'256px',height:'256px'}}}},
    context:{viewerLevelId:'upper',levels:[{id:'level-0'},
      {id:'upper',mapUrl:'/upper.jpg',cutouts:[{column:1,row:1,width:2,height:2}]}]},
  };
}
test('template visibility clips through each intervening floor with grid origins intact',()=>{
  const {shape,context}=fixture(),before=structuredClone({shape,context});
  assert.deepEqual(resolveTemplateLevelPresentation(shape,view,context),{
    visible:true,maskRects:[{x:64,y:64,width:128,height:128}],
  });
  context.levels.push({id:'roof',mapUrl:'/roof.jpg',cutouts:[{column:2,row:1,width:2,height:1}]});
  context.viewerLevelId='roof';
  assert.deepEqual(resolveTemplateLevelPresentation(shape,view,context),{
    visible:true,maskRects:[{x:128,y:64,width:64,height:64}],
  });
  context.levels[2].cutouts=[];
  assert.equal(resolveTemplateLevelPresentation(shape,view,context).visible,false);
  assert.deepEqual(shape,before.shape,'Planning does not mutate shape geometry');
});
test('same-floor templates need no mask; above/hidden templates are excluded',()=>{
  const {shape,context}=fixture();
  shape.levelId='upper';
  assert.deepEqual(resolveTemplateLevelPresentation(shape,view,context),{visible:true,maskRects:null});
  context.viewerLevelId='level-0';assert.equal(resolveTemplateLevelPresentation(shape,view,context).visible,false);
  context.viewerLevelId='upper';context.levels[1].hidden=true;
  assert.equal(resolveTemplateLevelPresentation(shape,view,context).visible,false);
});
test('nonblocking floors and independent mask surfaces preserve scope',()=>{
  const {shape,context}=fixture();context.levels[1].blocksLowerLevelVision=false;
  assert.deepEqual(resolveTemplateLevelPresentation(shape,view,context),{visible:true,maskRects:null});
  const root=shape.elements.root;
  applyTemplateVisibilityMask(root,[{x:0,y:0,width:64,height:64}]);
  assert.match(root.style.maskImage,/data:image\/svg\+xml/);
  assert.equal(root.style.maskImage,root.style.webkitMaskImage);
  clearTemplateVisibilityMask(root);assert.equal(root.style.maskImage,'');
  root.style.width='0px';applyTemplateVisibilityMask(root,[{x:0,y:0,width:64,height:64}]);
  assert.equal(root.style.maskImage,'');
});
