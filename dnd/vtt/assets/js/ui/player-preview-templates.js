import {buildLevelViewModel} from '../state/normalize/map-levels.js';
import {createTemplateGeometry,TEMPLATE_COLORS} from './template-geometry.js';
import {paintTemplateArea} from './template-area-renderer.js';
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
    if(data.type==='wall')continue; // Wall tiles are the remaining template preview layer.
    const root=document.createElement('div');root.className=`vtt-template vtt-template--${data.type}`;
    root.dataset.previewTemplateId=data.id;root.dataset.templateLevelId=data.levelId;
    root.style.setProperty('--vtt-template-color',color);
    const visual=document.createElement('div');visual.className='vtt-template__shape';root.append(visual);
    const node=document.createElement('button');node.type='button';node.className='vtt-template__node is-shrunk';
    const symbol=document.createElement('span');symbol.className='vtt-template__node-symbol';symbol.textContent='◆';node.append(symbol);
    const label=document.createElement('div');label.className='vtt-template__label';node.append(label);root.append(node);
    if(data.type==='rectangle') {
      const rotate=document.createElement('button');rotate.type='button';rotate.className='vtt-template__rotate-handle';
      rotate.setAttribute('aria-label','Rotate rectangle template');rotate.innerHTML='<span aria-hidden="true">⟳</span>';node.append(rotate);
    }
    const shape={...data,...geometry.geometryForTemplate(data.type,data),elements:{root,node,label}};
    paintTemplateArea(shape,view);
    const presentation=resolveTemplateLevelPresentation(shape,view,context);
    root.hidden=!presentation.visible;root.setAttribute('aria-hidden',String(!presentation.visible));
    if(presentation.maskRects?.length)applyTemplateVisibilityMask(root,presentation.maskRects);
    layer.append(root);
  }
  stage.append(layer);
}
