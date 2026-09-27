export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const brushRate=moving=>moving?16:8;
export function slopeColor(slope){
 if(Math.abs(slope)<.03)return '#111111';
 const up=slope>0,s=Math.abs(slope);
 const low=up?[15,34,20]:[38,15,16],high=up?[119,207,110]:[226,94,83];
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
export const heightBand=h=>Math.floor(groundSquare(h)/2);
export const effectiveHeight=(ground,size)=>groundSquare(ground)+Math.floor(Math.max(1,size)/2)+1;
export const relativeScale=(ground,viewer)=>clamp(1+(heightBand(ground)-heightBand(viewer))*.1,.5,2);
export function routeSteps(start,end,height){
 let x=start.column,y=start.row;const first=height(x,y),points=[{column:x,row:y,height:groundSquare(first),rawHeight:first}];
 const dx=end.column-x,dy=end.row-y,count=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)));
 for(let i=1;i<=count;i++){
   x=start.column+Math.sign(dx)*Math.min(i,Math.abs(dx));y=start.row+Math.sign(dy)*Math.min(i,Math.abs(dy));
   const rawHeight=height(x,y);points.push({column:x,row:y,height:groundSquare(rawHeight),rawHeight});
 }
 let cost=0,cliff=false;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],horizontal=Math.max(Math.abs(a.column-b.column),Math.abs(a.row-b.row)),vertical=Math.abs(b.height-a.height);cost+=Math.max(horizontal,vertical);if(horizontal>0&&Math.abs(b.rawHeight-a.rawHeight)/horizontal>=3-1e-6)cliff=true;}
 return {points,cost,cliff};
}
export function barycentric(p,a,b,c){
 const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-8)return null;
 const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/det;
 const v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/det,w=1-u-v;
 return u>=-1e-5&&v>=-1e-5&&w>=-1e-5?[u,v,w]:null;
}
