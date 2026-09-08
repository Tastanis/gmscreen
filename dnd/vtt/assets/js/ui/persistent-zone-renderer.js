import {resolvePersistentZoneLevelId} from './persistent-zone-geometry.js';
import {resolveTemplateLevelPresentation,applyTemplateVisibilityMask} from './template-presentation.js';

export function collectPersistentZones(placements=[]) {
  return placements.flatMap(placement=>(Array.isArray(placement?.persistentZones)?placement.persistentZones:[])
    .filter(zone=>zone && typeof zone==='object' && zone.id)
    .map(zone=>({...zone,casterId:zone.casterId || placement.id})));
}

export function renderPersistentZones({layer,zones=[],view={},levelContext,gmViewing=false,passive=false,canEndZone=()=>false}) {
  if(!layer)return;
  layer.replaceChildren();layer.hidden=true;
  if(!view.mapLoaded)return;
  const size=Math.max(8,Number.isFinite(view.gridSize)?view.gridSize:64);
  const left=Number.isFinite(view.gridOffsets?.left)?view.gridOffsets.left:0;
  const top=Number.isFinite(view.gridOffsets?.top)?view.gridOffsets.top:0;
  for(const zone of zones) {
    const wall=Array.isArray(zone.squares)&&zone.squares.length>0;
    const rectangles=wall?zone.squares.map(square=>({...square,width:1,height:1})):[zone.template];
    let labeled=false;
    for(const rectangle of rectangles) {
      if(!rectangle)continue;
      const column=Number(rectangle.column),row=Number(rectangle.row);
      const width=Number(rectangle.width),height=Number(rectangle.height);
      if(![column,row,width,height].every(Number.isFinite)||width<=0||height<=0)continue;
      const cell=document.createElement('div');cell.className='vtt-persistent-zone'+(wall?' vtt-persistent-zone--wall-tile':'');
      cell.dataset[passive?'previewZoneId':'zoneId']=zone.id;
      cell.dataset[passive?'previewCasterId':'casterId']=zone.casterId;
      cell.style.left=(left+column*size)+'px';cell.style.top=(top+row*size)+'px';
      cell.style.width=Math.max(1,width)*size+'px';cell.style.height=Math.max(1,height)*size+'px';
      const presentation=gmViewing?{visible:true}:resolveTemplateLevelPresentation(
        {levelId:resolvePersistentZoneLevelId(zone),elements:{root:cell}},view,levelContext);
      if(!presentation.visible)continue;
      if(presentation.maskRects?.length)applyTemplateVisibilityMask(cell,presentation.maskRects);
      if(!labeled) {
        const name=String(zone.abilityName ?? ''),owner=String(zone.ownerName || 'Owner');
        const upkeep=zone.upkeep?.cost?`${zone.upkeep.cost} ${zone.upkeep.resource || 'Resource'}/turn`:'no upkeep';
        const badge=document.createElement('div');badge.className='vtt-persistent-zone__badge';
        badge.title=`${name} — ${owner} • ${upkeep}`;badge.setAttribute('aria-hidden','true');badge.textContent='⚡';
        const body=document.createElement('div');body.className='vtt-persistent-zone__body';
        const label=document.createElement('div');label.className='vtt-persistent-zone__label';label.textContent=name;
        const meta=document.createElement('div');meta.className='vtt-persistent-zone__meta';meta.textContent=`${owner} • ${upkeep}`;
        body.append(label,meta);
        if(!passive&&canEndZone(zone)) {
          const button=document.createElement('button');button.type='button';button.className='vtt-persistent-zone__end';
          button.dataset.zoneEnd=zone.id;button.title='End this zone';button.textContent='End';body.append(button);
        }
        cell.append(badge,body);labeled=true;
      }
      layer.append(cell);layer.hidden=false;
    }
  }
}
