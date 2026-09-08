import {normalizeGridState} from '../state/normalize/grid.js';
import {restrictTokensToPlayerView} from '../state/store.js';
import {createMapLevelRenderer} from './map-level-renderer.js';
import {renderFogSurface} from './fog-of-war.js';
import {renderPlayerPreviewTokens} from './player-preview-tokens.js';
import {renderDrawings} from './drawing-tool.js';
import {renderPlayerPreviewTemplates} from './player-preview-templates.js';

export function buildPlayerPreviewState(preview, tokens) {
  const canonical=preview.snapshot.state,sceneId=canonical.routing?.activeSceneId;
  return {tokens:restrictTokensToPlayerView(tokens ?? {items:[],folders:[]}),boardState:{
    activeSceneId:sceneId,sceneState:{[sceneId]:canonical.sceneConfig?.[sceneId] ?? {}},
    placements:{[sceneId]:Object.values(canonical.placements?.[sceneId] ?? {})},
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
  if(!image.naturalWidth || !image.naturalHeight)throw Error('The player map has no usable dimensions.');
  const backdrop=document.createElement('div');backdrop.className='vtt-board__map-backdrop';
  backdrop.style.visibility='hidden';document.body.append(backdrop);
  const style=getComputedStyle(backdrop);
  const insets=Object.fromEntries(['top','right','bottom','left'].map(side=>[side,parseFloat(style.getPropertyValue('padding-'+side))||0]));
  backdrop.remove();backdrop.style.visibility='';
  const width=image.naturalWidth+insets.left+insets.right,height=image.naturalHeight+insets.top+insets.bottom;
  const config=canonical.sceneConfig?.[sceneId] ?? {};
  const grid=normalizeGridState(config.grid);
  const view={mapLoaded:true,mapPixelSize:{width,height},gridSize:grid.size,
    gridOrigin:{x:grid.offsetX,y:grid.offsetY},
    mapInsets:insets,
    gridOffsets:{top:insets.top+grid.offsetY,left:insets.left+grid.offsetX,right:insets.right,bottom:insets.bottom}};
  const stage=document.createElement('div');stage.className='vtt-player-preview-map';
  stage.inert=true;
  stage.style.width=width+'px';stage.style.height=height+'px';image.className='vtt-board__map-image';
  backdrop.append(image);stage.append(backdrop);
  const levels=createMapLevelRenderer({mapTransform:stage,rootId:null});
  for(const [side,value] of Object.entries(insets))levels.element.style.setProperty('--vtt-grid-offset-'+side,value+'px');
  levels.sync(config.mapLevels,{sceneGrid:grid,view,activeLevelId:levelId});
  const gridLayer=document.createElement('div');gridLayer.className='vtt-board__grid';
  gridLayer.classList.toggle('is-visible',grid.visible);
  gridLayer.style.setProperty('--vtt-grid-size',grid.size+'px');
  gridLayer.style.setProperty('--vtt-grid-origin-x',grid.offsetX+'px');
  gridLayer.style.setProperty('--vtt-grid-origin-y',grid.offsetY+'px');stage.append(gridLayer);
  for(const [side,value] of Object.entries(insets))gridLayer.style.setProperty('--vtt-grid-offset-'+side,value+'px');
  const fog=document.createElement('canvas');fog.className='vtt-player-preview-map__fog';stage.append(fog);
  const state=buildPlayerPreviewState(preview,tokens);
  renderFogSurface({state,canvas:fog,view,sceneId,levelId,gmViewing:false});
  const drawings=document.createElementNS('http://www.w3.org/2000/svg','svg');
  drawings.classList.add('vtt-board__drawings');drawings.setAttribute('aria-hidden','true');
  drawings.setAttribute('width',String(width));drawings.setAttribute('height',String(height));
  drawings.setAttribute('viewBox',`0 0 ${width} ${height}`);
  renderDrawings({drawingLayer:drawings,drawings:Object.values(canonical.drawings?.[sceneId] ?? {}),levelId});
  for(const path of drawings.querySelectorAll('[data-drawing-id]')) {
    path.dataset.previewDrawingId=path.dataset.drawingId;delete path.dataset.drawingId;
  }
  stage.append(drawings);
  renderPlayerPreviewTokens(stage,state,view,levelId);
  renderPlayerPreviewTemplates(stage,preview,view,levelId);
  return {stage,width,height};
}
