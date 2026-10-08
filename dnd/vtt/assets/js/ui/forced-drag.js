// A Ctrl-drag supplies the final distance, after Stability and ability adjustments.
// Obstacles are stationary; breaking objects and vertical throws remain manual.
export function resolveForcedDrag(from, to, others, { wallBlocked = () => false, height = () => 0 } = {}) {
  const dx=to.column-from.column,dy=to.row-from.row,distance=Math.max(Math.abs(dx),Math.abs(dy));
  if (!distance) return {destination:to,damage:0,collidedIds:[],wall:false};
  let stop=1,wall=false,collidedIds=[];
  const at=t=>({...from,column:from.column+dx*t,row:from.row+dy*t});
  for (const other of others) {
    if (other.id===from.id || ((other.levelId||'level-0')!==(from.levelId||'level-0')&&!['fly','hover'].includes(from.movementMode)&&!['fly','hover'].includes(other.movementMode))) continue;
    if(from.column<other.column+(other.width||1)-1e-8&&from.column+(from.width||1)>other.column+1e-8&&from.row<other.row+(other.height||1)-1e-8&&from.row+(from.height||1)>other.row+1e-8)continue;
    let lo=0,hi=1;
    for (const [p,d,min,max] of [[from.column,dx,other.column-(from.width||1),other.column+(other.width||1)],[from.row,dy,other.row-(from.height||1),other.row+(other.height||1)]]) {
      if (!d) {if(p<=min+1e-8||p>=max-1e-8){hi=-1;break;}}
      else {const a=(min-p)/d,b=(max-p)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
    }
    if (lo>=hi-1e-8 || lo>stop+1e-8) continue;
    const z=height(at(lo)),oz=height(other);
    if (z>=oz+Math.max(other.width||1,other.height||1)-1e-8 || oz>=z+Math.max(from.width||1,from.height||1)-1e-8) continue;
    if(lo<stop-1e-8){stop=lo;collidedIds=[];}
    collidedIds.push(other.id);
  }
  if (wallBlocked(from,at(stop))) {
    let lo=0,hi=stop;
    for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(wallBlocked(from,at(mid)))hi=mid;else lo=mid;}
    if(lo<stop-1e-6)collidedIds=[];
    stop=lo;wall=true;
  }
  if(wall){const travel=distance*stop,whole=Math.floor(travel+1e-6),steps=whole+(travel-whole>=.75-1e-6?1:0);stop=Math.min(1,steps/distance);}
  // A creature stops the mover in the last whole square before contact, so no token is left between squares.
  let cell=null;
  if(!wall&&collidedIds.length){
    const hit=others.filter(other=>collidedIds.includes(other.id));
    const square=n=>({column:Math.round(from.column+dx*n/distance),row:Math.round(from.row+dy*n/distance)});
    const overlaps=p=>hit.some(o=>p.column<o.column+(o.width||1)-1e-8&&p.column+(from.width||1)>o.column+1e-8&&p.row<o.row+(o.height||1)-1e-8&&p.row+(from.height||1)>o.row+1e-8);
    let steps=Math.floor(distance*stop+1e-6);
    while(steps>0&&overlaps(square(steps)))steps--;
    cell=square(steps);stop=steps/distance;
  }
  const remaining=Math.max(0,Math.ceil(distance*(1-stop)-1e-6));
  return {destination:cell?{...to,...cell}:{...to,column:wall?Math.round(from.column+dx*stop):from.column+dx*stop,row:wall?Math.round(from.row+dy*stop):from.row+dy*stop},damage:remaining+(wall?2:0),collidedIds,wall};
}
