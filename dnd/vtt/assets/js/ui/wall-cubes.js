import {sample} from './terrain-math.mjs';
import {floorElevations} from '../state/normalize/floor-elevation.js';
import {resolveSupportSurfaces,intersectsFloor,floorSupported} from './floor-support.js';
import {rampGround} from './imported-ramps.mjs';
export const wallSquareKey=s=>`${s.column},${s.row},${s.elevation??0}`;
export function wallMaterial(value){return ({gray:'stone',brown:'dirt',green:'dirt',purple:'metal',blue:'ice',cyan:'ice',red:'fire'})[value]||(['stone','dirt','metal','ice','fire'].includes(value)?value:'stone');}
export function wallCubeBase(template,square,config={},groundAt=()=>0){
 const level=template.levelId||'level-0',levels=config.mapLevels||{},model=config.environment?.walls?.value||{};
 const token={...square,width:1,height:1,levelId:level};
 const cuts=(levels.levels||[]).find(l=>l.id===level)?.cutouts||[];
 const surfaces=resolveSupportSurfaces(model),floor=surfaces.filter(s=>s.kind==='floor'&&(s.levelId||'level-0')===level&&intersectsFloor(token,s,cuts)).sort((a,b)=>b.height-a.height)[0];
 const center={x:square.column+.5,y:square.row+.5},ramp=rampGround(model.ramps||[],token,center);
 const base=level==='level-0'||floorSupported(token,surfaces,cuts)===false?groundAt(center.x,center.y):floorElevations(levels).get(level)??0;
 return (floor?.height??ramp??base)+(square.elevation??0);
}
// Derived geometry only: canonical templates remain the sole owner of these cubes.
export function wallCubeModel(model={},templates=[],config={},groundAt=()=>0){
 const out={...model,nodes:[...(model.nodes||[])],segments:[...(model.segments||[])],roofs:[...(model.roofs||[])]};
 for(const t of Object.values(templates)){if(t.type!=='wall')continue;
  for(const s of t.squares||[]){const id=`template-cube:${t.id}:${wallSquareKey(s)}`,base=wallCubeBase(t,s,config,groundAt);
   const points=[[s.column,s.row],[s.column+1,s.row],[s.column+1,s.row+1],[s.column,s.row+1]].map(([x,y],i)=>({id:`${id}:${i}`,x,y}));
   out.nodes.push(...points);
   for(let i=0;i<4;i++)out.segments.push({id:`${id}:edge:${i}`,a:points[i].id,b:points[(i+1)%4].id,baseMode:'fixed',base,height:1,topMode:'follow',sight:'block',movement:'block',interaction:'none',sightDirection:'both',movementDirection:'both'});
   out.roofs.push({id,templateCube:true,base,kind:'roof',levelId:t.levelId||'level-0',points:points.map(({x,y})=>({x,y})),holes:[],height:base+1});
  }
 }
 return out;
}
export function nextWallElevation(square,squares=[]){return squares.reduce((top,s)=>s.column===square.column&&s.row===square.row?Math.max(top,(s.elevation??0)+1):top,0);}
export function projectWallCube(square,base,gridSize,offsetLeft=0,offsetTop=0){
 const project=(x,y,z)=>({x:offsetLeft+(x+z*.12)*gridSize,y:offsetTop+(y-z*.36)*gridSize});
 const bottom=[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>project(square.column+x,square.row+y,base));
 const top=[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>project(square.column+x,square.row+y,base+1));
 return {top,east:[bottom[1],bottom[2],top[2],top[1]],south:[bottom[2],bottom[3],top[3],top[2]]};
}

export function wallTerrainAt(config,view,x,y){
 const field=config.environment?.terrain?.value;if(!field?.h||!field.n||!field.m)return 0;
 const g=view.gridSize||64,insets=view.mapInsets||{},offsets=view.gridOffsets||{},size=view.mapPixelSize||{};
 const b=field.bounds||{left:((insets.left||0)-(offsets.left||0))/g,top:((insets.top||0)-(offsets.top||0))/g,width:((size.width||g)-(insets.left||0)-(insets.right||0))/g,height:((size.height||g)-(insets.top||0)-(insets.bottom||0))/g};
 return sample(field,(x-b.left)/b.width,(y-b.top)/b.height);
}
