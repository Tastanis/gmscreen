import {normalizeMapLevelsState} from '../state/normalize/map-levels.js';
import {normalizePlacementForRender} from './token-render-normalize.js';
import {syncTokenHitPoints} from './token-hit-points.js';
import {ensurePlacementConditions} from './token-conditions.js';
import {syncTokenTeamAffiliation,paintTokenMarkIndicator,paintTokenConditionLabel} from './token-status-presentation.js';
import {syncTriggeredActionIndicator} from './automation-trigger-ready.js';
import {getDefaultTokenStackOrderMap,getPlacementStackOrder} from './token-stack-order.js';
import {applyCombatGroupsToState,getCombatGroupColorAssignments,getRepresentativeIdForCombatant} from '../combat/combat-groups.js';
import {canPlayerMovePlacement,resolveVisibleTokenPresentation,getTokenRenderStackOrder,applyTokenLevelPresentation} from './token-presentation.js';

export function renderPlayerPreviewTokens(stage,state,view,levelId) {
  const sceneId=state.boardState.activeSceneId;
  const placements=state.boardState.placements[sceneId] ?? [];
  const config=state.boardState.sceneState[sceneId] ?? {};
  const levels=normalizeMapLevelsState(config.mapLevels,{sceneGrid:config.grid});
  const stack=getDefaultTokenStackOrderMap(placements);
  const groupState={groups:new Map(),representatives:new Map(),missingCounts:new Map()};
  const combat=config.combat ?? {};
  applyCombatGroupsToState(groupState,combat.groups ?? combat.groupings ?? combat.combatGroups ?? combat.combatantGroups);
  const groupColors=getCombatGroupColorAssignments(groupState.groups);
  const layer=document.createElement('div');layer.className='vtt-board__tokens';
  for(const [index,raw] of placements.entries()) {
    const normalized=normalizePlacementForRender(raw);
    if(!normalized || normalized.hidden || raw.flags?.hidden)continue;
    const conditions = ensurePlacementConditions(raw.conditions ?? raw.condition ?? null);
    if (!canPlayerMovePlacement(raw) && conditions.some(c => c.name?.trim().toLowerCase() === 'invisible')) continue;
    const placement={...raw,...normalized};
    const presentation=resolveVisibleTokenPresentation(placement,levels,{viewerLevelId:levelId,gmViewing:true});
    if(!presentation)continue;
    const token=document.createElement('div');token.className='vtt-token';
    token.dataset.previewPlacementId=placement.id;token.dataset.mapLevelId=presentation.levelId;
    const groupColor=groupColors.get(getRepresentativeIdForCombatant(placement.id,groupState.representatives));
    if(groupColor)token.dataset.groupColor=String(groupColor);
    token.title=placement.name || 'Token';
    token.style.width=placement.width*view.gridSize+'px';token.style.height=placement.height*view.gridSize+'px';
    token.style.zIndex=String(getTokenRenderStackOrder(getPlacementStackOrder(raw,stack.get(raw.id) ?? index),presentation.levelId,levels));
    applyTokenLevelPresentation(token,presentation);
    if(placement.imageUrl) {
      const image=document.createElement('img');image.className='vtt-token__image';image.alt=placement.name || 'Token';
      image.draggable=false;image.src=placement.imageUrl;token.append(image);
    } else token.classList.add('vtt-token--placeholder');
    syncTokenHitPoints(token,placement,{isGm:false});
    syncTokenTeamAffiliation(token,placement);
    paintTokenConditionLabel(token,conditions);
    const judgment=placement.marks?.judgment;
    paintTokenMarkIndicator(token,judgment && typeof judgment==='object' ? judgment : null);
    syncTriggeredActionIndicator(token,placement);
    const ready=token.querySelector('.vtt-token__trigger-ready');
    if(ready){ready.removeAttribute('data-token-trigger-ready');ready.title='Trigger condition met.';ready.setAttribute('aria-label',ready.title);}
    layer.append(token);
  }
  stage.append(layer);
  return layer;
}
