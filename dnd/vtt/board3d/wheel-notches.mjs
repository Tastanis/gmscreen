// Kept apart from three.js so it can be tested (camera-controls.mjs uses it).
// Whole steps from a wheel event: one per notch of a mouse wheel, up (away from you) positive. A touchpad sends many
// small moves; they are added up until they make a step.
let wheelCarry=0;
export function wheelNotches(e){const pixels=e.deltaY*(e.deltaMode===1?33:e.deltaMode===2?400:1);if(!pixels)return 0;
 if(Math.abs(pixels)>=50){wheelCarry=0;return -Math.sign(pixels);}
 wheelCarry+=pixels;if(Math.abs(wheelCarry)<50)return 0;const step=-Math.sign(wheelCarry);wheelCarry=0;return step;}
