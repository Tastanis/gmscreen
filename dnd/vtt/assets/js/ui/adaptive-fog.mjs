// Keep broad uniform regions cheap; spend detail where visibility changes.
// `adaptiveFogSteps` is the work itself, pausing every `pause` squares so that a caller may spread
// it over several frames (sight-job.mjs). `adaptiveFog` runs those same steps to the end in one go.
export function* adaptiveFogSteps({left,top,right,bottom,visible,emit,maxDepth=1,edgeSteps=2,pause=16}){
 const samples=new Map(),edges=new Map();let checks=0,leaves=0,polygons=0;
 const key=p=>p.x+','+p.y;
 const seen=p=>{const k=key(p);if(!samples.has(k)){checks++;samples.set(k,!!visible(p));}return samples.get(k);};
 function crossing(a,b){
  if(key(a)>key(b))[a,b]=[b,a];const k=key(a)+'/'+key(b);
  if(edges.has(k))return edges.get(k);
  let lo=a,hi=b;const low=seen(lo);
  for(let i=0;i<edgeSteps;i++){const m={x:(lo.x+hi.x)/2,y:(lo.y+hi.y)/2};if(seen(m)===low)lo=m;else hi=m;}
  const p={x:(lo.x+hi.x)/2,y:(lo.y+hi.y)/2};edges.set(k,p);return p;
 }
 function cell(x,y,r,s,depth){
  const c=[{x,y},{x:r,y},{x:r,y:s},{x,y:s}],v=c.map(seen),count=v.filter(Boolean).length;
  const middle={x:(x+r)/2,y:(y+s)/2},center=seen(middle);
  const curved=depth===maxDepth&&((count<=1&&center)||(count>=3&&!center));
  if((depth<maxDepth&&(count>0&&count<4||center!==(count===4)))||curved){
   cell(x,y,middle.x,middle.y,depth+1);cell(middle.x,y,r,middle.y,depth+1);
   cell(x,middle.y,middle.x,s,depth+1);cell(middle.x,middle.y,r,s,depth+1);return;
  }
  leaves++;if(!count)return;
  const send=p=>{polygons++;emit(p);};if(count===4){send(c);return;}
  if(count===2&&v[0]===v[2]&&!center){c.forEach((p,i)=>{if(v[i])send([p,crossing(p,c[(i+1)%4]),crossing(c[(i+3)%4],p)]);});return;}
  const polygon=[];c.forEach((p,i)=>{const n=(i+1)%4;if(v[i])polygon.push(p);if(v[i]!==v[n])polygon.push(crossing(p,c[n]));});send(polygon);
 }
 let squares=0;
 for(let y=Math.floor(top);y<bottom;y++)for(let x=Math.floor(left);x<right;x++){cell(Math.max(left,x),Math.max(top,y),Math.min(right,x+1),Math.min(bottom,y+1),0);if(++squares%pause===0)yield;}
 return {checks,leaves,polygons};
}
export function adaptiveFog(options){const run=adaptiveFogSteps(options);for(;;){const step=run.next();if(step.done)return step.value;}}
