import * as THREE from 'three';

// Clip both halves of each triangle at the same shoreline. The retaining wall,
// bank top and liquid all terminate on precisely the same contour.
export function cutChannel(distance, waterY, bankY, withPaving = false) {
  const water = [], walls = [], paving = [];
  const cache = new Map();
  function sample(x, z) {
    const key = Math.round(x * 1000) + ',' + Math.round(z * 1000);
    if (!cache.has(key)) cache.set(key, [x, z, distance(x, z)]);
    return cache.get(key);
  }
  function face(list, poly, y) {
    for (let i = 1; i < poly.length - 1; i++) {
      for (const p of [poly[0], poly[i], poly[i + 1]]) list.push(p[0], y, p[1]);
    }
  }
  function triangle(a, b, c) {
    const wet = [], dry = [], cuts = [];
    for (const [p, q] of [[a,b],[b,c],[c,a]]) {
      (p[2] <= 0 ? wet : dry).push(p);
      if ((p[2] <= 0) === (q[2] <= 0)) continue;
      const t = p[2] / (p[2] - q[2]), edge = [p[0] + (q[0]-p[0])*t, p[1] + (q[1]-p[1])*t];
      wet.push(edge); dry.push(edge); cuts.push(edge);
    }
    face(water, wet, waterY);
    if (withPaving) face(paving, dry, bankY);
    if (cuts.length === 2) {
      const [p,q] = cuts;
      for (const [v,y] of [[p,bankY],[q,bankY],[p,waterY-.5],[q,bankY],[q,waterY-.5],[p,waterY-.5]]) walls.push(v[0],y,v[1]);
    }
  }
  function geometry(list) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    const uv = [];
    for (let i = 0; i < list.length; i += 3) uv.push(list[i]/32, list[i+2]/32);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals(); return geo;
  }
  return { sample, triangle, finish: () => ({ water:geometry(water), walls:geometry(walls), paving:geometry(paving) }) };
}

export function cutHex(channel, x, z, radius, divisions) {
  for (let side = 0; side < 6; side++) {
    const a = side*Math.PI/3, b = (side+1)*Math.PI/3;
    const point = (i,j) => channel.sample(x + radius*(i*Math.cos(a)+j*Math.cos(b))/divisions,
      z + radius*(i*Math.sin(a)+j*Math.sin(b))/divisions);
    for (let i=0;i<divisions;i++) for (let j=0;j<divisions-i;j++) {
      channel.triangle(point(i,j),point(i,j+1),point(i+1,j));
      if (i+j+1<divisions) channel.triangle(point(i+1,j),point(i,j+1),point(i+1,j+1));
    }
  }
}

export function sluiceMaterial(kind, color, uniforms) {
  const stone = kind === 'stone';
  const material = new THREE.MeshStandardMaterial({name:'sluice-'+kind,color,roughness:stone ? .85 : .30,
    metalness:stone?0:.08,side:THREE.DoubleSide,envMapIntensity:stone ? .55 : .62});
  dressSluice(material, uniforms);
  return material;
}

let lichenTexture;
function masonryTexture() {
  if (!lichenTexture) {
    lichenTexture = new THREE.TextureLoader().load(new URL('./images/sluice-lichen.webp',import.meta.url).href);
    lichenTexture.wrapS=lichenTexture.wrapT=THREE.RepeatWrapping;
    lichenTexture.anisotropy=4;
  }
  return lichenTexture;
}
export function dressSluice(material, uniforms) {
  const stone = material.name === 'sluice-stone';
  material.customProgramCacheKey = () => stone ? 'sluice-cut-stone-v1' : 'sluice-current-v1';
  material.onBeforeCompile = sh => {
    if(stone) sh.uniforms.sluLichen={value:masonryTexture()};
    sh.uniforms.sluNoise=uniforms.uNoise; sh.uniforms.sluTime=uniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 sluPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 sluLocal=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        sluLocal=instanceMatrix*sluLocal;
        #endif
        sluPos=(modelMatrix*sluLocal).xyz;`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 sluPos; uniform sampler2D sluLichen; uniform sampler2D sluNoise; uniform float sluTime;
      float sluN(vec2 p){return texture2D(sluNoise,p).r;}
      float patina=0.; float relief=0.; vec2 wave=vec2(0.);`);
    const pigment = stone ? `
      vec3 n=normalize(cross(dFdx(sluPos),dFdy(sluPos))); vec3 an=abs(n);
      vec2 p=an.y>.64?sluPos.xz:vec2(an.x>an.z?sluPos.z:sluPos.x,sluPos.y);
      float grain=sluN(p*.13), pits=sluN(p*.57);
      vec2 block=p/vec2(7.6,3.2)+.09*vec2(sluN(p*.16),grain);
      block.x+=.5*mod(floor(block.y),2.);
      vec2 joint=min(fract(block),1.-fract(block))*vec2(7.6,3.2);
      float cut=smoothstep(.06,.36,min(joint.x,joint.y)+.14*(pits-.5));
      float mineral=sluN(floor(block)*.137)+grain*.45+pits*.24;
      patina=smoothstep(.44,.72,sluN(sluPos.xz*.034)+.21*(grain-.5)+.12*an.y);
      vec3 surface=mix(vec3(.34,.31,.25),vec3(.90,.85,.70),clamp(mineral-.28,0.,1.));
      surface=mix(surface,vec3(.22,.31,.095)*(.62+grain),patina*.59);
      vec3 lichen=texture2D(sluLichen,p*.048).rgb;
      float fissure=dot(lichen,vec3(.28,.53,.19));
      surface=mix(surface,surface*(.30+lichen*2.5),.86);
      diffuseColor.rgb*=mix(surface*.48,surface,cut); relief=.13*cut+.045*grain+.28*fissure;` : `
      // Swells carry small ripples downstream. Warp their phase in world space
      // so one continuous current passes through the junctions and pools.
      vec2 p = sluPos.xz;
      vec2 drift = vec2(.62, -.78) * sluTime;
      vec2 bend = vec2(sluN(p*.017 - drift*.009), sluN(p*.022 + drift*.007 + .31)) - .5;
      vec2 q = p + 8.*bend - drift*.92;
      vec2 swell = vec2(sluN(q*.043), sluN(q*.047 + .37)) - .5;
      vec2 fine = vec2(sluN(q*.112 + swell*.27), sluN(q*.125 - swell*.21 + .47)) - .5;
      wave = .18*swell + .072*fine;
      float eddy = sluN(q*.063 + swell*.43);
      diffuseColor.rgb *= .76 + .45*eddy;`;
    sh.fragmentShader=sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n{'+pigment+'}');
    if (!stone) sh.fragmentShader=sh.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight=outgoingLight*vec3(1.,.81,.68)+vec3(.019,.0007,.0009);\n#include <opaque_fragment>');
    sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_maps>',stone ? `#include <normal_fragment_maps>
      vec3 dp1=dFdx(vViewPosition),dp2=dFdy(vViewPosition);
      vec3 r1=cross(dp2,normal),r2=cross(normal,dp1); float det=dot(dp1,r1);
      normal=normalize(abs(det)*normal+sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2)+normal*1.e-8);` :
      `#include <normal_fragment_maps>
      normal=normalize(normal+mat3(viewMatrix)*vec3(wave.x,0.,wave.y));`);
  };
}

// Individual wedge stones leave a clear opening between two battered jambs.
export function sluiceArch(add, x, y, z, yaw, radius, depth, material) {
  const place = geo => add(geo.rotateY(yaw).translate(x,y,z),material);
  const width=radius*.35, spring=radius*.69;
  for(const sign of [-1,1]) place(new THREE.BoxGeometry(width,spring,depth).translate(sign*(radius+width/2),spring/2,0));
  for(let i=0;i<11;i++){
    const a=i*Math.PI/11+.012,b=(i+1)*Math.PI/11-.012,outer=radius+width*(i===5?1.3:1);
    const shape=new THREE.Shape();
    shape.moveTo(radius*Math.cos(a),spring+radius*Math.sin(a));
    shape.lineTo(outer*Math.cos(a),spring+outer*Math.sin(a));
    shape.lineTo(outer*Math.cos(b),spring+outer*Math.sin(b));
    shape.lineTo(radius*Math.cos(b),spring+radius*Math.sin(b)); shape.closePath();
    place(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false}).translate(0,0,-depth/2));
  }
}

export function sluiceSpray(uniforms, fall) {
  return new THREE.ShaderMaterial({ name:'sluice-spray', transparent:true, depthWrite:false, side:THREE.DoubleSide,
    uniforms:{t:uniforms.uTime, mistNoise:uniforms.uNoise}, vertexShader:`varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 v; uniform float t; uniform sampler2D mistNoise; void main(){`+(fall?`
      float x=v.x*2.-1.;
      float veil=texture2D(mistNoise,vec2(v.x*.84,v.y*.33+t*.39)).r;
      float detail=texture2D(mistNoise,vec2(v.x*2.2+veil*.18,v.y*.65+t*.69)).g;
      float split=smoothstep(.27,.57,veil*.7+detail*.3+v.y*.25);
      float sheen=smoothstep(.46,.79,detail*(.6+.4*veil));
      float edge=1.-smoothstep(.57,.99,abs(x)+.25*(veil-.5));
      gl_FragColor=vec4(mix(vec3(.27,.012,.021),vec3(.84,.60,.54),sheen),edge*(.35+.58*split));`:`
      vec2 p=(v-.5)*2.; float r=length(p);
      float n=texture2D(mistNoise,p*.68+vec2(.13*t,-.09*t)).r;
      float fine=texture2D(mistNoise,p*1.8+vec2(-.11*t,.08*t)).g;
      float ring=pow(max(0.,sin(r*24.-t*4.+n*3.4)),3.);
      float rim=ring*smoothstep(.24,.74,n)*.30;
      float churn=(1.-smoothstep(.06,.51,r))*(.12+.70*smoothstep(.37,.70,fine));
      gl_FragColor=vec4(.70,.46,.39,(rim+churn)*(1.-smoothstep(.32,1.,r)));`)+`
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
}

// Sculpt the dam relief as a single surface so the recesses have actual depth.
export function wellspringSkull() {
  const oval=(x,y,z,a,b,c)=>(Math.hypot(x/a,y/b,z/c)-1)*Math.min(a,b,c);
  const join=(a,b,k)=>Math.min(a,b)-Math.max(k-Math.abs(a-b),0)**2/(4*k);
  function field(x,y,z){
    const u=Math.abs(x);
    let d=oval(x,y-30.7,z,13.0,13.4,10.4);
    d=join(d,oval(x,y-20,z-3,9.5,8,8.6),2.5);
    d=join(d,oval(u-9.4,y-22.8,z-5.2,4.4,3.3,5.7),1.7);
    d=join(d,oval(u-7.7,y-16,z-1.8,2.5,9.5,4),1.5);
    d=join(d,oval(x,y-9.5,z-5.4,8.4,3.8,6.6),1.6);
    d=join(d,oval(u-5.1,y-32.1-.16*(u-5),z-8.6,5.4,1.65,2.6),1.2);
    d=join(d,oval(x,y-25.9,z-8.9,1.65,4.3,2.4),.9);
    d=Math.max(d,-oval(u-11.8,y-27.5,z-5.3,2.8,4.4,3.8));
    d=Math.max(d,-oval(u-8.9,y-19.3,z-6.2,2.3,3.2,3.6));
    d=Math.max(d,-oval(u-5.55,y-28.1-.19*(u-5.55),z-10.6,4.45,4.05,5.7));
    d=Math.max(d,-oval(u-5.55,y-27.05,z-4.0,2.15,2.05,7.0));
    d=Math.max(d,-oval(x,y-22,z-10.8,1.85+.14*Math.max(0,23-y),3.5,4.1));
    d=Math.max(d,-oval(x,y-14.4,z-10,7.4,3.5,8.7));
    return d;
  }
  const pos=[], normals=[], stride=.72, nx=43, ny=64, nz=36;
  const dots=[];
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const x=-15.2+i*stride,y=3+j*stride,z=-11.2+k*stride;
    dots.push([x,y,z,field(x,y,z)]);
  }
  const plane=nx*ny, offsets=[0,1,nx+1,nx,plane,plane+1,plane+nx+1,plane+nx];
  const tetra=[[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]];
  function edge(a,b){
    const t=a[3]/(a[3]-b[3]);
    return new THREE.Vector3().fromArray(a).lerp(new THREE.Vector3().fromArray(b),t);
  }
  const gradient=v=>{const {x,y,z}=v,e=.03;return new THREE.Vector3(field(x+e,y,z)-field(x-e,y,z),field(x,y+e,z)-field(x,y-e,z),field(x,y,z+e)-field(x,y,z-e)).normalize();};
  function face(a,b,c){
    const normal=gradient(a);if(b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)<0)[b,c]=[c,b];
    for(const v of [a,b,c]){pos.push(v.x,v.y,v.z);const n=v===a?normal:gradient(v);normals.push(n.x,n.y,n.z);}
  }
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    const base=k*plane+j*nx+i,c=offsets.map(o=>dots[base+o]);
    if(c.every(p=>p[3]>=0)||c.every(p=>p[3]<0))continue;
    for(const t of tetra){
      const inside=t.map(n=>c[n]).filter(p=>p[3]<0),outside=t.map(n=>c[n]).filter(p=>p[3]>=0);
      if(!inside.length||!outside.length)continue;
      if(inside.length===2){
        const [a,b]=inside,[u,v]=outside,A=edge(a,u),B=edge(a,v),C=edge(b,u),D=edge(b,v);
        face(A,B,C);face(B,D,C);
      }else{
        const [one]=inside.length===1?inside:outside,three=inside.length===1?outside:inside;
        face(...three.map(v=>edge(one,v)));
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return geo;
}
