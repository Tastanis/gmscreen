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
