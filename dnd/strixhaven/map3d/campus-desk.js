import * as THREE from 'three';

// Figured walnut, rubbed edges and moulding from the Faerun war table.
function rngOf(seed) { let s = seed; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function warTopPictures(THREE, renderer, T) {
  const rnd = rngOf(T.seed || 7717), w = 2048, h = 1024;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; };
  const [cv, c] = mk(), n = T.planks || 6, ph = h / n;
  for (let p = 0; p < n; p++) {   // each plank its own tone and grain
    const t = T.wood[p % T.wood.length], g = c.createLinearGradient(0, p * ph, 0, (p + 1) * ph); g.addColorStop(0, t); g.addColorStop(.5, T.wood[(p + 1) % T.wood.length]); g.addColorStop(1, t);
    c.fillStyle = g; c.fillRect(0, p * ph, w, ph);
    for (let i = 0; i < 90; i++) { const y0 = p * ph + rnd() * ph, a = 1 + rnd() * 4, k = 1 + Math.floor(rnd() * 3), f = rnd() * 6.28;
      c.strokeStyle = rnd() < .7 ? 'rgba(10,5,2,' + (.12 + rnd() * .3) + ')' : 'rgba(150,96,52,' + (.05 + rnd() * .12) + ')'; c.lineWidth = .6 + rnd() * 2;
      c.beginPath(); for (let x = 0; x <= w; x += 16) { const y = y0 + a * Math.sin(x / w * 6.2832 * k + f); if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
    if (T.figure) {   // flat-sawn figure: nested arches down the plank ("cathedrals"), and a knot or two with the grain swirling round it
      const r2 = rngOf((T.seed || 7717) + 31 * p + 1); c.save(); c.beginPath(); c.rect(0, p * ph, w, ph); c.clip();   // kept inside its own plank
      for (let a = 0; a < 2; a++) { const ax = r2() * w, ay = p * ph + ph * (.3 + r2() * .4), L = 200 + r2() * 300, tail = 300 + r2() * 500;
        for (let q = 0; q < 8; q++) { const hh = ph * (.04 + q * .05), tip = L * (.25 + q * .1); c.strokeStyle = 'rgba(14,7,2,' + (.16 + r2() * .2) + ')'; c.lineWidth = 1 + r2() * 1.6;
          c.beginPath(); c.moveTo(ax - tail, ay - hh * 1.15); c.lineTo(ax, ay - hh); c.ellipse(ax, ay, tip, hh, 0, -Math.PI / 2, Math.PI / 2); c.lineTo(ax - tail, ay + hh * 1.15); c.stroke(); } }
      if (r2() < .8) { const kx = r2() * w, ky = p * ph + ph * (.25 + r2() * .5), kr = 6 + r2() * 10;
        for (let q = 5; q >= 0; q--) { c.strokeStyle = q ? 'rgba(20,9,3,' + (.35 - q * .04) + ')' : 'rgba(10,4,1,.85)'; c.fillStyle = 'rgba(16,7,2,.7)'; c.lineWidth = 1.2;
          c.beginPath(); c.ellipse(kx, ky, kr * (1 + q * .9), kr * (.55 + q * .35), 0, 0, 6.2832); q ? c.stroke() : c.fill(); } }
      c.restore(); }
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
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // roughness: the worn, polished patches shine a little more
  const [rv, r] = mk(); r.fillStyle = 'rgb(165,165,165)'; r.fillRect(0, 0, w, h); r.globalCompositeOperation = 'source-over';
  const rr = rngOf((T.seed || 7717) + 5); for (let i = 0; i < 40; i++) { const x = rr() * w, y = rr() * h, rad = 80 + rr() * 260, g = r.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(100,100,100,0.6)'); g.addColorStop(1, 'rgba(100,100,100,0)'); r.fillStyle = g; r.fillRect(x - rad, y - rad, 2 * rad, 2 * rad); }
  const rt = new THREE.CanvasTexture(rv); rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
  return { map: t, roughnessMap: rt };
}

export function buildDesk(root,renderer,W,depth,top,margin) {
  const T={}, tW=W+2*margin.x, tD=depth+2*margin.z, th=100, tx=0, tz=0;
  const pics=warTopPictures(THREE,renderer,{wood:['#5a3a20','#664428','#50331b','#5f3f24'],figure:true,rub:1.6});
  const mk=(map,options)=>new THREE.MeshStandardMaterial({map,...options});
  function put(geometry,material){const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;root.add(mesh);}
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
  const wearU = { uTbl: { value: new THREE.Vector4(tx, tz, rw, rd) }, uTblE: { value: new THREE.Vector4(cr, th * (T.wearWidth ?? 0.55), top, th) }, uTblW: { value: T.wear ?? 0.7 } };
  topM.onBeforeCompile = sh => { Object.assign(sh.uniforms, wearU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTW; uniform vec4 uTbl, uTblE; uniform float uTblW;
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
}`);
  };
  topM.customProgramCacheKey = () => 'war-top-wear';
  put(flat(-0.5, 0, true), topM); put(edgeG, topM); put(flat(-0.55, -1.0, false), topM);
}
