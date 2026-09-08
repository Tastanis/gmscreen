import {normalizeMapLevelsState} from '../state/normalize/map-levels.js';
import {normalizePlacementForRender} from './token-render-normalize.js';
import {renderTokenAuras} from './token-aura-renderer.js';
import {syncTokenHitPoints} from './token-hit-points.js';
import {ensurePlacementConditions} from './token-conditions.js';
import {syncTokenTeamAffiliation,paintTokenMarkIndicator,paintTokenConditionLabel} from './token-status-presentation.js';
import {syncTriggeredActionIndicator} from './automation-trigger-ready.js';
import {createFogChecker} from './fog-of-war.js';
import {getDefaultTokenStackOrderMap,getPlacementStackOrder} from './token-stack-order.js';
import {resolveVisibleTokenPresentation,getTokenRenderStackOrder,buildTokenLevelTransform,applyTokenLevelPresentation,normalizeTokenRenderGeometry} from './token-presentation.js';

export function renderPlayerPreviewTokens(stage,state,view,levelId) {
  const sceneId=state.boardState.activeSceneId;
  const placements=state.boardState.placements[sceneId] ?? [];
  const config=state.boardState.sceneState[sceneId] ?? {};
  const levels=normalizeMapLevelsState(config.mapLevels,{sceneGrid:config.grid});
  const isCellFogged=createFogChecker(state,levelId,{gmViewing:false});
  const stack=getDefaultTokenStackOrderMap(placements);
  const layer=document.createElement('div');layer.className='vtt-board__tokens';
  for(const [index,raw] of placements.entries()) {
    const normalized=normalizePlacementForRender(raw);
    if(!normalized)continue;
    const placement={...raw,...normalized};
    const presentation=resolveVisibleTokenPresentation(placement,levels,{viewerLevelId:levelId,isCellFogged});
    if(!presentation)continue;
    const token=document.createElement('div');token.className='vtt-token';
    token.dataset.previewPlacementId=placement.id;token.dataset.mapLevelId=presentation.levelId;
    token.title=placement.name || 'Token';
    token.style.width=placement.width*view.gridSize+'px';token.style.height=placement.height*view.gridSize+'px';
    token.style.transform=buildTokenLevelTransform(view.gridOffsets.left+placement.column*view.gridSize,
      view.gridOffsets.top+placement.row*view.gridSize,presentation.scale);
    token.style.transformOrigin='50% 50%';
    token.style.zIndex=String(getTokenRenderStackOrder(getPlacementStackOrder(raw,stack.get(raw.id) ?? index),presentation.levelId,levels));
    applyTokenLevelPresentation(token,presentation);
    if(placement.imageUrl) {
      const image=document.createElement('img');image.className='vtt-token__image';image.alt=placement.name || 'Token';
      image.draggable=false;image.src=placement.imageUrl;token.append(image);
    } else token.classList.add('vtt-token--placeholder');
    syncTokenHitPoints(token,placement,{isGm:false});
    syncTokenTeamAffiliation(token,placement);
    paintTokenConditionLabel(token,ensurePlacementConditions(placement.conditions ?? placement.condition ?? null));
    const judgment=placement.marks?.judgment;
    paintTokenMarkIndicator(token,judgment && typeof judgment==='object' ? judgment : null);
    syncTriggeredActionIndicator(token,placement);
    const ready=token.querySelector('.vtt-token__trigger-ready');
    if(ready){ready.removeAttribute('data-token-trigger-ready');ready.title='Trigger condition met.';ready.setAttribute('aria-label',ready.title);}
    layer.append(token);
  }
  stage.append(layer);
  const auraLayer=document.createElement('div');auraLayer.className='vtt-board__auras';
  renderTokenAuras({placements,layer:auraLayer,view,tokenLevelState:levels,auraViewerLevelId:levelId,isCellFogged,passive:true});
  stage.append(auraLayer);
  return layer;
}
