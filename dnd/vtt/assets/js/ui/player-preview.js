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
  note.textContent='Read-only map, floors, fog and tokens. Token status overlays, drawings and templates are not included yet.';
  dialog.append(close,heading,note,surface);document.body.append(dialog);
  let mapSequence=0;
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{mapSequence++;surface.replaceChildren();});
  openMap.addEventListener('click',async()=>{
    if(!captured)return;
    const current=++mapSequence,preview=captured,view=describePlayerPreview(preview);
    heading.textContent=`${preview.userId}: ${view.floorName} · revision ${view.revision}`;
    surface.textContent='Loading map…';dialog.showModal();
    try {
      const {stage,width,height}=await createPlayerPreviewMap(preview,{levelId:view.levelId,tokens:store.getState?.().tokens});
      if(current!==mapSequence || !dialog.open)return;
      const scale=Math.min(1,(window.innerWidth-80)/width,(window.innerHeight-210)/height);
      const frame=document.createElement('div');frame.style.width=width*scale+'px';frame.style.height=height*scale+'px';
      stage.style.transform=`scale(${scale})`;frame.append(stage);surface.replaceChildren(frame);
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
