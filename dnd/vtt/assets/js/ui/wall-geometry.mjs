import {validateProperties} from './wall-properties.mjs';
export const emptyWalls=()=>({version:1,nodes:[],segments:[]});
export const copyWalls=m=>JSON.parse(JSON.stringify(m));
export function validateWalls(value){
 if(value?.version!==1||!Array.isArray(value.nodes)||!Array.isArray(value.segments)||value.nodes.length>10000||value.segments.length>20000)throw new Error('Invalid wall data');
 const ids=new Set();for(const n of value.nodes){if(typeof n.id!=='string'||ids.has(n.id)||!Number.isFinite(n.x)||!Number.isFinite(n.y))throw new Error('Invalid wall node');ids.add(n.id);}
 const edges=new Set(),pairs=new Set();for(const e of value.segments){const pair=[e.a,e.b].sort().join('|');if(typeof e.id!=='string'||edges.has(e.id)||!ids.has(e.a)||!ids.has(e.b)||e.a===e.b||(e.height!==undefined&&(!Number.isFinite(e.height)||e.height<0||e.height>1000))||pairs.has(pair))throw new Error('Invalid wall segment');validateProperties(e);edges.add(e.id);pairs.add(pair);}
 return copyWalls(value);
}
export function connect(m,a,b,id){if(a!==b&&!m.segments.some(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)))m.segments.push({id,a,b,opaque:true});}
export function split(m,edgeId,p,nodeId,edgeNewId){const e=m.segments.find(e=>e.id===edgeId);if(!e)return null;m.nodes.push({id:nodeId,x:p.x,y:p.y});const old=e.b;for(const roof of m.roofs||[]){for(let i=0;i<roof.nodes.length;i++){const j=(i+1)%roof.nodes.length;if((roof.nodes[i]===e.a&&roof.nodes[j]===old)||(roof.nodes[i]===old&&roof.nodes[j]===e.a)){roof.nodes.splice(i+1,0,nodeId);break;}}}e.b=nodeId;connect(m,nodeId,old,edgeNewId);const added=m.segments.find(x=>x.id===edgeNewId);if(added)Object.assign(added,{...e,id:edgeNewId,a:nodeId,b:old});return nodeId;}
/** Cuts a wall longer than a square and a half into pieces about one square long, so that
 * breaking it later takes one square and not the whole wall. Every piece keeps the wall's
 * properties. Returns the ids of all the pieces, the original first. */
export function cutIntoSquares(m,edgeId,makeId){
 const e=m.segments.find(e=>e.id===edgeId);if(!e)return [];
 const a=m.nodes.find(n=>n.id===e.a),b=m.nodes.find(n=>n.id===e.b);if(!a||!b)return [edgeId];
 const end={x:b.x,y:b.y},parts=Math.round(Math.hypot(end.x-a.x,end.y-a.y)),ids=[];
 // Each cut takes the far end off the original, so work back from the far end.
 for(let i=parts-1;i>=1;i--){const id=makeId();split(m,edgeId,{x:a.x+(end.x-a.x)*i/parts,y:a.y+(end.y-a.y)*i/parts},makeId(),id);ids.unshift(id);}
 return [edgeId,...ids];
}
export function merge(m,source,target){
 if(source===target)return;
 for(const roof of m.roofs||[])roof.nodes=[...new Set(roof.nodes.map(id=>id===source?target:id))];
 for(const e of m.segments){if(e.a===source)e.a=target;if(e.b===source)e.b=target;}
 m.roofs=(m.roofs||[]).filter(r=>r.nodes.length>=3);
 m.nodes=m.nodes.filter(n=>n.id!==source);const seen=new Set();m.segments=m.segments.filter(e=>{const key=[e.a,e.b].sort().join('|');if(e.a===e.b||seen.has(key))return false;seen.add(key);return true;});
}
export function removeSelection(m,selection){
 if(selection?.kind==='node'){m.nodes=m.nodes.filter(n=>n.id!==selection.id);m.segments=m.segments.filter(e=>e.a!==selection.id&&e.b!==selection.id);}
 else m.segments=m.segments.filter(e=>e.id!==selection?.id);
 const used=new Set(m.segments.flatMap(e=>[e.a,e.b]));m.nodes=m.nodes.filter(n=>used.has(n.id));
}
export function nearestOnSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;return {x:a.x+t*dx,y:a.y+t*dy,t};}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function onSegment(p,a,b){return Math.abs(cross(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)-1e-8&&p.x<=Math.max(a.x,b.x)+1e-8&&p.y>=Math.min(a.y,b.y)-1e-8&&p.y<=Math.max(a.y,b.y)+1e-8;}
export function intersects(a,b,c,d){
 const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
 return ((x>0&&y<0)||(x<0&&y>0))&&((z>0&&w<0)||(z<0&&w>0))||onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d);
}
export function blocksSight(m,a,b){const nodes=new Map(m.nodes.map(n=>[n.id,n]));return m.segments.some(e=>e.opaque&&intersects(a,b,nodes.get(e.a),nodes.get(e.b)));}
