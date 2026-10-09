// Visibility of the walking face is separate from seeing the underside/roof silhouette.
export const seesFlatTop=(eye,height)=>eye>=height-1e-6;
// A ramp's walking face shows to an eye above its slope. An eye at or above the ramp's top is
// above the whole ramp wherever it stands, and sees the face as it sees a flat floor: without
// this, someone on the floor a stair leads up to counts as under the stair's slope carried on
// past its top, and the stair down from their own floor is not drawn.
export function seesRampTop(viewer,eye,point,height,gradient,top=Infinity){
 return seesFlatTop(eye,top)||eye-height-gradient.x*(viewer.x-point.x)-gradient.y*(viewer.y-point.y)>=-1e-6;
}
