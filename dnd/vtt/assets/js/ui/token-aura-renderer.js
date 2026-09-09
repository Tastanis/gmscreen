import {verticalFloorDistance} from '../state/normalize/floor-elevation.js';
import {normalizePlacementForRender} from './token-render-normalize.js';
import {getRenderableAurasForPlacement} from './token-aura-records.js';
import {getTokenLevelPresentation} from './token-levels.js';
import {buildLevelViewModel} from '../state/normalize/map-levels.js';
import {resolveTemplateLevelPresentation,applyTemplateVisibilityMask,clearTemplateVisibilityMask} from './template-presentation.js';

export function renderTokenAuras({placements = [], layer, view, gmViewing = false, tokenLevelState, auraViewerLevelId, isCellFogged = null, passive = false}) {
  if (!layer) {
    return;
  }

  const gridSize = Math.max(8, Number.isFinite(view?.gridSize) ? view.gridSize : 64);
  const offsets = view?.gridOffsets ?? {};
  const leftOffset = Number.isFinite(offsets.left) ? offsets.left : 0;
  const topOffset = Number.isFinite(offsets.top) ? offsets.top : 0;
  if (!view?.mapLoaded) placements = [];

  // Build set of existing aura elements by placement ID + aura ID.
  const existingAuras = new Map();
  Array.from(layer.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) {
      layer.removeChild(child);
      return;
    }
    const id = passive ? child.dataset?.previewAuraPlacementId : child.dataset?.placementId;
    const auraId = child.dataset?.auraId || 'manual';
    if (id) {
      existingAuras.set(`${id}:${auraId}`, child);
    } else {
      layer.removeChild(child);
    }
  });

  let auraCount = 0;
  const levelContext={viewerLevelId:auraViewerLevelId,levels:buildLevelViewModel({mapLevels:tokenLevelState})};

  placements.forEach((placement) => {
    const normalized = normalizePlacementForRender(placement);
    if (!normalized) {
      return;
    }

    // Skip hidden tokens for non-GM
    if (!gmViewing && normalized.hidden) {
      return;
    }

    if (
      !gmViewing &&
      !getTokenLevelPresentation(
        {
          ...placement,
          column: normalized.column,
          row: normalized.row,
          width: normalized.width,
          height: normalized.height,
        },
        tokenLevelState,
        {
          viewerLevelId: auraViewerLevelId,
          gmViewing: false,
          mode: 'vision',
        },
      ).visible
    ) {
      return;
    }

    // Check fog: if the token is fully fogged, skip its aura too
    if (isCellFogged) {
      let allFogged = true;
      for (let dc = 0; dc < normalized.width && allFogged; dc++) {
        for (let dr = 0; dr < normalized.height && allFogged; dr++) {
          if (!isCellFogged(normalized.column + dc, normalized.row + dr)) {
            allFogged = false;
          }
        }
      }
      if (allFogged) {
        return;
      }
    }

    const auras = getRenderableAurasForPlacement(placement);
    if (!auras.length) {
      return;
    }

    auras.forEach((aura) => {
      const auraRadius = Math.max(1, Math.min(20, parseInt(aura.radius, 10) || 1));
      const floorDistance = verticalFloorDistance(placement,{levelId:auraViewerLevelId},tokenLevelState);
      if (!gmViewing && (floorDistance === null || floorDistance > auraRadius)) return;
      const auraColor = typeof aura.color === 'string' ? aura.color : '#3b82f6';
      const auraKey = `${normalized.id}:${aura.id || 'manual'}`;

      // Calculate aura dimensions.
      // Draw Steel uses square (Chebyshev) distance — diagonals count as 1 — so
      // an aura of radius N extends N squares beyond EVERY edge of the token,
      // including diagonally. For a WxH token that is a (W+2N) x (H+2N) square
      // block, computed per-axis (not a circle).
      const tokenW = normalized.width;
      const tokenH = normalized.height;
      const auraWidth = (tokenW + auraRadius * 2) * gridSize;
      const auraHeight = (tokenH + auraRadius * 2) * gridSize;

      let auraEl = existingAuras.get(auraKey);
      let isNew = false;
      if (auraEl) {
        existingAuras.delete(auraKey);
      } else {
        auraEl = document.createElement('div');
        auraEl.className = 'vtt-token-aura';
        if (passive) auraEl.dataset.previewAuraPlacementId = normalized.id;
          else auraEl.dataset.placementId = normalized.id;
        auraEl.dataset.auraId = aura.id || 'manual';
        isNew = true;
      }

      auraEl.style.width = `${auraWidth}px`;
      auraEl.style.height = `${auraHeight}px`;

      // Memoize fill: only recompute if color changed. Flat fill + inset border
      // so the square reads as a discrete grid block rather than a soft circle.
      const gradientKey = auraColor;
      if (auraEl._lastGradientKey !== gradientKey) {
        const r = parseInt(auraColor.slice(1, 3), 16) || 0;
        const g = parseInt(auraColor.slice(3, 5), 16) || 0;
        const b = parseInt(auraColor.slice(5, 7), 16) || 0;
        auraEl.style.background = `rgba(${r},${g},${b},0.18)`;
        auraEl.style.boxShadow = `inset 0 0 0 2px rgba(${r},${g},${b},0.45)`;
        auraEl._lastGradientKey = gradientKey;
      }

      // Position from the token's top-left, pulled back auraRadius squares on
      // both axes so the square is centered on the token's footprint.
      const auraLeft = leftOffset + (normalized.column - auraRadius) * gridSize;
      const auraTop = topOffset + (normalized.row - auraRadius) * gridSize;
      auraEl.style.transform = `translate3d(${auraLeft}px, ${auraTop}px, 0)`;
      const presentation=gmViewing ? {visible:true} : resolveTemplateLevelPresentation(
        {levelId:normalized.levelId},view,levelContext,
        {pixelBounds:{left:auraLeft,top:auraTop,width:auraWidth,height:auraHeight}});
      auraEl.hidden=!presentation.visible;
      if(presentation.maskRects?.length)applyTemplateVisibilityMask(auraEl,presentation.maskRects);
      else clearTemplateVisibilityMask(auraEl);

      if (isNew) {
        layer.appendChild(auraEl);
      }
      if(presentation.visible)auraCount += 1;
    });
  });

  // Remove orphaned aura elements no longer in state
  existingAuras.forEach((node) => {
    node.remove();
  });

  layer.hidden = auraCount === 0;
}
