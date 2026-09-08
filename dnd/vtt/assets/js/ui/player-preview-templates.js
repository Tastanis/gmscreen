import {buildLevelViewModel} from '../state/normalize/map-levels.js';
import {createTemplateGeometry,TEMPLATE_COLORS} from './template-geometry.js';
import {paintTemplateArea} from './template-area-renderer.js';
import {paintWallTemplate} from './template-wall-renderer.js';
import {resolveTemplateLevelPresentation,applyTemplateVisibilityMask} from './template-presentation.js';

export function renderPlayerPreviewTemplates(stage,preview,view,levelId) {
  const canonical=preview.snapshot.state,sceneId=canonical.routing?.activeSceneId;
  const config=canonical.sceneConfig?.[sceneId] ?? {};
  const context={viewerLevelId:levelId,levels:buildLevelViewModel({baseMapUrl:canonical.routing?.mapUrl,
    mapLevels:config.mapLevels,sceneGrid:config.grid})};
  const geometry=createTemplateGeometry(()=>view);
  const layer=document.createElement('div');layer.className='vtt-board__templates';
  let colorIndex=0;
  for(const raw of Object.values(canonical.templates?.[sceneId] ?? {})) {
    const data=geometry.normalizeSerializedTemplate(raw);
    if(!data)continue;
    const color=data.color ?? TEMPLATE_COLORS[colorIndex++ % TEMPLATE_COLORS.length];
    const wall=data.type==='wall';
    const root=document.createElement('div');root.className=`vtt-template vtt-template--${data.type}`;
    root.dataset.previewTemplateId=data.id;root.dataset.templateLevelId=data.levelId;
    root.style.setProperty('--vtt-template-color',color);
    if(wall && data.wallColor)root.dataset.wallColor=data.wallColor;
    const visual=document.createElement('div');visual.className='vtt-template__shape';root.append(visual);
    let tileContainer=null;
    if(wall){visual.classList.add('vtt-template__shape--wall');tileContainer=document.createElement('div');tileContainer.className='vtt-wall';visual.append(tileContainer);}
    const node=document.createElement('button');node.type='button';node.className=wall?'vtt-wall__hitbox is-shrunk':'vtt-template__node is-shrunk';
    if(!wall){const symbol=document.createElement('span');symbol.className='vtt-template__node-symbol';symbol.textContent='◆';node.append(symbol);}
    const label=document.createElement('div');label.className='vtt-template__label';root.append(node);(wall?root:node).append(label);
    if(data.type==='rectangle') {
      const rotate=document.createElement('button');rotate.type='button';rotate.className='vtt-template__rotate-handle';
      rotate.setAttribute('aria-label','Rotate rectangle template');rotate.innerHTML='<span aria-hidden="true">⟳</span>';node.append(rotate);
    }
    const shape={...data,...geometry.geometryForTemplate(data.type,data),elements:{root,node,label,tileContainer,tiles:new Map(),connectors:new Map()}};
    if(wall){
      root.style.setProperty('--vtt-grid-size',view.gridSize+'px');
      paintWallTemplate(shape,view);node.style.left='0';node.style.top='0';node.style.width='100%';node.style.height='100%';
    } else paintTemplateArea(shape,view);
    const presentation=resolveTemplateLevelPresentation(shape,view,context);
    root.hidden=!presentation.visible;root.setAttribute('aria-hidden',String(!presentation.visible));
    if(presentation.maskRects?.length)applyTemplateVisibilityMask(root,presentation.maskRects);
    layer.append(root);
  }
  stage.append(layer);
}
