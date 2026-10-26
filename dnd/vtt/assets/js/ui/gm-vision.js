import {floorElevations} from '../state/normalize/floor-elevation.js';
import {groundSquare,stepViewHeight} from './terrain-math.mjs';
import {openingHeight} from './opening-height.mjs';
// Inspection height stays local; automatic fog is a canonical GM scene setting.
const state={height:0,revision:0};
// A player's own raised view: the height their page is drawn up to, or null for the usual view. Local to
// the page. It changes what is drawn (floors above, dark, with the lip the hero can see), never what is seen.
let raised=null,raisedFor=null;let scene=null,controls=null,selection=null,override=false,level=null,automatic=null,togglePending=false;
// The scene opened at its default height (opening-height.mjs) before its ground heights had arrived: it is worked out
// again once they have, unless the Director has stepped the height meanwhile.
let opening=false;
function fogEnabled(c){return c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId]?.fogOfWar?.automaticEnabled !== false;}
function context(){
 const c=window.terrainContext?.();
 const signature=JSON.stringify([c?.state.boardState.activeSceneId,fogEnabled(c)]);
 if(signature!==automatic){automatic=signature;state.revision++;}
 if(!c?.isGM){if(c&&scene!==c.state.boardState.activeSceneId){scene=c.state.boardState.activeSceneId;raised=null;state.revision++;}return c;}
 const next=c.state.boardState.activeSceneId,key=JSON.stringify(c.selectedIds||[]);
 if(scene!==next){
  scene=next;level=c.levelId;selection=key;override=false;let saved={};
  try{saved=JSON.parse(localStorage.getItem('gm-inspection-height:'+scene)||'{}');}catch{}
  // His own last height on this scene; else where the scene should open (never a basement under its main floor).
  opening=false;
  if(Number.isFinite(saved.height))state.height=saved.height;
  else{state.height=openingFor(c);opening=!sceneEntry(c)?.environment?.terrain?.value;}
  state.revision++;
 }else{
  if(selection!==key){selection=key;override=false;state.revision++;}
  if(level!==c.levelId){level=c.levelId;state.height=floorHeight(c);override=false;opening=false;state.revision++;}
  else if(opening&&!override&&sceneEntry(c)?.environment?.terrain?.value){opening=false;state.height=openingFor(c);state.revision++;}
 }
 return c;
}
function sceneEntry(c){return c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId];}
function floorHeight(c){return floorElevations(sceneEntry(c)?.mapLevels).get(c?.levelId)??0;}
function openingFor(c){const s=sceneEntry(c);return openingHeight({mapLevels:s?.mapLevels,levelId:c?.levelId,terrain:s?.environment?.terrain?.value});}
function currentHeight(c){
 if(!override&&c?.selectedIds?.length===1){const p=c.state.boardState.placements[c.state.boardState.activeSceneId]?.find(p=>p.id===c.selectedIds[0]);if(p&&window.terrainPrototype)return window.terrainPrototype.groundFor(p);}
 return state.height;
}
function update(){const c=window.terrainContext?.();if(c?.isGM){
 context();gmVision.syncNavigation();
 const panel=document.querySelector('#vtt-fog-panel');if(panel&&!panel.querySelector('[data-gm-vision]')){
  controls=document.createElement('div');controls.dataset.gmVision='';controls.style.cssText='display:grid;gap:10px;padding:12px 0';
  controls.innerHTML='<label><input type="checkbox" data-automatic-fog> Automatic fog</label><button type="button" class="vtt-fog-panel__btn" data-reset-explored>Reset explored areas</button>';
  panel.querySelector('.vtt-fog-panel__header').after(controls);
  controls.querySelector('[data-automatic-fog]').addEventListener('change',async e=>{
   const current=window.terrainContext?.();if(!current?.isGM){sync();return;}
   const input=e.currentTarget,enabled=input.checked,sceneId=current.state.boardState.activeSceneId;
   input.checked=fogEnabled(current);
   if(togglePending||!sceneId)return;
   togglePending=true;sync();
   const fogOfWar=structuredClone(current.state.boardState.sceneState?.[sceneId]?.fogOfWar||{});
   fogOfWar.automaticEnabled=enabled;
   try{
    if(typeof window.submitEnvironmentCommand!=='function')throw Error('Board commands unavailable');
    const results=await window.submitEnvironmentCommand({type:'fog.set',sceneId,payload:{fogOfWar}});
    if(!Array.isArray(results)||results.length!==1)throw Error('Fog change was not accepted');
   }catch(error){console.error('Automatic fog change failed',error);window.alert('Could not change automatic fog. Please try again.');}
   finally{togglePending=false;sync();}
  });
  controls.querySelector('[data-reset-explored]').addEventListener('click',async e=>{
   if(!window.terrainContext?.().isGM||!window.visionPrototype)return;
   const button=e.currentTarget;button.disabled=true;
   try{await window.visionPrototype.resetExplored();}catch(error){console.error('Explored fog reset failed',error);window.alert('Could not reset explored areas. Please try again.');}finally{button.disabled=false;}
  });sync();
 }
 sync();
}else{if(controls){controls.remove();controls=null;}if(c)gmVision.syncNavigation();}requestAnimationFrame(update);}
function sync(){const input=controls?.querySelector('[data-automatic-fog]');if(input){input.checked=fogEnabled(window.terrainContext?.());input.disabled=togglePending;}}
export const gmVision={
 get fogEnabled(){return fogEnabled(context());},
 get lighting(){const c=context();return fogEnabled(c)&&(!c?.isGM||(!override&&c.selectedIds?.length===1));},
 get manual(){const c=context();return !!c?.isGM&&(override||c.selectedIds?.length!==1);},
 get height(){return currentHeight(context());},get revision(){context();return state.revision;},
 // The height a player's hero stands at, and that hero's id, or null when they have none on this scene.
 get playerStanding(){const c=context();if(!c||c.isGM)return null;const id=window.visionPrototype?.viewerTokenId||c.followId,p=id&&c.state.boardState.placements[c.state.boardState.activeSceneId]?.find(p=>p.id===id);return p&&window.terrainPrototype?{id:p.id,height:window.terrainPrototype.groundFor(p)}:null;},
 /** A player's raised view height, or null. It lapses when the hero changes, the scene changes, or the hero climbs to it. */
 get raised(){const own=this.playerStanding;if(!own){return null;}const key=scene+'|'+own.id;if(raised!==null&&(raisedFor!==key||raised<=groundSquare(own.height))){raised=null;state.revision++;}return raised;},
 step(direction){const c=context();if(c&&!c.isGM){const own=this.playerStanding;if(!own)return;const from=this.raised??own.height,next=stepViewHeight(from,direction);raised=next>groundSquare(own.height)?next:null;raisedFor=scene+'|'+own.id;state.revision++;this.syncNavigation();return;}if(!c?.isGM)return;const height=stepViewHeight(currentHeight(c),direction);if(!Number.isFinite(height))return;state.height=height;override=true;opening=false;state.revision++;try{localStorage.setItem('gm-inspection-height:'+scene,JSON.stringify({height}));}catch{}this.syncNavigation();},
 // Show players remains an explicit canonical floor command. Intermediate heights
 // resolve to the supporting floor below; below all floors uses the lowest floor.
 get playerFloorId(){const c=context();if(!c?.isGM)return null;const floors=[...floorElevations(c.state.boardState.sceneState?.[scene]?.mapLevels)].sort((a,b)=>a[1]-b[1]);return floors.filter(([,h])=>h<=this.height).at(-1)?.[0]??floors[0]?.[0]??'level-0';},
 syncNavigation(){const c=context(),nav=document.querySelector('[data-map-level-nav]');
  if(c&&!c.isGM&&nav){
   // A player: the arrows are there whenever they have a hero on the scene. The label says how high the page is drawn.
   const own=this.playerStanding,up=this.raised;nav.hidden=!own;nav.setAttribute('aria-hidden',own?'false':'true');if(!own)return true;
   const label=nav.querySelector('[data-map-level-nav-name]'),heroH=Number.isFinite(Number(own.height))?Math.round(Number(own.height)*10)/10:null,text=up===null?(heroH===null?'Your height':`Height ${heroH} · you`):`Height ${up}`;if(label&&label.textContent!==text){label.textContent=text;label.title=up===null?'Drawn as your hero sees it':'Drawn up to height '+up+'. What your hero can see does not change.';}
   for(const button of nav.querySelectorAll('[data-action^="view-map-level-"]')){const off=button.dataset.action==='view-map-level-down'&&up===null;button.disabled=off;button.setAttribute('aria-disabled',off?'true':'false');}
   return true;
  }
  if(!c?.isGM||!nav)return false;nav.hidden=false;nav.setAttribute('aria-hidden','false');const label=nav.querySelector('[data-map-level-nav-name]'),text=`Height ${groundSquare(this.height)}`;if(label&&label.textContent!==text){label.textContent=text;label.title=text;}for(const button of nav.querySelectorAll('[data-action^="view-map-level-"]')){button.disabled=false;button.setAttribute('aria-disabled','false');}return true;}
};
window.gmVision=gmVision;requestAnimationFrame(update);
