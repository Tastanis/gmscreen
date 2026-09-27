import {terrainContact} from './terrain-contact.js';
export {FORCED_TERRAIN_SLAM_GRADE,TERRAIN_FACE_RISE,TERRAIN_FACE_RUN} from './terrain-contact.js';
export function forcedFlightTerrainBlocked(from,to,groundAt){
 return ['fly','hover'].includes(from.movementMode)&&terrainContact(from,to,groundAt)!==null;
}
export function forcedTerrainBlocked(from,to,groundAt,supportAt=null){return terrainContact(from,to,groundAt,supportAt)!==null;}
