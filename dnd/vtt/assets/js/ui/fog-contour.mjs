// Shared corner samples make neighboring cells meet at the same edge midpoint.
export function cellContours(corners,visible,centerVisible=false){
 const count=visible.filter(Boolean).length;
 if(!count)return [];
 if(count===4)return [corners];
 const middle=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 const alternating=count===2&&visible[0]===visible[2];
 if(alternating&&!centerVisible)return corners.flatMap((p,i)=>visible[i]?[[p,middle(p,corners[(i+1)%4]),middle(corners[(i+3)%4],p)]]:[]);
 const polygon=[];
 corners.forEach((p,i)=>{const next=(i+1)%4;if(visible[i])polygon.push(p);if(visible[i]!==visible[next])polygon.push(middle(p,corners[next]));});
 return [polygon];
}
