import {resolveVisionToken,isAlwaysVisibleAlly} from './vision-ownership.js';
import {preparePlayerVisibility,confirmPlayerHeightPaint,confirmPlayerNoHeightPaint} from './player-visibility-ready.js';
import {renderFog} from './fog-of-war.js';
import {sharedField,saveShared} from './environment-sync.mjs';
import {portalVisible} from './portal-visibility.mjs';
import {rampAt,rampHeight,rampPick,rampGround,rampSupports,rampLanding} from './imported-ramps.mjs';
import {seesRampTop} from './surface-facing.mjs';
import {gmVision} from './gm-vision.js';
import {onSurface} from './stacked-surfaces.mjs';
import {roofRenderer} from './roof-renderer.js';
import {createExploredFog} from './explored-fog.mjs';
import {compileTerrainVision} from './terrain-vision.mjs';
import {makeSight,center,head} from './vision-height.mjs';
import {groundShapeSteps,createJob,advance,finish,createSightQueue} from './sight-job.mjs';
// Height-aware sight paints from confirmed scene geometry and token state.
const transform=document.querySelector('#vtt-map-transform'),originalTokens=document.querySelector('#vtt-token-layer');
const canvas=document.createElement('canvas');canvas.id='vision-prototype';canvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:100000';transform.append(canvas);
const tokenView=document.createElement('div');tokenView.id='vision-token-view';tokenView.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:100002';tokenView.inert=true;transform.append(tokenView);
const style=document.createElement('style');style.textContent='.height-vision-active #vtt-token-layer{opacity:0!important}.height-vision-active .vtt-measure-overlay{z-index:100004}';document.head.append(style);
const exploration=createExploredFog();
const ctx=canvas.getContext('2d');let portalView=null;let signature='',paints=0,lastMs=0,observer=null,viewerTokenId=null,wallRevision=-1,walls=null,sight=null,tokenDirty=true,terrainCache=null,terrainKey='',terrainBuilds=0,groundChecks=0,visiblePolygons=0,tokenMarkup='';
new MutationObserver(()=>{tokenDirty=true;}).observe(originalTokens,{subtree:true,childList:true,attributes:true});
// The ground picture (black, what is remembered, what is lit from here) is worked out a few
// milliseconds a frame (sight-job.mjs), so a token that moves does not stop the board while its
// new view is found. Creatures, doors and floor plates do not wait: they are tested the moment
// the token arrives, as before. Only the lit ground follows.
//  - Only the newest place is worked out for the screen. A place already left is set aside.
//  - While the new picture is being found the old one stays, and only when it shows nothing the
//    finished picture would hide: the same viewer on the same scene, floor and walls, with what
//    was lit before already in that viewer's memory of the map (so it is ground the new picture
//    shows too, lit or remembered). In every other case the picture is found at once, as before.
//  - What was seen from a place passed through is still remembered: its picture is finished once
//    nothing is waiting for the screen, and added to memory without being shown as lit.
const GROUND_SLICE=10,GROUND_LEAST=3,MEMORY_SLICE=5;
const queue=createSightQueue({limit:32});
let wanted=null,shown=null,groundPainted='',roofPainted='',groundRuns=0,memoryCatchUps=0,lastGroundMs=0,lastGroundLagMs=0,lastGroundSlices=0,memoryGrew=false;
const groundStamp=()=>JSON.stringify([wanted?.mode==='lit'?shown?.key:wanted?.mode,exploration.revision,wanted?.remember,canvas.width,canvas.height]);
function paintGround(){
 ctx.globalCompositeOperation='source-over';
 if(wanted.mode==='unlit')ctx.clearRect(0,0,canvas.width,canvas.height);
 else{
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  // Shared edge crossings and a single fill prevent cracks between cells.
  if(wanted.mode==='lit'&&shown){exploration.paint(ctx,shown.path,wanted.remember,wanted.smoothing);shown.remembered=wanted.remember&&exploration.ready;}
 }
 groundPainted=groundStamp();memoryGrew=false;
}
function showGround(job){
 queue.clear();shown={key:job.key,family:job.family,path:job.path,remembered:false};
 groundChecks=job.result.checks;visiblePolygons=job.result.polygons;groundRuns++;lastGroundMs=job.spent;lastGroundSlices=job.slices;lastGroundLagMs=performance.now()-job.asked;
 paintGround();
}
const keptForMemory=job=>!!wanted&&wanted.mode==='lit'&&wanted.remember&&job.family===wanted.family;
function catchUpMemory(){
 const job=queue.passed[0];
 if(!wanted||wanted.mode!=='lit'||!wanted.remember||job.family!==wanted.family||!exploration.ready){queue.forget();return;}
 if(job.key===shown?.key){queue.passed.shift();return;}
 if(!advance(job,MEMORY_SLICE))return;
 queue.passed.shift();memoryCatchUps++;
 // The screen is drawn again from memory once, when the last of them is in.
 if(exploration.remember(job.path,wanted.smoothing))memoryGrew=true;
 if(memoryGrew&&!queue.passed.length)paintGround();
}
function tokenVisible(id){
 if(!document.documentElement.classList.contains('height-vision-active'))return true;
 const c=window.terrainContext?.(),p=c?.state.boardState.placements[c.state.boardState.activeSceneId]?.find(p=>p.id===id);
 if(!p)return false;if(gmVision.manual||!gmVision.fogEnabled)return true;
 return isAlwaysVisibleAlly(p)||Boolean(sight?.(center(p),head(p,window.terrainPrototype.groundFor(p)),p));
}
function tick(){
 if(document.hidden){requestAnimationFrame(tick);return;}
 const c=window.terrainContext?.(),wallApi=window.wallPrototype;
 if(c?.view.mapLoaded&&preparePlayerVisibility(c.state,{isGm:c.isGM,levelId:c.levelId}))renderFog(c.state);
 if(wallApi&&wallApi.revision!==wallRevision){wallRevision=wallApi.revision;walls=wallApi.model;}
 const enabled=!!(window.terrainPrototype?.active&&window.terrainPrototype?.field&&c?.view.mapLoaded&&(sharedField('walls')||sharedField('terrain')||(c.state.boardState.templates?.[c.state.boardState.activeSceneId]||[]).some(t=>t.type==='wall'))&&walls);
 const wallInspection=!!c?.isGM&&document.querySelector('#wall-panel')?.hidden===false;
 const editing=['#wall-panel','#terrain-panel'].some(id=>document.querySelector(id)?.hidden===false);
 canvas.hidden=tokenView.hidden=!enabled||editing;document.documentElement.classList.toggle('height-vision-active',enabled&&!editing);
 if(enabled){
  const placements=Object.values(c.state.boardState.placements[c.state.boardState.activeSceneId]||[]),v=c.view,terrain=window.terrainPrototype;
  const viewKey='last-owned-view:'+c.userId+':'+c.state.boardState.activeSceneId;
  let lastId=null;try{lastId=localStorage.getItem(viewKey);}catch{}
  const selectedToken=resolveVisionToken(placements,{...c,lastId});
  if(!c.isGM&&selectedToken&&selectedToken.id!==lastId)try{localStorage.setItem(viewKey,selectedToken.id);}catch{}
  const image=document.querySelector('#vtt-map-image');
  const token=(wallInspection||gmVision.manual||(!gmVision.fogEnabled&&!selectedToken))?{id:'map-inspection',levelId:c.levelId,column:(v.mapInsets.left-v.gridOffsets.left+image.naturalWidth/2)/v.gridSize-.5,row:(v.mapInsets.top-v.gridOffsets.top+image.naturalHeight/2)/v.gridSize-.5,width:1,height:1}:selectedToken;
  const viewerGround=(wallInspection||gmVision.manual)?gmVision.height:terrain.groundFor(token),inspectionHeight=wallInspection||c.isGM&&(gmVision.manual||!gmVision.lighting)?viewerGround:null;
  const nextTerrainKey=JSON.stringify([terrain.key,terrain.revision,v.gridSize,v.gridOffsets,v.mapInsets,image.naturalWidth,image.naturalHeight]);
  if(terrainKey!==nextTerrainKey){terrainKey=nextTerrainKey;terrainCache=compileTerrainVision(terrain.field,{left:((v.mapInsets.left||0)-(v.gridOffsets.left||0))/v.gridSize,top:((v.mapInsets.top||0)-(v.gridOffsets.top||0))/v.gridSize,width:image.naturalWidth/v.gridSize,height:image.naturalHeight/v.gridSize});terrainBuilds++;}
  const groundAt=terrainCache.heightAt;
  // Terrain edits change projection; avoid applying an old silhouette to changed geometry.
  if(terrainCache.explorationHash===undefined){let hash=2166136261;for(const h of terrain.field.h){hash=Math.imul(hash^Math.round(h*10000),16777619);}terrainCache.explorationHash=hash>>>0;}
  exploration.select(JSON.stringify([c.userId,c.state.boardState.activeSceneId,c.state.boardState.mapUrl,c.isGM?'stacked-view-v2':'player-view-v3',sharedField('exploration')?.value.resetId||'initial',c.isGM?token?.id:'personal',v.gridSize,v.gridOffsets,v.mapInsets,v.mapPixelSize,terrainCache.explorationHash,...(terrain.slant.y===.36?[]:['slant',terrain.slant.y])]),v.mapPixelSize.width,v.mapPixelSize.height);
  const next=JSON.stringify([c.state.boardState.activeSceneId,c.levelId,viewerGround,inspectionHeight,terrain.markersVisible,gmVision.manual,gmVision.lighting,gmVision.revision,exploration.revision,editing,token,placements.map(p=>[p.id,p.column,p.row,p.width,p.height,p.levelId,p.movementMode,p.visionOwners,p.team,p.combatTeam]),wallRevision,roofRenderer.revision,terrain.flightRevision,terrain.revision,v.mapPixelSize,v.mapInsets,v.gridOffsets,v.gridSize]);
  const changed=next!==signature,tickStart=performance.now();
  if(changed){
   signature=next;const start=performance.now();
   if(canvas.width!==v.mapPixelSize.width||canvas.height!==v.mapPixelSize.height){canvas.width=v.mapPixelSize.width;canvas.height=v.mapPixelSize.height;groundPainted='';}
   viewerTokenId=gmVision.manual?null:selectedToken?.id||null;observer=token?center(token):null;sight=!gmVision.fogEnabled?()=>true:token?makeSight({viewer:token,viewerGround,groundAt,walls,terrain:terrainCache}):null;
   if(sight)sight=gmVision.lighting&&!wallInspection?roofRenderer.blockSight(observer,head(token,viewerGround),sight,walls):()=>true;
   portalView={viewer:observer,ground:viewerGround,eye:token?head(token,viewerGround):0,sight};
   // What the ground picture is to be: `family` is everything but the viewer's own place, `key` the whole of it.
   const mode=!gmVision.lighting?'unlit':sight?'lit':'dark',remember=!editing&&!gmVision.manual;
   const family=JSON.stringify([c.state.boardState.activeSceneId,c.levelId,token?.id,token?.levelId,wallRevision,terrainKey,gmVision.fogEnabled,wallInspection,inspectionHeight,canvas.width,canvas.height,exploration.key]);
   const key=mode==='lit'?JSON.stringify([family,token?.column,token?.row,token?.width,token?.height,viewerGround]):mode;
   wanted={mode,key,family,remember,smoothing:v.gridSize*.10};
   if(mode!=='lit'){queue.setAside();queue.forget();shown=null;paintGround();}
   else if(shown?.key===key){queue.setAside(keptForMemory);if(groundPainted!==groundStamp())paintGround();}
   else if(queue.current?.key!==key){
    const image=document.querySelector('#vtt-map-image'),g=v.gridSize,ox=v.gridOffsets.left||0,oy=v.gridOffsets.top||0;
    const left=(v.mapInsets.left-ox)/g,top=(v.mapInsets.top-oy)/g,right=left+image.naturalWidth/g,bottom=top+image.naturalHeight/g;
    // One projector for the whole picture (terrain-prototype.js): the grid and slant are read once.
    const place=terrain.active?(terrain.projector?.()??terrain.project):null;
    const projected=(x,y)=>{const px=ox+x*g,py=oy+y*g;return place?place(px,py,groundAt(x,y)):{x:px,y:py};};
    const path=new Path2D(),seen=sight;
    // Consistent projected winding prevents overlapping parallax polygons from
    // subtracting from one another and leaving sharp black triangular slivers.
    const appendProjected=polygon=>{
     const points=[];polygon.forEach((p,i)=>{const end=polygon[(i+1)%polygon.length],steps=Math.max(1,Math.ceil(Math.hypot(end.x-p.x,end.y-p.y)*8));for(let k=0;k<steps;k++)points.push(projected(p.x+(end.x-p.x)*k/steps,p.y+(end.y-p.y)*k/steps));});
     if(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)<0)points.reverse();
     // Each piece is closed on a small path of its own and then added to the picture. Closing a
     // piece on the picture itself costs the browser more the longer the picture already is: with
     // some 2,800 pieces that was about 200 ms a picture, four fifths of the whole repaint. The
     // shape, and every pixel filled and stroked from it, is the same.
     const piece=new Path2D();points.forEach((p,i)=>i?piece.lineTo(p.x,p.y):piece.moveTo(p.x,p.y));piece.closePath();path.addPath(piece);
    };
    const visibleGround=(p,z=groundAt(p.x,p.y))=>seen(p,z);
    const job=queue.ask(createJob(key,groundShapeSteps({left,top,right,bottom,visible:visibleGround,walls,origin:observer,groundAt,emit:appendProjected}),{family,path,asked:start}),keptForMemory);
    // The old picture may stay up meanwhile only when it shows nothing this one would hide (see above).
    if(!(shown&&shown.family===family&&shown.remembered&&remember&&exploration.ready)){finish(job);showGround(job);}
   }
   // Floor plates are tested and drawn at once. They depend on the viewer and the map, not on where
   // other tokens stand, so another token's move does not draw them again.
   const roofKey=JSON.stringify([c.state.boardState.activeSceneId,c.levelId,viewerGround,inspectionHeight,terrain.markersVisible,gmVision.manual,gmVision.lighting,gmVision.fogEnabled,gmVision.revision,editing,wallInspection,token,wallRevision,roofRenderer.revision,terrain.flightRevision,terrain.revision,terrainKey,v.mapPixelSize,v.mapInsets,v.gridOffsets,v.gridSize]);
   if(roofKey!==roofPainted){roofPainted=roofKey;roofRenderer.paint({inspectionHeight,lighting:gmVision.lighting&&!wallInspection,context:c,viewer:observer,token,terrain:terrainCache,viewerGround,sight,groundAt,model:walls,editing:editing&&!wallInspection,enabled});}
   wallApi.refreshPortals?.();
   lastMs=performance.now()-start;paints++;
  }
  // A little more of the ground picture each frame; then, with nothing waiting for the screen, of
  // the pictures from places passed through, for memory only.
  if(queue.current){const job=queue.current;if(advance(job,Math.max(GROUND_LEAST,GROUND_SLICE-(performance.now()-tickStart))))showGround(job);}
  else if(queue.passed.length)catchUpMemory();
  // A player's map is uncovered only by a finished picture of where they are now.
  if(!queue.current)confirmPlayerHeightPaint(c.state,c.view,c.isGM,c.levelId);
  if(changed){for(const node of originalTokens.querySelectorAll('[data-placement-id]')){const next=tokenVisible(node.dataset.placementId)?'':'none';if(node.style.pointerEvents!==next)node.style.pointerEvents=next;}}
  if(changed||tokenDirty){
   tokenDirty=false;const markup=originalTokens.outerHTML;if(changed||markup!==tokenMarkup){tokenMarkup=markup;tokenView.replaceChildren();
   if(sight||placements.some(isAlwaysVisibleAlly)){const copy=originalTokens.cloneNode(true);copy.removeAttribute('id');copy.style.opacity='1';copy.inert=true;
    for(const node of copy.querySelectorAll('[data-placement-id]')){
     const p=placements.find(p=>p.id===node.dataset.placementId),pos=p&&center(p);
     if(!p||(!gmVision.manual&&!isAlwaysVisibleAlly(p)&&inspectionHeight!==null&&(terrain.groundFor(p)>inspectionHeight+.001||roofRenderer.surfaces(walls).some(s=>s.height<=inspectionHeight&&s.height>head(p,terrain.groundFor(p))&&onSurface(s,pos))))||(!isAlwaysVisibleAlly(p)&&p.id!==token?.id&&!sight?.(pos,head(p,terrain.groundFor(p)),p))){node.remove();continue;}
     node.dataset.visionPlacementId=node.dataset.placementId;delete node.dataset.placementId;
    }
    for(const node of copy.querySelectorAll('[id]'))node.removeAttribute('id');tokenView.append(copy);
   }
   }
  }
 }else{portalView=null;roofRenderer.hide();signature='';tokenMarkup='';sight=null;observer=null;tokenView.replaceChildren();queue.setAside();queue.forget();wanted=null;shown=null;groundPainted='';roofPainted='';
  if(c?.view.mapLoaded&&wallApi&&window.terrainPrototype&&!sharedField('terrain')&&!sharedField('walls')&&!(c.state.boardState.templates?.[c.state.boardState.activeSceneId]||[]).some(t=>t.type==='wall'))confirmPlayerNoHeightPaint(c.state,c.view,c.isGM,c.levelId);
 }
 requestAnimationFrame(tick);
}
window.visionPrototype={tokenVisible,portalVisible:geometry=>portalView?portalVisible({...geometry,...portalView}):false,async resetExplored(){const c=window.terrainContext?.();if(!c?.isGM)return;await saveShared('exploration',{resetId:crypto.randomUUID()},sharedField('exploration')?.revision||0);await exploration.resetScene(c.state.boardState.activeSceneId);},get viewerTokenId(){return viewerTokenId;},get observer(){return observer;},get stats(){return {paints,lastMs,terrainBuilds,groundChecks,visiblePolygons,cliffs:terrainCache?.cliffs.length||0,groundRuns,groundPending:!!queue.current,groundSetAside:queue.superseded,memoryWaiting:queue.passed.length,memoryCatchUps,lastGroundMs,lastGroundSlices,lastGroundLagMs};},visible:(point,z,token)=>sight?.(point,z,token)??false};
requestAnimationFrame(tick);
