// Map pings on the 3D board (map-pings.js keeps the pings, the sending and the dedupe). Each pulse is the 2D
// one (board.css .vtt-board__ping: the ring, the dot, the 900 ms animation, orange for a ping, blue for a
// focus) pinned to the point that was clicked, at its height, so it rises from the floor it was put on.
const LIFETIME_MS=900+160,SIZE_PX=160;

export function createPingsLayer({overlayHost,helpers}){
 const live=new Set();let count=0;
 function pulse({x,y,z=null,type='ping'}){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const at=helpers.toSquares(x,y),height=Number.isFinite(z)?z:helpers.groundAt(at.x,at.y);
  const el=document.createElement('div');el.className='vtt-board__ping'+(type==='focus'?' vtt-board__ping--focus':'');
  // The 2D pulse is sized against the board's zoom so it is the same on screen at any zoom; here it is drawn on the screen.
  el.style.setProperty('--vtt-ping-size',`${SIZE_PX}px`);el.style.setProperty('--vtt-ping-delay','0ms');
  el.dataset.vtt3dAnchor=`${at.x},${at.y},${height}`;overlayHost.append(el);live.add(el);count++;
  setTimeout(()=>{el.remove();live.delete(el);},LIFETIME_MS);
  return el;
 }
 const api={pulse,update(){},summary:()=>({live:live.size,pulses:count}),dispose(){for(const el of live)el.remove();live.clear();if(window.vtt3dLayers?.pings===api)delete window.vtt3dLayers.pings;}};
 (window.vtt3dLayers??={}).pings=api;return api;
}
