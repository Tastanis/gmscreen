export function slopeIndicator(x,y,heightAt,allowed=()=>true){
 const h=heightAt(x,y);let highest=h,direction=null;
 for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
  if(!allowed(x+dx,y+dy))continue;
  const z=heightAt(x+dx,y+dy);if(z>highest+1e-6){highest=z;direction={dx,dy};}
 }
 if(!direction)return null;
 const {dx,dy}=direction;let previous=heightAt(x-dx*.5,y-dy*.5),rise=0,grade=0;
 for(let i=1;i<=8;i++){const t=-.5+i/8,z=heightAt(x+dx*t,y+dy*t),change=Math.max(0,z-previous);rise+=change;grade=Math.max(grade,change*8);previous=z;}
 return rise>=.3-1e-6?{dx,dy,grade,rise}:null;
}
