import {floorElevations} from '../state/normalize/floor-elevation.js';
// GM inspection preferences stay local and never reveal player fog.
const state={height:0,revision:0};let scene=null,controls=null,selection=null,override=false,level=null;
function context(){
 const c=window.terrainContext?.();if(!c?.isGM)return c;
 const next=c.state.boardState.activeSceneId,key=JSON.stringify(c.selectedIds||[]);
 if(scene!==next){
  scene=next;level=c.levelId;selection=key;override=false;let saved={};
  try{saved=JSON.parse(localStorage.getItem('gm-inspection-height:'+scene)||'{}');}catch{}
  state.height=Number.isFinite(saved.height)?saved.height:floorHeight(c);state.revision++;
 }else{
  if(selection!==key){selection=key;override=false;state.revision++;}
  if(level!==c.levelId){level=c.levelId;state.height=floorHeight(c);override=false;state.revision++;}
 }
 return c;
}
function floorHeight(c){return floorElevations(c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId]?.mapLevels).get(c?.levelId)??0;}
function currentHeight(c){
 if(!override&&c?.selectedIds?.length===1){const p=c.state.boardState.placements[c.state.boardState.activeSceneId]?.find(p=>p.id===c.selectedIds[0]);if(p&&window.terrainPrototype)return window.terrainPrototype.groundFor(p);}
 return state.height;
}
function update(){const c=window.terrainContext?.();if(c?.isGM){
 context();gmVision.syncNavigation();
 const panel=document.querySelector('#vtt-fog-panel');if(panel&&!panel.querySelector('[data-gm-vision]')){
  controls=document.createElement('div');controls.dataset.gmVision='';controls.style.cssText='display:grid;gap:10px;padding:12px 0';
  controls.innerHTML='<button type="button" class="vtt-fog-panel__btn" data-reset-explored>Reset explored areas</button>';
  panel.querySelector('.vtt-fog-panel__header').after(controls);
  controls.querySelector('[data-reset-explored]').addEventListener('click',async e=>{
   if(!window.terrainContext?.().isGM||!window.visionPrototype)return;
   const button=e.currentTarget;button.disabled=true;
   try{await window.visionPrototype.resetExplored();}catch(error){console.error('Explored fog reset failed',error);window.alert('Could not reset explored areas. Please try again.');}finally{button.disabled=false;}
  });sync();
 }
}else if(controls){controls.remove();controls=null;}requestAnimationFrame(update);}
function sync(){}
export const gmVision={
 get lighting(){const c=context();return !c?.isGM||(!override&&c.selectedIds?.length===1);},
 get manual(){const c=context();return !!c?.isGM&&(override||c.selectedIds?.length!==1);},
 get height(){return currentHeight(context());},get revision(){context();return state.revision;},
 step(direction){const c=context();if(!c?.isGM)return;const height=currentHeight(c)+(direction==='down'?-1:1);if(!Number.isFinite(height))return;state.height=height;override=true;state.revision++;try{localStorage.setItem('gm-inspection-height:'+scene,JSON.stringify({height}));}catch{}this.syncNavigation();},
 // Show players remains an explicit canonical floor command. Intermediate heights
 // resolve to the supporting floor below; below all floors uses the lowest floor.
 get playerFloorId(){const c=context();if(!c?.isGM)return null;const floors=[...floorElevations(c.state.boardState.sceneState?.[scene]?.mapLevels)].sort((a,b)=>a[1]-b[1]);return floors.filter(([,h])=>h<=this.height).at(-1)?.[0]??floors[0]?.[0]??'level-0';},
 syncNavigation(){const c=context(),nav=document.querySelector('[data-map-level-nav]');if(!c?.isGM||!nav)return false;nav.hidden=false;nav.setAttribute('aria-hidden','false');const label=nav.querySelector('[data-map-level-nav-name]'),text=`Height ${Math.round(this.height*100)/100}`;if(label&&label.textContent!==text){label.textContent=text;label.title=text;}for(const button of nav.querySelectorAll('[data-action^="view-map-level-"]')){button.disabled=false;button.setAttribute('aria-disabled','false');}return true;}
};
window.gmVision=gmVision;requestAnimationFrame(update);
