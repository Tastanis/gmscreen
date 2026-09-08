import { BASE_MAP_LEVEL_ID, normalizeMapLevelsState, resolveActiveLevelIdForUser } from '../state/normalize/map-levels.js';

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
  async function request(url) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(!response.ok || !data.success) throw Error(data.error || 'Player preview could not be loaded.');
    return data;
  }
  async function load() {
    const current=++sequence; output.replaceChildren();status.textContent='Loading player view…';
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
  root.addEventListener('toggle',()=>{if(root.open)load();else{sequence++;output.replaceChildren();status.textContent='';}});
}
