import {resolvePlacementLevelId} from '../state/normalize/map-levels.js';

export function resolvePersistentZoneLevelId(zone) {
  return resolvePlacementLevelId({levelId:zone?.levelId ?? zone?.template?.levelId});
}

export function doesPersistentZoneOverlapPlacement(zone,placement) {
  if(!zone || !placement || resolvePersistentZoneLevelId(zone)!==resolvePlacementLevelId(placement))return false;
  const column=Number(placement.column),row=Number(placement.row);
  const width=Math.max(1,Number(placement.width)||1),height=Math.max(1,Number(placement.height)||1);
  if(!Number.isFinite(column)||!Number.isFinite(row))return false;
  const overlaps=(rect)=>Number.isFinite(rect.column)&&Number.isFinite(rect.row)&&
    Number.isFinite(rect.width)&&Number.isFinite(rect.height)&&rect.width>0&&rect.height>0&&
    column<rect.column+rect.width&&column+width>rect.column&&row<rect.row+rect.height&&row+height>rect.row;
  if(Array.isArray(zone.squares)&&zone.squares.length) {
    return zone.squares.some(square=>overlaps({column:Number(square?.column),row:Number(square?.row),width:1,height:1}));
  }
  const template=zone.template;
  return Boolean(template)&&overlaps({column:Number(template.column),row:Number(template.row),
    width:Number(template.width),height:Number(template.height)});
}

/** Detect entry along a confirmed straight movement segment, including pass-through. */
export function doesPersistentZoneMovementEnter(zone,from,to) {
  if(!zone||!from||!to||doesPersistentZoneOverlapPlacement(zone,from))return false;
  if(doesPersistentZoneOverlapPlacement(zone,to))return true;
  const floor=resolvePersistentZoneLevelId(zone);
  // Do not invent an intermediate floor path for a stairs/fall transition.
  if(resolvePlacementLevelId(from)!==floor||resolvePlacementLevelId(to)!==floor)return false;
  const x=Number(from.column),y=Number(from.row),dx=Number(to.column)-x,dy=Number(to.row)-y;
  const width=Math.max(1,Number(from.width)||1),height=Math.max(1,Number(from.height)||1);
  if(![x,y,dx,dy].every(Number.isFinite))return false;
  const rectangles=Array.isArray(zone.squares)&&zone.squares.length
    ?zone.squares.map(s=>({...s,width:1,height:1})):[zone.template];
  return rectangles.some(rect=>{
    if(!rect)return false;
    const left=Number(rect.column),top=Number(rect.row),w=Number(rect.width),h=Number(rect.height);
    if(![left,top,w,h].every(Number.isFinite)||w<=0||h<=0)return false;
    let enter=0,exit=1;
    for(const [start,delta,min,max] of [[x,dx,left-width,left+w],[y,dy,top-height,top+h]]) {
      if(delta===0){if(start<=min||start>=max)return false;continue;}
      const a=(min-start)/delta,b=(max-start)/delta;
      enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
      if(enter>=exit)return false;
    }
    return enter<exit;
  });
}
