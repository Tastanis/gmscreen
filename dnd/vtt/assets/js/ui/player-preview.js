import { BASE_MAP_LEVEL_ID, normalizeMapLevelsState, resolveActiveLevelIdForUser } from '../state/normalize/map-levels.js';
import {createPlayerPreviewMap} from './player-preview-map.js';

export function describePlayerPreview(preview) {
  const state = preview?.snapshot?.state ?? {};
  const sceneId = state.routing?.activeSceneId || null;
  const config = state.sceneConfig?.[sceneId] ?? {};
  const levels = normalizeMapLevelsState(config.mapLevels, {sceneGrid:config.grid});
  const levelId = resolveActiveLevelIdForUser({sceneState:config,userId:preview.userId,
    validLevelIds:[BASE_MAP_LEVEL_ID,...levels.levels.map(level=>level.id)]});
  const primaryId = config.pcTokenAssociations?.[preview.userId] ?? null;
  return {
    sceneId, levelId,
    floorName: levels.levels.find(level=>level.id===levelId)?.name || 'Level 0',
    following: config.userLevelState?.[preview.userId]?.followToken !== false,
    primary: primaryId ? state.placements?.[sceneId]?.[primaryId] ?? null : null,
    revision: preview.snapshot.revision,
  };
}

export function mountPlayerPreview(root, store) {
  if (!root) return;
  const select=root.querySelector('select'), refresh=root.querySelector('button');
  const status=root.querySelector('[data-preview-status]'), output=root.querySelector('[data-preview-details]');
  let sequence=0;
  let captured=null;
  const openMap=document.createElement('button');openMap.type='button';openMap.className='btn';
  openMap.textContent='View map and fog';openMap.disabled=true;root.append(openMap);
  const dialog=document.createElement('dialog');dialog.className='vtt-player-preview-dialog';
  const close=document.createElement('button');close.type='button';close.className='btn';close.textContent='Close preview';
  const heading=document.createElement('h2'),note=document.createElement('p'),surface=document.createElement('div');
  surface.className='vtt-player-preview-viewport';
  const controls=document.createElement('div');controls.className='vtt-player-preview-controls';
  const zoomOut=document.createElement('button'),zoomIn=document.createElement('button'),fit=document.createElement('button');
  for(const button of [zoomOut,zoomIn,fit]){button.type='button';button.className='btn';}
  zoomOut.textContent='−';zoomOut.setAttribute('aria-label','Zoom out preview');
  zoomIn.textContent='+';zoomIn.setAttribute('aria-label','Zoom in preview');fit.textContent='Fit preview';
  const zoomLabel=document.createElement('span');zoomLabel.setAttribute('aria-live','polite');
  controls.append(zoomOut,zoomLabel,zoomIn,fit);
  note.textContent='Read-only board preview. Auras, persistent zones and combat group colors are not included yet.';
  dialog.append(close,heading,note,controls,surface);document.body.append(dialog);
  let mapSequence=0;
  let camera=null;
  function updateZoomButtons(){for(const button of [zoomOut,zoomIn,fit])button.disabled=!camera;zoomLabel.textContent=camera?`${Math.round(camera.scale*100)}%`:'';}
  function setScale(scale,center=true) {
    if(!camera)return;
    const x=(surface.scrollLeft+surface.clientWidth/2)/camera.scale;
    const y=(surface.scrollTop+surface.clientHeight/2)/camera.scale;
    camera.scale=Math.max(0.01,Math.min(4,scale));
    camera.stage.style.transform=`scale(${camera.scale})`;
    camera.frame.style.width=camera.width*camera.scale+'px';camera.frame.style.height=camera.height*camera.scale+'px';
    if(center){surface.scrollLeft=x*camera.scale-surface.clientWidth/2;surface.scrollTop=y*camera.scale-surface.clientHeight/2;}
    else{surface.scrollLeft=0;surface.scrollTop=0;}
    updateZoomButtons();
  }
  const fitScale=()=>camera?Math.min(1,Math.max(100,window.innerWidth-80)/camera.width,Math.max(100,window.innerHeight-290)/camera.height):1;
  zoomOut.addEventListener('click',()=>camera&&setScale(camera.scale/1.5));
  zoomIn.addEventListener('click',()=>camera&&setScale(camera.scale*1.5));
  fit.addEventListener('click',()=>setScale(fitScale(),false));
  updateZoomButtons();
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{mapSequence++;camera=null;updateZoomButtons();surface.replaceChildren();});
  openMap.addEventListener('click',async()=>{
    if(!captured)return;
    const current=++mapSequence,preview=captured,view=describePlayerPreview(preview);
    heading.textContent=`${preview.userId}: ${view.floorName} · revision ${view.revision}`;
    camera=null;updateZoomButtons();surface.textContent='Loading map…';dialog.showModal();
    try {
      const {stage,width,height}=await createPlayerPreviewMap(preview,{levelId:view.levelId,tokens:store.getState?.().tokens});
      if(current!==mapSequence || !dialog.open)return;
      const frame=document.createElement('div');frame.style.overflow='hidden';frame.append(stage);surface.replaceChildren(frame);
      camera={stage,frame,width,height,scale:1};setScale(fitScale(),false);
    } catch(error){if(current===mapSequence)surface.textContent=error.message;}
  });
  async function request(url) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(!response.ok || !data.success) throw Error(data.error || 'Player preview could not be loaded.');
    return data;
  }
  async function load() {
    const current=++sequence; captured=null;openMap.disabled=true;output.replaceChildren();status.textContent='Loading player view…';
    try {
      const roster=await request('/dnd/vtt/api/v2/player-roster.php');
      if(current!==sequence)return;
      const selected=select.value;
      select.replaceChildren(...roster.players.map(id=>{const option=document.createElement('option');option.value=id;option.textContent=id;return option;}));
      if(roster.players.includes(selected))select.value=selected;
      if(!select.value){status.textContent='No players are configured.';return;}
      const {preview}=await request('/dnd/vtt/api/v2/player-preview.php?user='+encodeURIComponent(select.value));
      if(current!==sequence)return;
      const view=describePlayerPreview(preview);
      captured=preview;openMap.disabled=!view.sceneId;
      const scene=store.getState?.().scenes?.items?.find(scene=>scene.id===view.sceneId);
      const lines=view.sceneId ? [
        `Scene: ${scene?.name || view.sceneId}`,
        `Viewing: ${view.floorName} (${view.levelId})`,
        `Floor preference: ${view.following ? 'Follow token' : 'Browse'}`,
        `Primary token: ${view.primary ? (view.primary.name || view.primary.id) : 'Unavailable'}`,
      ] : ['The player map is closed.'];
      for(const line of lines){const p=document.createElement('p');p.textContent=line;output.append(p);}
      status.textContent=`${preview.userId} · revision ${view.revision} · captured ${new Date().toLocaleTimeString()}. Refresh to check again.`;
    } catch(error) {if(current===sequence)status.textContent=error.message;}
  }
  refresh.addEventListener('click',load);select.addEventListener('change',load);
  root.addEventListener('toggle',()=>{if(root.open)load();else{sequence++;captured=null;openMap.disabled=true;dialog.close();output.replaceChildren();status.textContent='';}});
}
