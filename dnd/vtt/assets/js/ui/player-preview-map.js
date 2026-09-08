import {normalizeGridState} from '../state/normalize/grid.js';
import {normalizePlacements} from '../state/normalize/placements.js';
import {restrictTokensToPlayerView} from '../state/store.js';
import {createMapLevelRenderer} from './map-level-renderer.js';
import {renderFogSurface} from './fog-of-war.js';

export function buildPlayerPreviewState(preview, tokens) {
  const canonical=preview.snapshot.state,sceneId=canonical.routing?.activeSceneId;
  return {tokens:restrictTokensToPlayerView(tokens ?? {items:[],folders:[]}),boardState:{
    activeSceneId:sceneId,sceneState:{[sceneId]:canonical.sceneConfig?.[sceneId] ?? {}},
    placements:normalizePlacements({[sceneId]:Object.values(canonical.placements?.[sceneId] ?? {})}),
  }};
}

/** A detached, passive map/fog surface. No store subscription or board handlers. */
export async function createPlayerPreviewMap(preview, {levelId, tokens} = {}) {
  const canonical=preview.snapshot.state, sceneId=canonical.routing?.activeSceneId;
  const url=canonical.routing?.mapUrl;
  if(!sceneId || !url) throw Error('The player map is closed.');
  const image=document.createElement('img');
  image.alt='Player map';image.draggable=false;
  await new Promise((resolve,reject)=>{
    image.onload=resolve;image.onerror=()=>reject(Error('The player map image could not be loaded.'));
    image.src=url;
  });
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width || !height)throw Error('The player map has no usable dimensions.');
  const config=canonical.sceneConfig?.[sceneId] ?? {};
  const grid=normalizeGridState(config.grid);
  const view={mapPixelSize:{width,height},gridSize:grid.size,
    gridOrigin:{x:grid.offsetX,y:grid.offsetY},
    mapInsets:{top:0,right:0,bottom:0,left:0},
    gridOffsets:{top:grid.offsetY,left:grid.offsetX,right:0,bottom:0}};
  const stage=document.createElement('div');stage.className='vtt-player-preview-map';
  stage.style.width=width+'px';stage.style.height=height+'px';stage.append(image);
  const levels=createMapLevelRenderer({mapTransform:stage,rootId:null});
  levels.sync(config.mapLevels,{sceneGrid:grid,view,activeLevelId:levelId});
  const gridLayer=document.createElement('div');gridLayer.className='vtt-board__grid';
  gridLayer.classList.toggle('is-visible',grid.visible);
  gridLayer.style.setProperty('--vtt-grid-size',grid.size+'px');
  gridLayer.style.setProperty('--vtt-grid-origin-x',grid.offsetX+'px');
  gridLayer.style.setProperty('--vtt-grid-origin-y',grid.offsetY+'px');stage.append(gridLayer);
  const fog=document.createElement('canvas');fog.className='vtt-player-preview-map__fog';stage.append(fog);
  const state=buildPlayerPreviewState(preview,tokens);
  renderFogSurface({state,canvas:fog,view,sceneId,levelId,gmViewing:false});
  return {stage,width,height};
}
