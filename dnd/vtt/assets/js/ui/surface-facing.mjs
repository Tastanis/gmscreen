// Visibility of the walking face is separate from seeing the underside/roof silhouette.
export const seesFlatTop=(eye,height)=>eye>=height-1e-6;
export function seesRampTop(viewer,eye,point,height,gradient){
 return eye-height-gradient.x*(viewer.x-point.x)-gradient.y*(viewer.y-point.y)>=-1e-6;
}
