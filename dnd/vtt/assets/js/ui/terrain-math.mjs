export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const brushRate=moving=>moving?16:8;
export function slopeColor(slope){
 if(Math.abs(slope)<.03)return '#111111';
 const up=slope>0,s=Math.abs(slope);
 // Flat is black, uphill green, downhill yellow; red is reserved for difficult terrain.
 const low=up?[22,163,74]:[202,138,4],high=up?[74,222,128]:[250,204,21];
 const t=clamp((s-1)/3,0,1);
 return '#'+low.map((v,i)=>Math.round(v+(high[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
export function sample(field,u,v){
  const {n,m,h}=field,x=clamp(u,0,1)*(n-1),y=clamp(v,0,1)*(m-1),a=Math.floor(x),b=Math.floor(y),c=Math.min(a+1,n-1),d=Math.min(b+1,m-1),fx=x-a,fy=y-b;
  // Match the two rendered triangles exactly, including picking and token support.
  return fx+fy<=1?h[b*n+a]*(1-fx-fy)+h[b*n+c]*fx+h[d*n+a]*fy:h[b*n+c]*(1-fy)+h[d*n+c]*(fx+fy-1)+h[d*n+a]*(1-fx);
}
export function paint(field,{x,y,width,height,radius,amount,mode,target,stopAtTarget=false}){
 const {n,m,h}=field,old=mode==='smooth'?h.slice():h;
 for(let j=0;j<m;j++)for(let i=0;i<n;i++){
   const distance=Math.hypot(i/(n-1)*width-x,j/(m-1)*height-y)/radius;
   if(distance>=1)continue;
   const weight=(1-distance*distance)**2,k=j*n+i;
   if(mode==='smooth'){
     let sum=0,count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {const a=clamp(i+dx,0,n-1),b=clamp(j+dy,0,m-1);sum+=old[b*n+a];count++;}
     h[k]+=(sum/count-old[k])*weight*Math.min(1,amount*3);
   }else if(mode==='flatten')h[k]+=Math.sign(target-h[k])*Math.min(Math.abs(target-h[k]),amount*weight);
   else {
     const delta=amount*weight;
     if(stopAtTarget)h[k]=mode==='lower'?Math.min(h[k],Math.max(target,h[k]-delta)):Math.max(h[k],Math.min(target,h[k]+delta));
     else h[k]=clamp(h[k]+delta*(mode==='lower'?-1:1),-8,32);
   }
 }
}
export const groundSquare=h=>Math.floor(h+.5);
/** One press of the GM's height arrows: a whole square up or down from the height shown. With a token
 * selected the view sits at that token's exact height (3.95 on a slope); the next press goes to 5 or 3, not 4.95 or 2.95. */
export const stepViewHeight=(height,direction)=>groundSquare(height)+(direction==='down'?-1:1);
export const heightBand=h=>Math.floor(groundSquare(h)/2);
export const effectiveHeight=(ground,size)=>groundSquare(ground)+Math.floor(Math.max(1,size)/2)+1;
export const relativeScale=(ground,viewer)=>clamp(1+(heightBand(ground)-heightBand(viewer))*.1,.5,2);
// squareCost(column,row,rawHeight) is the movement multiplier of the square being
// entered (2 for ordinary difficult terrain); it adds multiplier-1 to that step.
// Climbing, as the rulebook has it: each square climbed costs 2 squares of movement.
// THE ONE SETTING: a face lower than this is not a climb. A one-square vertical is just a step.
export const CLIMB_MIN_HEIGHT=2;
/** How many squares one step rises (positive) or drops: the real change in height, to the nearest
 * whole square. So a rock step under one and a half squares is a one-square step and is never a
 * climb, and one of a square and a half or more is a two-square face. Rounding the two ends
 * separately, as before, made the same 1.4-high step a climb or not by where its ends happened to
 * round. A fall counts its squares the same way (FallOutcome.php), so a face is the same height
 * going up and coming down. */
export const stepRise=(fromHeight,toHeight)=>{const change=(Number(toHeight)||0)-(Number(fromHeight)||0);return Math.sign(change)*Math.floor(Math.abs(change)+.5)||0;};
/** Extra movement for climbing (up or down) a face this many squares high: its full height again. 0 means it is not a climb. */
export function climbSurcharge(squares){const height=Math.max(0,Math.round(Math.abs(Number(squares)||0)));return height>=CLIMB_MIN_HEIGHT?height:0;}
/** Movement cost of one step: the larger of the squares moved and the height change, plus
 * (multiplier - 1) for difficult terrain, plus the climb surcharge when `climb` says this step
 * goes up a cliff face. `rise` is signed (up is positive). The ruler, the turn counter and the
 * reach outline all charge through here. */
export function stepCost({horizontal=1,rise=0,multiplier=1,climb=false}={}){return Math.max(horizontal,Math.abs(rise))+multiplier-1+(climb&&rise>0?climbSurcharge(rise):0);}
/** `isFace(from,to)` says whether a rising step runs into a cliff face (the forced-movement test).
 * It is asked only when the rise is tall enough to cost extra. Each point gets `climb`: the
 * surcharge paid on the step into it. `extra` is everything paid beyond the plain distance. */
export function routeSteps(start,end,height,squareCost=null,isFace=null){
 let x=start.column,y=start.row;const first=height(x,y),points=[{column:x,row:y,height:groundSquare(first),rawHeight:first}];
 const dx=end.column-x,dy=end.row-y,count=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)));
 for(let i=1;i<=count;i++){
   x=start.column+Math.sign(dx)*Math.min(i,Math.abs(dx));y=start.row+Math.sign(dy)*Math.min(i,Math.abs(dy));
   const rawHeight=height(x,y);points.push({column:x,row:y,height:groundSquare(rawHeight),rawHeight});
 }
 let cost=0,extra=0,climbExtra=0,cliff=false;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],horizontal=Math.max(Math.abs(a.column-b.column),Math.abs(a.row-b.row));
   const raw=horizontal>0&&squareCost?Number(squareCost(b.column,b.row,b.rawHeight)):1,multiplier=Number.isFinite(raw)&&raw>1?Math.floor(raw):1;
   const rise=stepRise(a.rawHeight,b.rawHeight),climb=!!isFace&&rise>0&&climbSurcharge(rise)>0&&!!isFace(a,b);
   b.multiplier=multiplier;b.climb=climb?climbSurcharge(rise):0;b.rise=rise;cost+=stepCost({horizontal,rise,multiplier,climb});extra+=multiplier-1+b.climb;climbExtra+=b.climb;if(horizontal>0&&Math.abs(b.rawHeight-a.rawHeight)/horizontal>=3-1e-6)cliff=true;}
 return {points,cost,cliff,extra,climbExtra};
}
export function barycentric(p,a,b,c){
 const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-8)return null;
 const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/det;
 const v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/det,w=1-u-v;
 return u>=-1e-5&&v>=-1e-5&&w>=-1e-5?[u,v,w]:null;
}
