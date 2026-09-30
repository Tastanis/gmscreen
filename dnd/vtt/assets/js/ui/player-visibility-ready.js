// Players stay covered until the ordinary and height-aware privacy masks exist.
let activeKey=null,fogReady=false,heightReady=false;
const pendingClass='vtt-player-visibility-pending';
function key(state,levelId='level-0'){return JSON.stringify([state?.boardState?.activeSceneId,state?.boardState?.mapUrl,levelId,heightRequired(state)]);}
function heightRequired(state){
 const scene=state?.boardState?.activeSceneId,entry=state?.boardState?.sceneState?.[scene];
 return Boolean(entry?.environment?.terrain||entry?.environment?.walls||(state?.boardState?.templates?.[scene]||[]).some(t=>t.type==='wall'));
}
function covered(value){
 if(typeof document==='undefined')return;
 document.documentElement.classList.toggle(pendingClass,value);
 const transform=document.getElementById('vtt-map-transform');if(transform)transform.inert=value;
}
export function beginPlayerVisibility(state,{isGm=false,levelId='level-0'}={}){
 if(isGm)return;
 activeKey=key(state,levelId);fogReady=heightReady=false;covered(true);
}
export function preparePlayerVisibility(state,{isGm=false,levelId='level-0'}={}){
 if(!isGm&&activeKey!==key(state,levelId)){beginPlayerVisibility(state,{levelId});return true;}
 return false;
}
function confirm(state,view,kind,isGm,levelId){
 if(isGm||!view?.mapLoaded||!(view.mapPixelSize?.width>0&&view.mapPixelSize?.height>0))return;
 if(activeKey!==key(state,levelId))return;
 if(kind==='fog')fogReady=true;else heightReady=true;
 if(fogReady&&heightReady)covered(false);
}
export function confirmPlayerFogPaint(state,view,isGm=false,levelId='level-0'){confirm(state,view,'fog',isGm,levelId);}
export function confirmPlayerHeightPaint(state,view,isGm=false,levelId='level-0'){confirm(state,view,'height',isGm,levelId);}
export function confirmPlayerNoHeightPaint(state,view,isGm=false,levelId='level-0'){
 if(!heightRequired(state))confirm(state,view,'height',isGm,levelId);
}
