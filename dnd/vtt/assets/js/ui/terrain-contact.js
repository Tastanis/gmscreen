export const FORCED_TERRAIN_SLAM_GRADE=2;
export const TERRAIN_FACE_RISE=1;
export const TERRAIN_FACE_RUN=.25;
// Return the first rising face actually reached, never the start of its lookahead.
// Fixed sampling positions keep shortened collision probes consistent.
export function terrainContact(from,to,ground,support=null,sign=1){
 const dx=to.column-from.column,dy=to.row-from.row,d=Math.max(Math.abs(dx),Math.abs(dy));
 if(d<1e-7)return null;
 const ux=dx/d,uy=dy/d,air=['fly','hover'].includes(from.movementMode),alt=from.flightHeight??0;
 const sample=s=>{const p={...from,column:from.column+ux*s,row:from.row+uy*s},z=ground(p.column+(p.width||1)/2,p.row+(p.height||1)/2);return {z:sign*(air?Math.max(alt,z):z),on:air||!support||Math.abs(support(p)-z)<=.03};};
 for(let k=0;k<=Math.ceil(d*8);k++){
  const start=k/8,a=sample(start);if(!a.on)continue;
  for(const [run,rise] of [[1,FORCED_TERRAIN_SLAM_GRADE],[TERRAIN_FACE_RUN,TERRAIN_FACE_RISE]]){
   const b=sample(start+run);if(!b.on||b.z-a.z<rise-1e-6)continue;
   let previous=a;
   for(let j=1;j<=Math.ceil(run*8);j++){
    const end=start+Math.min(run,j/8),next=sample(end);
    if(next.z>previous.z+1e-7){
     let lo=end-1/8,hi=end;for(let n=0;n<24;n++){const mid=(lo+hi)/2;if(sample(mid).z>previous.z+1e-7)hi=mid;else lo=mid;}
     if(lo<d-1e-6)return Math.max(0,lo);break;
    }
    previous=next;
   }
  }
 }
 return null;
}
