// Cosmetic terrain-only strips. Never used for token sight or movement.
// `obstacleRevealSteps` is the work itself, with pauses so that a caller may spread it over several
// frames (sight-job.mjs). `obstacleReveal` runs those same steps to the end in one go.
export function* obstacleRevealSteps({polygons,walls,origin,groundAt,visible,emit}){
 let checks=0,strips=0,turns=0;const seen=new Map(),candidates=[];
 const canSee=p=>{const k=p.x.toFixed(5)+','+p.y.toFixed(5);if(!seen.has(k)){checks++;seen.set(k,visible(p,groundAt(p.x,p.y)));}return seen.get(k);};
 // A fog contour on descending terrain gets up to half a square of artwork.
 // Check both sides so internal polygon edges cannot expand the reveal.
 for(const polygon of polygons){if(++turns%128===0)yield;for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.01)continue;
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},normal={x:-dy/len,y:dx/len};
  for(const sign of [-1,1]){
   const n={x:normal.x*sign,y:normal.y*sign},inside={x:mid.x-n.x*.08,y:mid.y-n.y*.08},outside={x:mid.x+n.x*.08,y:mid.y+n.y*.08},end={x:mid.x+n.x*.5,y:mid.y+n.y*.5};
   // Restrict to descending slopes; flat ground and rising obstructions get none.
   if(groundAt(inside.x,inside.y)-groundAt(end.x,end.y)<.5)continue;
   if(canSee(inside)&&!canSee(outside)){candidates.push({a,b,n,len,t:{x:dx/len,y:dy/len}});break;}
  }
 }}
 yield;
 // Index the OLD reveal footprint. Every new piece stays inside one of these
 // rectangles: smoothing may remove artwork, but cannot expose new artwork.
 const bins=new Map();
 for(const c of candidates){
  const points=[c.a,c.b,{x:c.a.x+c.n.x*.5,y:c.a.y+c.n.y*.5},{x:c.b.x+c.n.x*.5,y:c.b.y+c.n.y*.5}];
  for(let x=Math.floor(Math.min(...points.map(p=>p.x)));x<=Math.floor(Math.max(...points.map(p=>p.x)));x++)
   for(let y=Math.floor(Math.min(...points.map(p=>p.y)));y<=Math.floor(Math.max(...points.map(p=>p.y)));y++){
    const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);
   }
 }
 const supported=p=>(bins.get(Math.floor(p.x)+','+Math.floor(p.y))||[]).some(c=>{
  const x=p.x-c.a.x,y=p.y-c.a.y,u=x*c.t.x+y*c.t.y,v=x*c.n.x+y*c.n.y;
  return u>=-1e-6&&u<=c.len+1e-6&&v>=-1e-6&&v<=.500001;
 });
 for(const c of candidates){
  if(++turns%16===0)yield;
  const count=Math.max(1,Math.ceil(c.len*16)),widths=[];
  // An extension must be supported to either side. Isolated fingers taper
  // back to the actual sight contour; neighboring segments support one another.
  for(let i=0;i<=count;i++){
   const p={x:c.a.x+(c.b.x-c.a.x)*i/count,y:c.a.y+(c.b.y-c.a.y)*i/count};let width=0;
   for(let d=1;d<=16;d++){
    const depth=d/32,radius=.5+depth*.5;
    if(![-1,-.5,0,.5,1].every(s=>supported({x:p.x+c.n.x*depth+c.t.x*radius*s,y:p.y+c.n.y*depth+c.t.y*radius*s})))break;
    width=depth;
   }
   widths.push(width);
  }
  // Conservative neighbor minimum also removes isolated deep samples.
  const smooth=widths.map((w,i)=>Math.min(w,widths[Math.max(0,i-1)],widths[Math.min(count,i+1)]));
  for(let i=0;i<count;i++){
   const wa=smooth[i],wb=smooth[i+1];if(!wa&&!wb)continue;
   const a={x:c.a.x+(c.b.x-c.a.x)*i/count,y:c.a.y+(c.b.y-c.a.y)*i/count},b={x:c.a.x+(c.b.x-c.a.x)*(i+1)/count,y:c.a.y+(c.b.y-c.a.y)*(i+1)/count};
   emit([a,b,{x:b.x+c.n.x*wb,y:b.y+c.n.y*wb},{x:a.x+c.n.x*wa,y:a.y+c.n.y*wa}]);strips++;
  }
 }
 return {checks,strips};
}
export function obstacleReveal(options){const run=obstacleRevealSteps(options);for(;;){const step=run.next();if(step.done)return step.value;}}
