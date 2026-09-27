import {rampAt,rampHeight,rampPick,rampGround,rampSupports,rampLanding} from './imported-ramps.mjs';
import {tetherSupport} from './height-tethers.mjs';
import {roofSurfaces} from './roof-geometry.mjs';
const ns='http://www.w3.org/2000/svg',layer=document.createElementNS(ns,'svg');
layer.id='height-tethers';layer.setAttribute('aria-hidden','true');layer.style.cssText='position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:100003';
document.querySelector('#vtt-map-transform').append(layer);let signature='';
function tick(){
 const c=window.terrainContext?.(),terrain=window.terrainPrototype,lines=[];
 if(c&&terrain?.active){
  layer.setAttribute('width',c.view.mapPixelSize.width);layer.setAttribute('height',c.view.mapPixelSize.height);
  const v=c.view,g=v.gridSize,ox=v.gridOffsets.left||0,oy=v.gridOffsets.top||0;
  const vision=document.documentElement.classList.contains('height-vision-active');
  const root=document.querySelector(vision?'#vision-token-view':'#vtt-token-layer');
  const surfaces=roofSurfaces(window.wallPrototype?.model||{nodes:[],roofs:[]});
  for(const node of root?.querySelectorAll('[data-vision-placement-id],[data-placement-id],[data-vtt-drag-ghost]')||[]){
   if(node.hidden||node.style.display==='none')continue;
   const id=node.dataset.visionPlacementId||node.dataset.placementId||node.dataset.terrainSourceId;
   // A preview inherits its source identity; never expose a hidden creature.
   if(vision&&node.dataset.vttDragGhost&&!root.querySelector(`[data-vision-placement-id="${CSS.escape(id||'')}"]`))continue;
   const z=Number(node.dataset.terrainHeight);if(!Number.isFinite(z))continue;
   const matrix=new DOMMatrix(node.style.transform),x=matrix.m41+node.offsetWidth/2,y=matrix.m42+node.offsetHeight/2,p={x:(x-ox)/g,y:(y-oy)/g};
   const rampHeights=(window.wallPrototype?.model?.ramps||[]).map(r=>rampHeight(r,p.x,p.y)).filter(h=>h!==null&&h<=z+1e-6);
   const below=tetherSupport(p,z,terrain.heightAt(x,y),surfaces,rampHeights.length?Math.max(...rampHeights):null);
   if(below===null)continue;
   const a=terrain.project(x,y,below),b=terrain.project(x,y,z);lines.push([a.x,a.y,b.x,b.y,id]);
  }
 }
 const next=JSON.stringify(lines);if(next!==signature){signature=next;layer.replaceChildren(...lines.map(([x1,y1,x2,y2,id])=>{const line=document.createElementNS(ns,'line');line.setAttribute('data-tether-placement-id',id||'');for(const [k,v] of Object.entries({x1,y1,x2,y2,stroke:'#61d878','stroke-width':1.6,'stroke-opacity':1,'vector-effect':'non-scaling-stroke'}))line.setAttribute(k,v);return line;}));}
 requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
