import {supportAt} from './stacked-surfaces.mjs';
export function tetherSupport(point,z,terrainHeight,surfaces,stairHeight=null){
 const plate=supportAt(surfaces,point,z)?.height;
 const support=Math.max(terrainHeight,plate??-Infinity,stairHeight!==null&&stairHeight<=z+1e-6?stairHeight:-Infinity);
 return z-support>.03?support:null;
}
