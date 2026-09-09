import {getOrderedTokenMapLevels, getTokenLevelPresentation} from './token-levels.js';
const TOKEN_LEVEL_STACK_STRIDE = 10000;

export function normalizeTokenRenderGeometry(placement = {}) {
  const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  return {column:number(placement.column ?? placement.col ?? 0),row:number(placement.row ?? placement.y ?? 0),
    width:Math.max(1,number(placement.width ?? placement.columns ?? 1)),height:Math.max(1,number(placement.height ?? placement.rows ?? 1))};
}

export function resolveVisibleTokenPresentation(placement, levels, {viewerLevelId, gmViewing=false, isCellFogged=null} = {}) {
  if (!placement || (placement.hidden && !gmViewing)) return null;
  const presentation=getTokenLevelPresentation(placement,levels,{viewerLevelId,gmViewing,mode:'vision'});
  if (!presentation.visible) return null;
  if (!gmViewing && isCellFogged) {
    let revealed=false;
    for(let dx=0;dx<placement.width && !revealed;dx++) {
      for(let dy=0;dy<placement.height && !revealed;dy++) {
        if(!isCellFogged(placement.column+dx,placement.row+dy))revealed=true;
      }
    }
    if(!revealed)return null;
  }
  return presentation;
}

export function getTokenRenderStackOrder(stackOrder, levelId, mapLevelsState = null) {
  const normalizedStackOrder = Number.isFinite(stackOrder) ? Math.max(0, Math.trunc(stackOrder)) : 0;
  const levels = getOrderedTokenMapLevels(mapLevelsState?.levels ?? []);
  if (!levels.length || !levelId) {
    return normalizedStackOrder;
  }

  const levelIndex = levels.findIndex((level) => level?.id === levelId);
  if (levelIndex < 0) {
    return normalizedStackOrder;
  }

  return levelIndex * TOKEN_LEVEL_STACK_STRIDE + normalizedStackOrder;
}

// Levels v2 §5.5: build the token transform string with the per-level
// scale baked in. Drag math reads scale from `dragElements` so the
// translate3d update preserves the cross-level shrink while the user
// drags. `transform-origin: 50% 50%` keeps the scaled token centered on
// its grid cell so hit testing matches.
export function buildTokenLevelTransform(left, top, scale) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (safeScale === 1) {
    return `translate3d(${left}px, ${top}px, 0)`;
  }
  return `translate3d(${left}px, ${top}px, 0) scale(${safeScale})`;
}

// Levels v2 §5.5.2/§5.5.3: paint the level direction badge — green
// down-arrow + distance for tokens below the viewer, red up-arrow +
// distance for tokens above. Same-level tokens carry no badge. The badge
// sits inside the token element so it inherits the parent transform
// (including scale), but `vector-effect`-style sizing is handled in CSS
// via the `--vtt-token-level-distance` custom property.
export function applyTokenLevelPresentation(token, presentation) {
  if (!token) {
    return;
  }
  const direction = presentation?.direction ?? 'same';
  if (direction === 'same' || !presentation?.indicator) {
    delete token.dataset.mapLevelDirection;
    delete token.dataset.mapLevelDistance;
    const existing = token.querySelector('.vtt-token__level-indicator');
    if (existing) {
      existing.remove();
    }
    return;
  }

  const distance = Math.max(
    1,
    Math.trunc(Number.isFinite(presentation.distance) ? presentation.distance : 1),
  );
  token.dataset.mapLevelDirection = direction;
  token.dataset.mapLevelDistance = String(distance);

  let indicator = token.querySelector('.vtt-token__level-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'vtt-token__level-indicator';
    const arrow = document.createElement('span');
    arrow.className = 'vtt-token__level-indicator-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    indicator.appendChild(arrow);
    const distanceLabel = document.createElement('span');
    distanceLabel.className = 'vtt-token__level-indicator-distance';
    indicator.appendChild(distanceLabel);
    token.appendChild(indicator);
  }
  indicator.dataset.direction = direction;
  indicator.title = `${distance} square${distance === 1 ? '' : 's'} ${direction} your viewed floor`;
  indicator.setAttribute('aria-label', indicator.title);
  const distanceLabel = indicator.querySelector('.vtt-token__level-indicator-distance');
  if (distanceLabel) {
    distanceLabel.textContent = String(distance);
  }
  const arrow = indicator.querySelector('.vtt-token__level-indicator-arrow');
  if (arrow) {
    arrow.textContent = direction === 'above' ? '\u25B2' : '\u25BC';
  }
}

