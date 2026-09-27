// Closed planar faces from selected shared-node walls. Doors remain boundary edges.
export function wallRooms(model,edges){
 const nodes=new Map(model.nodes.map(n=>[n.id,n])),adj=new Map();
 for(const e of edges)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}
 for(const [id,list] of adj){const a=nodes.get(id);list.sort((u,v)=>Math.atan2(nodes.get(u).y-a.y,nodes.get(u).x-a.x)-Math.atan2(nodes.get(v).y-a.y,nodes.get(v).x-a.x));}
 const seen=new Set(),rooms=[];
 for(const [start,list] of adj)for(const next of list){let a=start,b=next,ids=[],closed=false;
  if(seen.has(a+'|'+b))continue;
  for(let guard=0;guard<=edges.length*2;guard++){
   const k=a+'|'+b;if(seen.has(k)){closed=a===start&&b===next;break;}seen.add(k);ids.push(a);
   const around=adj.get(b),index=around.indexOf(a),c=around[(index-1+around.length)%around.length];a=b;b=c;
  }
  const points=ids.map(id=>nodes.get(id)),area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
  if(closed&&area>1e-6&&new Set(ids).size===ids.length)rooms.push(ids);
 }
 return rooms;
}
export function insideRoom(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function roofSurfaces(model){const nodes=new Map(model.nodes.map(n=>[n.id,n]));return (model.roofs||[]).map(r=>({...r,points:r.points||r.nodes.map(id=>nodes.get(id))})).filter(r=>r.points.length>=3&&r.points.every(Boolean)&&Number.isFinite(r.height));}
export function ceilingBlocks(origin,eye,target,z,roofs){
 for(const roof of roofs){if(Math.abs(z-eye)<1e-7)continue;const t=(roof.height-eye)/(z-eye);if(t<=1e-6||t>=1-1e-6)continue;
  const p={x:origin.x+(target.x-origin.x)*t,y:origin.y+(target.y-origin.y)*t};if(insideRoom(p,roof.points)&&!(roof.holes||[]).some(h=>insideRoom(p,h)))return true;
 }return false;
}
