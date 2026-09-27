import {wallRooms,insideRoom} from './roof-geometry.mjs';
import {wallHeights} from './wall-properties.mjs';

// Doors remain in the planar room boundary even while open. Opening one room
// must not merge its cutaway with a neighbouring closed room.
export function doorwayCutaways(model,eye,groundAt,sight){
 const nodes=new Map(model.nodes.map(n=>[n.id,n]));
 const results=[];
 for(const door of model.segments.filter(e=>e.interaction==='door'&&e.open)){
 const da=nodes.get(door.a),db=nodes.get(door.b);if(!da||!db)continue;
 const dh=wallHeights(door,da,db,{x:(da.x+db.x)/2,y:(da.y+db.y)/2},groundAt),slice=(dh.base+dh.top)/2;
 const edges=model.segments.filter(e=>{
  const a=nodes.get(e.a),b=nodes.get(e.b);if(!a||!b)return false;
  const h=wallHeights(e,a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},groundAt);
  return slice>=h.base&&slice<h.top;
 });
 const doors=[door];
 results.push(...wallRooms(model,edges).map(ids=>({ids,points:ids.map(id=>nodes.get(id))})).filter(room=>doors.some(e=>{
  const i=room.ids.indexOf(e.a),j=room.ids.indexOf(e.b),n=room.ids.length;
  if(i<0||j<0||!([1,n-1].includes(Math.abs(i-j))))return false;
  const a=nodes.get(e.a),b=nodes.get(e.b),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  return [.25,.5,.75].some(t=>[-1,1].some(sign=>{
   const p={x:a.x+dx*t-sign*dy/len*.03,y:a.y+dy*t+sign*dx/len*.03};
   return insideRoom(p,room.points)&&[.2,.5,.8].some(f=>sight(p,dh.base+(dh.top-dh.base)*f));
  }));
 })).map(r=>r.points));
 }
 const seen=new Set();return results.filter(r=>{const key=r.map(p=>p.id).sort().join("|");if(seen.has(key))return false;seen.add(key);return true;});
}
