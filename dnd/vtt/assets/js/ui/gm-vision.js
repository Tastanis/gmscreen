import {floorElevations} from '../state/normalize/floor-elevation.js';
// GM inspection preferences stay local and never reveal player fog.
const state={lighting:true,follow:true,height:0,revision:0};let scene=null,controls=null;
function update(){const c=window.terrainContext?.();if(c?.isGM){
 const next=c.state.boardState.activeSceneId;if(scene!==next){scene=next;let saved={};try{saved=JSON.parse(localStorage.getItem('gm-vision:'+scene)||'{}');}catch{}Object.assign(state,{lighting:saved.lighting!==false,follow:saved.follow!==false,height:Number.isFinite(saved.height)?saved.height:0});state.revision++;sync();}
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
export const gmVision={get lighting(){const c=window.terrainContext?.();return !c?.isGM||c.selectedIds?.length===1;},get manual(){const c=window.terrainContext?.();return !!c?.isGM&&c.selectedIds?.length!==1;},get height(){const c=window.terrainContext?.();return c?.selectedIds?.length!==1?(floorElevations(c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId]?.mapLevels).get(c?.levelId)||0):state.height;},get revision(){return state.revision;}};
window.gmVision=gmVision;requestAnimationFrame(update);
