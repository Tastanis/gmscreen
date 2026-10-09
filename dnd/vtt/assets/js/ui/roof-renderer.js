import {roofTopOccluders,roofTopRamps,wallUnderRoof,roofRevealHeight} from './roof-top-occlusion.mjs';
import {rampPlane,rampAt,rampHeight,rampPick,rampGround,rampSupports,rampLanding,landingPeekRamps,inLandingPeek} from './imported-ramps.mjs';
import {seesFlatTop,seesRampTop} from './surface-facing.mjs';
import {compileBuildingCutaway} from './building-cutaway.mjs';
import {doorwayCutaways} from './doorway-cutaway.mjs';
import {onSurface,surfacePath,supportAt} from './stacked-surfaces.mjs';
import {wallHeights} from './wall-properties.mjs';
import {nearestOnSegment} from './wall-geometry.mjs';
import {makeSight,head} from './vision-height.mjs';
import {insideRoom,roofSurfaces,ceilingBlocks} from './roof-geometry.mjs';import {getRoofImage} from './roof-images.mjs';import {adaptiveFog} from './adaptive-fog.mjs';
import {createRoofImageCache} from './roof-image-cache.mjs';
import {sideFoot,viewAbove,shapesAbove,dimsBelow,SHAPE_FILL,SHAPE_EDGE,DIM_FILL} from './height-view.mjs';
const canvas=document.createElement('canvas');canvas.id='roof-prototype';canvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:100001';document.querySelector('#vtt-map-transform').append(canvas);
const roofLayer=document.createElement('canvas');
let revision=0,cutawayKey='',buildingCutaway=null;
const cache=createRoofImageCache({load:id=>(id.startsWith('/dnd/vtt/')?fetch(id).then(r=>{if(!r.ok)throw Error('Roof image failed ('+r.status+')');return r.blob();}):getRoofImage(id)).then(blob=>blob?createImageBitmap(blob):null),onLoaded:()=>revision++,onError:e=>console.error('Roof image could not be loaded',e)});
function requestImage(id){cache.request(id);}
export const roofRenderer={get revision(){return revision;},surfaces:roofSurfaces,
 blockSight(viewer,eye,sight,model){const roofs=roofSurfaces(model);return (p,z,t)=>!ceilingBlocks(viewer,eye,p,z,roofs)&&sight(p,z,t);},
 paint({inspectionHeight=null,lighting=true,context,viewer,token,viewerGround,sight,groundAt,terrain,model,editing,enabled}){
  canvas.hidden=!enabled||editing;if(!enabled||editing)return;const v=context.view,g=v.gridSize,ox=v.gridOffsets.left||0,oy=v.gridOffsets.top||0;
  if(canvas.width!==v.mapPixelSize.width||canvas.height!==v.mapPixelSize.height){canvas.width=v.mapPixelSize.width;canvas.height=v.mapPixelSize.height;}
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!viewer||!sight)return;
  const surfaces=roofSurfaces(model).sort((a,b)=>a.height-b.height),nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const nextCutawayKey=JSON.stringify(surfaces.map(s=>[s.id,s.height,s.points,s.templateCube===true]));
  if(nextCutawayKey!==cutawayKey){cutawayKey=nextCutawayKey;buildingCutaway=compileBuildingCutaway(surfaces);}
  const interiorHidden=inspectionHeight===null?buildingCutaway(viewer,head(token,viewerGround),viewerGround):new Set();
  const openRooms=inspectionHeight===null&&lighting?doorwayCutaways(model,head(token,viewerGround),groundAt,sight):[];
  const importedRamps=model.ramps||[];
  const rampList=importedRamps;
  const rampLayers=rampList.map(s=>{const corners=[[s.left,s.top],[s.right,s.top],[s.right,s.bottom],[s.left,s.bottom]].map(([x,y])=>window.terrainPrototype.project(ox+x*g,oy+y*g,rampHeight(s,x,y))),x=Math.floor(Math.min(...corners.map(p=>p.x))-2),y=Math.floor(Math.min(...corners.map(p=>p.y))-2),mask=document.createElement('canvas');mask.width=Math.ceil(Math.max(...corners.map(p=>p.x))-x+4);mask.height=Math.ceil(Math.max(...corners.map(p=>p.y))-y+4);return {s,x,y,mask};});
  const target=ctx;
  // Floating plates over the viewer's head are not drawn. A scene may ask for them to be shown as
  // see-through shapes (height-view.mjs): a hero looking up knows something is there, and can still
  // read and click what lies under it. Only when looking through a token's eyes.
  const overhead=new Set(inspectionHeight===null?shapesAbove(surfaces,head(token,viewerGround),viewAbove(model)).map(s=>s.id):[]);
  for(const roof of surfaces){
   if(interiorHidden.has(roof.id))continue;
   const edgeOn=inspectionHeight===null&&roof.kind==='floor'&&head(token,viewerGround)<=roof.height+1e-6;
   const peek=edgeOn?landingPeekRamps(importedRamps,token,viewerGround,roof.height):[];
   if(edgeOn&&!peek.length){
    if(overhead.has(roof.id)){const shape=surfacePath(roof,p=>window.terrainPrototype.project(ox+p.x*g,oy+p.y*g,roof.height));target.save();target.fillStyle=SHAPE_FILL;target.fill(shape,'evenodd');target.strokeStyle=SHAPE_EDGE;target.lineWidth=Math.max(1.5,g*.035);target.lineJoin='round';target.stroke(shape);target.restore();}
    continue;
   }
   if(inspectionHeight!==null&&roof.height>inspectionHeight+.001)continue;
   if(!roof.imageId)continue;
   requestImage(roof.imageId);const image=cache.get(roof.imageId);
   const underneath=viewerGround<roof.height-.01;if(inspectionHeight===null&&underneath&&insideRoom(viewer,roof.points))continue;
   if(roofLayer.width!==canvas.width||roofLayer.height!==canvas.height){roofLayer.width=canvas.width;roofLayer.height=canvas.height;}
   const ctx=roofLayer.getContext('2d');ctx.clearRect(0,0,roofLayer.width,roofLayer.height);
   const path=new Path2D(),left=Math.min(...roof.points.map(p=>p.x)),right=Math.max(...roof.points.map(p=>p.x)),top=Math.min(...roof.points.map(p=>p.y)),bottom=Math.max(...roof.points.map(p=>p.y));
   // Imported faces have explicit rings rather than shared wall IDs. Exclude
   // their supporting wall from roof-top rays, but retain walls above the floor.
   const boundary=new Set(roof.nodes||[]),onBoundary=p=>[roof.points,...roof.holes||[]].some(ring=>ring.some((a,i)=>{const q=nearestOnSegment(p,a,ring[(i+1)%ring.length]);return Math.hypot(q.x-p.x,q.y-p.y)<.001;}));
   const roofSight=makeSight({viewer:token,viewerGround,groundAt,terrain,walls:{...model,ramps:roofTopRamps(roof,model.ramps||[]),segments:model.segments.filter(e=>{
    const a=nodes.get(e.a),b=nodes.get(e.b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    return !wallUnderRoof(roof,e,a,b,groundAt)&&!((boundary.has(e.a)&&boundary.has(e.b)||onBoundary(a)&&onBoundary(b)&&onBoundary(mid))&&wallHeights(e,a,b,mid,groundAt).top<=roof.height+.001);
   })}});
   const interiorHeight=p=>supportAt(surfaces.filter(s=>s.id!==roof.id),p,roof.height-.01)?.height??groundAt(p.x,p.y);
   const topOccluders=roofTopOccluders(roof,surfaces.filter(s=>!interiorHidden.has(s.id)));
   const visible=p=>onSurface(roof,p)&&(!edgeOn||inLandingPeek(peek,p))&&(!lighting||(!ceilingBlocks(viewer,head(token,viewerGround),p,roof.height+.01,topOccluders(p))&&roofSight(p,roof.height+.01)));

   const project=p=>window.terrainPrototype.project(ox+p.x*g,oy+p.y*g,roof.height);
   adaptiveFog({left,top,right,bottom,maxDepth:2,edgeSteps:4,visible,emit:polygon=>{polygon.forEach((p,i)=>{const q=project(p);if(i)path.lineTo(q.x,q.y);else path.moveTo(q.x,q.y);});path.closePath();}});
   // Opaque edge faces bridge the parallax displacement. They only cover the
   // seam below a visible plate, never invent visible rooms behind a wall.
   for(const [ringIndex,ring] of [roof.points,...roof.holes||[]].entries())for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*8));
    for(let k=0;k<steps;k++){
     const at=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),u=at(k/steps),w=at((k+1)/steps),mid=at((k+.5)/steps),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
     const probes=[{x:mid.x-dy/len*.02,y:mid.y+dx/len*.02},{x:mid.x+dy/len*.02,y:mid.y-dx/len*.02}];
     if(!probes.some(visible))continue;
     // A floating plate's side is a short slab edge, not a wall down to the ground (height-view.mjs).
     const base=p=>{const ramp=rampAt(importedRamps,p),step=ramp?rampHeight(ramp,p.x,p.y):null;return Math.min(roof.height,step??(ringIndex?roof.height-.15:sideFoot(roof,interiorHeight(p))));};
     const quad=[project(u),project(w),window.terrainPrototype.project(ox+w.x*g,oy+w.y*g,base(w)),window.terrainPrototype.project(ox+u.x*g,oy+u.y*g,base(u))];
     ctx.beginPath();quad.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#292820';ctx.fill();
    }
   }
   const outline=surfacePath(roof,project);
   // A hidden solid floor is opaque; only its authored holes expose below.
   // Loading/failed artwork must not remove physical cover over the base map.
   // The normal interior/doorway cutaways below still apply to this layer.
   // A scene may ask for the unseen part of a floating plate below the viewer to be its picture,
   // dimmed, in place of black (height-view.mjs). The seen part is painted over it at full strength below.
   if(image&&!edgeOn&&lighting&&inspectionHeight===null&&dimsBelow(roof,model)){ctx.save();ctx.clip(outline,'evenodd');const at=window.terrainPrototype.project(v.mapInsets.left,v.mapInsets.top,roof.height);ctx.drawImage(image,at.x,at.y);ctx.fillStyle=DIM_FILL;ctx.fill(outline,'evenodd');ctx.restore();}
   else if(roof.kind==='floor'||!image){ctx.save();ctx.fillStyle='#000';if(edgeOn)ctx.clip(path);ctx.fill(outline,'evenodd');ctx.restore();}
   if(image){ctx.save();ctx.clip(outline,'evenodd');ctx.clip(path);const at=window.terrainPrototype.project(v.mapInsets.left,v.mapInsets.top,roof.height);ctx.drawImage(image,at.x,at.y);ctx.restore();}
   // Cut at the displayed interior's height, not at the roof height. Erase only
   // this roof layer so the lower floor remains intact under the same pixels.
   if(lighting&&underneath&&(roof.kind!=='floor'||head(token,viewerGround)<roof.height-.01)){
    const reveal=new Path2D();
    const revealHeight=p=>roofRevealHeight(roof,surfaces,p,head(token,viewerGround),groundAt);
    const revealInterior=p=>onSurface(roof,p)&&seesFlatTop(head(token,viewerGround),revealHeight(p))&&sight(p,revealHeight(p));
    adaptiveFog({left,top,right,bottom,maxDepth:2,edgeSteps:4,visible:revealInterior,emit:polygon=>{
     polygon.forEach((p,i)=>{const q=window.terrainPrototype.project(ox+p.x*g,oy+p.y*g,revealHeight(p));if(i)reveal.lineTo(q.x,q.y);else reveal.moveTo(q.x,q.y);});reveal.closePath();
    }});
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fill(reveal);ctx.restore();
   }
   // Cut away a whole doorway-visible room, including its parallax edge face.
   // The independent ground/floor fog remains responsible for hidden interiors.
   if(roof.height>head(token,viewerGround)+1e-6&&openRooms.length){
    ctx.save();ctx.globalCompositeOperation='destination-out';
    for(const room of openRooms){
     const upper=room.map(project),lower=room.map(p=>window.terrainPrototype.project(ox+p.x*g,oy+p.y*g,roofRevealHeight(roof,surfaces,p,head(token,viewerGround),groundAt)));
     const fill=ring=>{ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();};
     fill(upper);fill(lower);
     for(let i=0;i<room.length;i++){const j=(i+1)%room.length;fill([upper[i],upper[j],lower[j],lower[i]]);}
    }
    ctx.restore();
   }
   target.drawImage(roofLayer,0,0);
   for(const r of rampLayers)if(roof.height>=r.s.height-1e-6)r.mask.getContext('2d').drawImage(roofLayer,-r.x,-r.y);
  }
  // Draw the actual stair artwork on its own incline. The terrain underneath
  // the landing remains ground level and must never supply the stair texture.
  for(const layer of rampLayers){
   const s=layer.s,art=document.createElement('canvas');art.width=layer.mask.width;art.height=layer.mask.height;const ctx=art.getContext('2d');ctx.translate(-layer.x,-layer.y);
   requestImage(s.imageId);const image=cache.get(s.imageId);if(!image)continue;
   const plane=rampPlane(s),horizontal=Math.abs(plane.a)>0,gradient={x:plane.a,y:plane.b},slant=window.terrainPrototype.slant;
   const start=horizontal?s.left:s.top,end=horizontal?s.right:s.bottom;
   for(let t=start;t<end-1e-7;t+=1/16){
    const x=horizontal?t:s.left,y=horizontal?s.top:t,w=horizontal?Math.min(1/16,end-t):s.right-s.left,h=horizontal?s.bottom-s.top:Math.min(1/16,end-t),mid={x:x+w/2,y:y+h/2},z=rampHeight(s,mid.x,mid.y);
    if(inspectionHeight!==null&&z>inspectionHeight)continue;
    if(inspectionHeight===null&&!seesRampTop(viewer,head(token,viewerGround),mid,z,gradient))continue;
    if(lighting&&!sight(mid,z))continue;
    const origin=window.terrainPrototype.project(ox+x*g,oy+y*g,rampHeight(s,x,y));
    ctx.save();ctx.transform(1+slant.x*plane.a,-slant.y*plane.a,slant.x*plane.b,1-slant.y*plane.b,origin.x,origin.y);
    ctx.drawImage(image,ox+x*g-v.mapInsets.left,oy+y*g-v.mapInsets.top,w*g,h*g,0,0,w*g+.2,h*g+.2);ctx.restore();
   }
   if(window.terrainPrototype.markersVisible&&Math.hypot(plane.a,plane.b)>=.3){
    const length=Math.hypot(plane.a,plane.b),ux=plane.a/length,uy=plane.b/length;
    for(let t=start+.5;t<end;t++){
     const p={x:horizontal?t:(s.left+s.right)/2,y:horizontal?(s.top+s.bottom)/2:t},z=rampHeight(s,p.x,p.y);
     if(inspectionHeight!==null&&z>inspectionHeight)continue;
     if(inspectionHeight===null&&!seesRampTop(viewer,head(token,viewerGround),p,z,gradient))continue;
     if(lighting&&!sight(p,z))continue;
     const q=window.terrainPrototype.project(ox+p.x*g,oy+p.y*g,z),tip={x:q.x+ux*g*.06,y:q.y+uy*g*.06};
     ctx.beginPath();ctx.moveTo(q.x-ux*g*.05,q.y-uy*g*.05);ctx.lineTo(tip.x,tip.y);ctx.moveTo(tip.x-ux*g*.045-uy*g*.04,tip.y-uy*g*.045+ux*g*.04);ctx.lineTo(tip.x,tip.y);ctx.lineTo(tip.x-ux*g*.045+uy*g*.04,tip.y-uy*g*.045-ux*g*.04);ctx.strokeStyle='#559e5f';ctx.lineWidth=g*.026;ctx.lineCap='round';ctx.stroke();
    }
   }
   ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='destination-out';ctx.drawImage(layer.mask,0,0);target.drawImage(art,layer.x,layer.y);
  }

 },hide(){canvas.hidden=true;}
};
