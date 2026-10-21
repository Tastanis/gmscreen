import * as THREE from 'three';

// Map pings on the 3D board (map-pings.js keeps the pings, the sending and the dedupe). Each pulse is the 2D one
// (board.css .vtt-board__ping: the ring and the dot, orange for a ping, blue for a focus) pinned to the point that was
// clicked, at its height, and with it a shaft of light coming down onto the spot, as the campus map's pings do
// (strixhaven/map3d showPing), only narrower, shorter and quicker (Brandon, October 2026).
const LIFETIME_MS=900+160,SIZE_PX=160;
const BEAM_MS=2600,BEAM_DOWN_MS=450,BEAM_FADE_MS=900,BEAM_RADIUS=.85,BEAM_LENGTH=16;
const COLOURS={ping:0xffc566,focus:0x86c4ff};
// A cone open at both ends, widest at its foot, standing on y = 0.
const beamGeometry=new THREE.CylinderGeometry(.5,1,1,32,1,true).translate(0,.5,0);
// Bright through the middle and nothing at the edge, so it reads as a shaft and not a tube; slow streaks in it; lost
// in the air above; uReveal falls from above the top to below the foot as the light comes down.
const beamMaterial=(colour,strength,seed)=>new THREE.ShaderMaterial({
 uniforms:{uColour:{value:new THREE.Color(colour)},uAlpha:{value:0},uReveal:{value:1.2},uTime:{value:0},uStrength:{value:strength},uSeed:{value:seed}},
 transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
 vertexShader:'varying vec2 vUv; varying vec3 vN, vV, vAx; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalMatrix * normal; vV = -mv.xyz; vAx = (modelViewMatrix * vec4(0., 1., 0., 0.)).xyz; gl_Position = projectionMatrix * mv; }',
 fragmentShader:['uniform vec3 uColour; uniform float uAlpha, uReveal, uTime, uStrength, uSeed; varying vec2 vUv; varying vec3 vN, vV, vAx;',
  'void main() { vec3 ax = normalize(vAx), n = vN - ax * dot(vN, ax), w = normalize(vV); w -= ax * dot(w, ax); float wl = length(w);',
  '  float rim = abs(dot(normalize(n), w / max(wl, 1e-4))), soft = rim * rim * (3. - 2. * rim); soft *= soft * smoothstep(.04, .3, wl);',
  '  float a = vUv.x * 6.2832 + uSeed, ray = .6 + .22 * sin(a * 7. + uTime * 1.3) + .18 * sin(a * 17. - uTime * 2.1 + sin(a * 3. + uTime * .6) * 2.);',
  '  float v = (1. - smoothstep(.35, 1., vUv.y)) * smoothstep(0., .02, vUv.y) * smoothstep(uReveal - .16, uReveal, vUv.y);',
  '  gl_FragColor = vec4(uColour * (uAlpha * uStrength * soft * ray * v), 1.); }'].join('\n')});
const ease=(a,b,t)=>{const k=Math.max(0,Math.min(1,(t-a)/(b-a)));return k*k*(3-2*k);};

export function createPingsLayer({overlayHost,helpers,scene}){
 const live=new Set(),beams=new Set();let count=0,time=0;
 function beam(x,y,height,type){
  if(!scene)return;const colour=COLOURS[type]??COLOURS.ping,group=new THREE.Group();group.position.set(x,height,y);
  const part=(strength,seed,scale)=>{const mesh=new THREE.Mesh(beamGeometry,beamMaterial(colour,strength,seed));mesh.scale.set(BEAM_RADIUS*scale,BEAM_LENGTH,BEAM_RADIUS*scale);mesh.renderOrder=9000;mesh.frustumCulled=false;mesh.raycast=()=>{};group.add(mesh);return mesh;};
  const parts=[part(.55,0,1),part(1.3,2.1,.22)];scene.add(group);beams.add({group,parts,started:performance.now()});
 }
 function pulse({x,y,z=null,type='ping'}){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const at=helpers.toSquares(x,y),height=Number.isFinite(z)?z:helpers.groundAt(at.x,at.y);
  const el=document.createElement('div');el.className='vtt-board__ping'+(type==='focus'?' vtt-board__ping--focus':'');
  // The 2D pulse is sized against the board's zoom so it is the same on screen at any zoom; here it is drawn on the screen.
  el.style.setProperty('--vtt-ping-size',`${SIZE_PX}px`);el.style.setProperty('--vtt-ping-delay','0ms');
  el.dataset.vtt3dAnchor=`${at.x},${at.y},${height}`;overlayHost.append(el);live.add(el);count++;
  setTimeout(()=>{el.remove();live.delete(el);},LIFETIME_MS);
  beam(at.x,at.y,height,type);
  return el;
 }
 function drop(entry){scene?.remove(entry.group);for(const mesh of entry.parts)mesh.material.dispose();beams.delete(entry);}
 const api={pulse,
  update(context,dt=0){if(!beams.size)return;time+=dt||0;const now=performance.now();
   for(const entry of [...beams]){const e=now-entry.started;if(e>BEAM_MS){drop(entry);continue;}
    const alpha=1-ease(BEAM_MS-BEAM_FADE_MS,BEAM_MS,e),reveal=1.2-1.4*ease(0,BEAM_DOWN_MS,e);
    for(const mesh of entry.parts){mesh.material.uniforms.uAlpha.value=alpha;mesh.material.uniforms.uReveal.value=reveal;mesh.material.uniforms.uTime.value=time;}}},
  summary:()=>({live:live.size,pulses:count,beams:beams.size}),
  dispose(){for(const el of live)el.remove();live.clear();for(const entry of [...beams])drop(entry);if(window.vtt3dLayers?.pings===api)delete window.vtt3dLayers.pings;}};
 (window.vtt3dLayers??={}).pings=api;return api;
}
