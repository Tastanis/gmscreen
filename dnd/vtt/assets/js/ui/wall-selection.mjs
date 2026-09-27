// Shortest connected segment chain; side branches are not included.
export function connectedWallPath(model,start,end){
 const edges=new Map(model.segments.map(e=>[e.id,e]));if(!edges.has(start)||!edges.has(end))return [];
 const nodes=new Map();for(const e of edges.values())for(const id of [e.a,e.b]){if(!nodes.has(id))nodes.set(id,[]);nodes.get(id).push(e.id);}
 const queue=[start],previous=new Map([[start,null]]);for(let i=0;i<queue.length;i++){const id=queue[i];if(id===end){const result=[];for(let p=id;p!==null;p=previous.get(p))result.push(p);return result.reverse();}const e=edges.get(id);for(const n of [e.a,e.b])for(const next of nodes.get(n)){if(!previous.has(next)){previous.set(next,id);queue.push(next);}}}return [];
}
