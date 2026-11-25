import * as THREE from 'three';

// Figured walnut, rubbed edges and moulding from the Faerun war table.
function rngOf(seed) { let s = seed; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function warTopPictures(renderer, T) {
  const rnd = rngOf(T.seed || 7717), w = 2048, h = 1024;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; };
  const [cv, c] = mk(), n = T.planks || 6, ph = h / n;
  for (let p = 0; p < n; p++) {   // each plank its own tone and grain
    const t = T.wood[p % T.wood.length], g = c.createLinearGradient(0, p * ph, 0, (p + 1) * ph); g.addColorStop(0, t); g.addColorStop(.5, T.wood[(p + 1) % T.wood.length]); g.addColorStop(1, t);
    c.fillStyle = g; c.fillRect(0, p * ph, w, ph);
    // Grain bends around the knot, with the tightest curls in the heartwood.
    const kx = w * (.15 + rnd() * .7), ky = ph * (.24 + rnd() * .5);
    const phase = rnd() * 6.28, reach = 115 + rnd() * 170;
    c.save(); c.beginPath(); c.rect(0, p * ph, w, ph); c.clip();
    for (let i = 0; i < 164; i++) {
      const row = rnd() * ph, dy = row - ky, frequency = 1 + rnd(), offset = rnd() * 6.28;
      c.strokeStyle = i % 4 ? 'rgba(33,12,6,' + (.07 + rnd() * .20) + ')' : 'rgba(199,134,77,' + (.07 + rnd() * .13) + ')';
      c.lineWidth = .45 + rnd() * 1.3; c.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const u = (x-kx)/reach, bow = Math.exp(-u*u*2 - Math.abs(dy)/26);
        const y = p*ph + row + Math.tanh(dy/4)*20*bow + 2.6*Math.sin(x/115 + phase + row*.022)
          + 1.2*Math.sin(x/69*frequency + offset) + .55*Math.sin(x/19 + row*.18);
        if (x) c.lineTo(x,y); else c.moveTo(x,y);
      }
      c.stroke();
    }
    c.fillStyle = 'rgba(41,19,9,.46)'; c.beginPath();
    c.ellipse(kx,p*ph+ky,16,3.8,.07,0,2*Math.PI); c.fill(); c.restore();
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, p * ph - 2, w, 4);   // the joint between planks
    const bx = rnd() * w; c.fillRect(bx, p * ph, 3, ph);   // a butt joint along each plank
  }
  for (let i = 0; i < 26; i++) {   // wear: broad pale rubbed patches, more toward the edges
    const x = rnd() * w, y = rnd() < .5 ? rnd() * h * .18 : h - rnd() * h * .18, r = 60 + rnd() * 220, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,108,68,' + ((.04 + rnd() * .06) * (T.rub || 1)) + ')'); g.addColorStop(1, 'rgba(150,108,68,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let i = 0; i < 900; i++) {   // scratches and nicks: fine, many, faint
    const x = rnd() * w, y = rnd() * h, l = 4 + rnd() * 30, a = (rnd() - .5) * 0.6 + (rnd() < .5 ? 0 : Math.PI / 2);
    c.strokeStyle = rnd() < .6 ? 'rgba(150,110,72,' + (.04 + rnd() * .08) + ')' : 'rgba(0,0,0,' + (.1 + rnd() * .15) + ')'; c.lineWidth = .4 + rnd() * .8;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
  for (let i = 0; i < 5; i++) {   // old rings from cups and candle wax
    const x = rnd() * w, y = rnd() * h, r = 18 + rnd() * 26; c.strokeStyle = 'rgba(12,6,2,' + (.18 + rnd() * .2) + ')'; c.lineWidth = 2 + rnd() * 3; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // roughness: the worn, polished patches shine a little more
  const [rv, r] = mk(); r.fillStyle = 'rgb(165,165,165)'; r.fillRect(0, 0, w, h); r.globalCompositeOperation = 'source-over';
  const rr = rngOf((T.seed || 7717) + 5); for (let i = 0; i < 40; i++) { const x = rr() * w, y = rr() * h, rad = 80 + rr() * 260, g = r.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(100,100,100,0.6)'); g.addColorStop(1, 'rgba(100,100,100,0)'); r.fillStyle = g; r.fillRect(x - rad, y - rad, 2 * rad, 2 * rad); }
  const rt = new THREE.CanvasTexture(rv); rt.wrapS = rt.wrapT = THREE.MirroredRepeatWrapping;
  return { map: t, roughnessMap: rt };
}

export function buildDesk(root,renderer,W,depth,top,margin) {
  const T={}, tW=W+2*margin.x, tD=depth+2*margin.z, th=100, tx=0, tz=0;
  const pics=warTopPictures(renderer,{wood:['#593521','#6e4228','#603820','#72472e','#593420','#69402a'],planks:9,rub:1.15});
  const mk=(map,options)=>new THREE.MeshStandardMaterial({map,...options});
  function put(geometry,material){const mesh=new THREE.Mesh(geometry,material);// The campus shadow camera ends inside this much larger tabletop.
    // Keep its projected edge off the cabinet. The wood still responds to the scene lights.
    mesh.receiveShadow=false;root.add(mesh);}
  const rw = tW / 2, rd = tD / 2, cr = Math.min(rw, rd) * 0.04, pl = (T.plankWidth ?? 0.06) * W * 6;
  // the outline, walked once round (counter-clockwise seen from above) with its outward normal
  const loop = [], CS = 10;
  for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) { const ox = tx + sx * (rw - cr), oz = tz + sz * (rd - cr);
    for (let i = 0; i <= CS; i++) { const a = a0 + i / CS * Math.PI / 2; loop.push([ox + Math.cos(a) * cr, oz + Math.sin(a) * cr, Math.cos(a), Math.sin(a)]); } }
  loop.push(loop[0]);
  // the edge's profile: [out from the outline, down from the top], in shares of the top's thickness
  const prof = [[-0.5, 0]]; for (let i = 0; i <= 6; i++) { const t = i / 6 * Math.PI / 2; prof.push([-0.3 + 0.3 * Math.sin(t), -0.26 * (1 - Math.cos(t))]); }   // ovolo
  prof.push([0, -0.32], [-0.07, -0.34]); for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI; prof.push([-0.07 + 0.11 * Math.sin(t), -0.48 + 0.12 * Math.cos(t) - 0.02]); }   // fillet, step, bead
  prof.push([-0.07, -0.66], [-0.16, -0.76], [-0.16, -1.0], [-0.55, -1.0]);   // chamfer down to the underside
  const ev = [], eu = [], ei = [], R = prof.length; let sAlong = 0;
  for (let i = 0; i < loop.length; i++) { const [x, z, nx, nz] = loop[i]; if (i) sAlong += Math.hypot(x - loop[i - 1][0], z - loop[i - 1][1]); let pv = 0;
    for (let j = 0; j < R; j++) { const [o, y] = prof[j]; if (j) pv += Math.hypot(o - prof[j - 1][0], y - prof[j - 1][1]) * th;
      ev.push(x + nx * o * th, top + y * th, z + nz * o * th); eu.push(sAlong / (pl * 2), pv / pl); } }
  for (let i = 0; i + 1 < loop.length; i++) for (let j = 0; j + 1 < R; j++) { const a = i * R + j, b = (i + 1) * R + j; ei.push(a, b, a + 1, b, b + 1, a + 1); }
  const edgeG = new THREE.BufferGeometry(); edgeG.setAttribute('position', new THREE.Float32BufferAttribute(ev, 3)); edgeG.setAttribute('uv', new THREE.Float32BufferAttribute(eu, 2)); edgeG.setIndex(ei); edgeG.computeVertexNormals();
  const flat = (o, y, up) => { const sh = new THREE.Shape(loop.slice(0, -1).map(([x, z, nx, nz]) => new THREE.Vector2(x + nx * o * th, -(z + nz * o * th))));
    const hw=W/2+187, hd=depth/2+187;
    sh.holes.push(new THREE.Path([[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([x,y])=>new THREE.Vector2(x,y))));
    const g=new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2); g.translate(0, top + y * th, 0);
    const pa = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pa.getX(i) - tx) / (pl * 2), (pa.getZ(i) - tz) / pl);   // the planks run the table's length, six to a picture
    if (!up) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    return g; };
  // the top's material: the plank picture, and per pixel the wear along the edge (pale, a little rougher, broken by noise; the rounded edge most of all)
  const topM = mk(pics.map, { roughnessMap: pics.roughnessMap, roughness: 1, envMapIntensity: .55, color: 0xffffff });
  const wearU = { uMapRebate: { value: new THREE.Vector2(W/2+187,depth/2+187) }, uTbl: { value: new THREE.Vector4(tx, tz, rw, rd) }, uTblE: { value: new THREE.Vector4(cr, th * (T.wearWidth ?? 0.55), top, th) }, uTblW: { value: T.wear ?? 0.7 } };
  topM.onBeforeCompile = sh => { Object.assign(sh.uniforms, wearU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTW; uniform vec4 uTbl, uTblE; uniform float uTblW; uniform vec2 uMapRebate;
float inlayLine(float d, float halfWidth) {
  float aa = max(fwidth(d)*.70, .24);
  return 1.0 - smoothstep(halfWidth-aa,halfWidth+aa,abs(d));
}
float tH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(tH(i), tH(i + vec2(1, 0)), f.x), mix(tH(i + vec2(0, 1)), tH(i + 1.0), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec2 q = abs(vTW.xz - uTbl.xy) - (uTbl.zw - uTblE.x); float inside = uTblE.x - (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));   // how far in from the outline
  float n = tN(vTW.xz / (uTblE.y * 0.9)) * 0.6 + tN(vTW.xz / (uTblE.y * 0.22) + 7.0) * 0.4, dn = tN(vTW.xz / (uTblE.y * 0.05));
  float band = 1.0 - smoothstep(0.0, uTblE.y, inside - uTblE.w * 0.3 + (n - 0.5) * uTblE.y * 1.2);
  float wear = band * smoothstep(uTblE.z - uTblE.w * 0.45, uTblE.z - uTblE.w * 0.05, vTW.y) * uTblW;   // the rubbed edge: the top and its rounded lip, not the carving below
  vec3 pale = diffuseColor.rgb * 1.65 + vec3(0.035, 0.022, 0.01); pale = mix(vec3(dot(pale, vec3(0.333))), pale, 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, pale, wear * (0.55 + 0.45 * n));
  diffuseColor.rgb *= 1.0 - 0.35 * band * uTblW * smoothstep(0.82, 0.9, dn);   // dents and nicks along the edge
  if (vTW.y > uTblE.z - .15) {
    vec2 pos = abs(vTW.xz-uTbl.xy);
    vec3 ebony = diffuseColor.rgb * vec3(.32,.37,.42);
    vec3 brass = vec3(.46,.255,.085) * (.80+.20*n);
    vec3 boxwood = vec3(.54,.34,.165) * (.72+.28*n);
    // A crossband of dark veneer with boxwood lozenges bounded by brass stringing.
    // Arc length carries the pattern around the rounded corners.
    float turnRadius = max(1.,uTblE.x-101.);
    float along = pos.x;
    if (q.x>0.) {
      float end = uTbl.z-uTblE.x;
      along = q.y>0. ? end+turnRadius*atan(q.x,q.y) : end+turnRadius*1.5707963-q.y;
    }
    float halfRun = uTbl.z + uTbl.w - 2.*uTblE.x + turnRadius*1.5707963;
    float period = halfRun / max(1.,floor(halfRun/62.+.5));
    float wave = abs(fract(along/period + .5)-.5)*2.;
    float lozenge = wave + abs(inside-101.)/13.;
    float field = inlayLine(inside-101.,20.);
    diffuseColor.rgb = mix(diffuseColor.rgb,ebony,field*.91);
    diffuseColor.rgb = mix(diffuseColor.rgb,boxwood,field*(1.-smoothstep(.81,1.05,lozenge))*.82);
    float strings = max(inlayLine(inside-77.,2.1),inlayLine(inside-125.,2.1));
    vec2 rebate = pos - uMapRebate;
    float inset = length(max(rebate,0.)) + min(max(rebate.x,rebate.y),0.);
    strings = max(strings,max(inlayLine(inset-40.,2.2),inlayLine(inset-50.,1.4)));
    diffuseColor.rgb = mix(diffuseColor.rgb,brass,strings);
    // Inlaid wind roses sit flush in the four walnut corners.
    vec2 dial = pos - (uTbl.zw-vec2(286.));
    float r = length(dial);
    if (r<139.) {
      float ang = atan(dial.y,dial.x+1.e-6);
      float sector = floor(ang/0.78539816+.5), local = ang-sector*.78539816;
      float tip = mix(79.,106.,1.-mod(sector,2.));
      float blade = r*(cos(local)/tip + abs(sin(local))/.414214*(1./27.-.92388/tip));
      float rose = 1.-smoothstep(1.-max(fwidth(blade),.009),1.+max(fwidth(blade),.009),blade);
      diffuseColor.rgb = mix(diffuseColor.rgb,ebony,.79*(1.-smoothstep(115.,118.,r)));
      diffuseColor.rgb = mix(diffuseColor.rgb,mix(brass*.60,boxwood,smoothstep(-.015,.015,local)),rose);
      float ticks = inlayLine(r-110.,4.)*(1.-smoothstep(.035,.14,abs(sin(ang*16.))));
      float rings = max(max(inlayLine(r-119.,2.4),inlayLine(r-128.,1.4)),max(inlayLine(r-8.,1.8),ticks));
      diffuseColor.rgb = mix(diffuseColor.rgb,brass,rings);
    }
  }
  // Soft reflected room light brings out the walnut and brass at grazing angles.
  totalEmissiveRadiance += diffuseColor.rgb * vec3(.21,.17,.13);
}`);
  };
  topM.customProgramCacheKey = () => 'strixhaven-walnut-inlay-v2';
  put(flat(-0.5, 0, true), topM); put(edgeG, topM); put(flat(-0.55, -1.0, false), topM);
}
