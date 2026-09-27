import {resolvePlacementLinkedProfileId} from '../state/normalize/map-levels.js';
export function isAlwaysVisibleAlly(token) {
  return token?.primaryPc===true||Boolean(resolvePlacementLinkedProfileId(token))||Boolean(token?.visionOwners?.length);
}
export function resolveVisionToken(placements,{isGM=false,userId='',selectedIds=[],followId=null,lastId=null}={}) {
  const selected=selectedIds.length===1?placements.find(p=>p.id===selectedIds[0]):null;
  const owns=p=>p && (p.id===followId||p.visionOwners?.includes(String(userId).toLowerCase()));
  if(isGM)return selected;
  if(owns(selected))return selected;
  const last=placements.find(p=>p.id===lastId);
  if(owns(last))return last;
  return placements.find(p=>p.id===followId)||placements.find(owns)||null;
}
