import * as THREE from 'three';

const surface = (color, roughness = .8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function span(K, a, b, radius, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 8);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  const mid = start.lerp(end, .5);
  K.add(geometry.translate(mid.x, mid.y, mid.z), material);
}

// Each tile is a square of polished serpentine with a brass survey mark at the corner.
export function surveyPavement(c, w, h) {
  let seed = 701;
  const sample = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const size = w / 4, colors = ['#365457','#40615d','#324b52','#4a6763','#375455'];
  c.fillStyle = '#192b30'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * size, y = j * size;
    c.save(); c.beginPath(); c.rect(x+2,y+2,size-4,size-4); c.clip();
    c.fillStyle = colors[Math.floor(sample()*colors.length)]; c.fillRect(x,y,size,size);
    for (let v=0;v<18;v++) {
      let px=x-2, py=y+sample()*size*1.9-size*.35;
      c.strokeStyle = v%3 ? 'rgba(155,192,170,.10)' : 'rgba(17,36,39,.22)';
      c.lineWidth=.7+sample()*1.8; c.beginPath(); c.moveTo(px,py);
      for(let s=0;s<12;s++){px+=size*.1;py+=Math.sin(s*.5+i)*2+(sample()-.63)*9;c.lineTo(px,py);}
      c.stroke();
    }
    for(let k=0;k<500;k++) { c.fillStyle=sample()<.5?'rgba(231,226,186,.12)':'rgba(6,12,24,.15)'; c.fillRect(x+sample()*size,y+sample()*size,1.4,1); }
    c.strokeStyle='rgba(183,172,118,.65)'; c.lineWidth=1.5;
    c.strokeRect(x+7,y+7,size-14,size-14);
    c.beginPath();c.arc(x+size/2,y+size/2,size*.27,0,Math.PI*2);if((i+j)%2===0)c.stroke();
    c.restore();
  }
}

// Flights leave a real chamber floor, cross the maze above wall height, then return over the first flight.
export function surveyStairs(K, x, z, dx, dz, stone, inlay) {
  const slate=surface(0x233944), bronze=surface(0xa48d59,.52,.32), tread=surface(0xb3c6b7);
  const pt=(u,y,v)=>[x+dx*u-dz*v,y,z+dz*u+dx*v];
  const nodes=[[-13,1.54,-11],[12,18,-11],[12,38,24],[-18,55,24],[-18,69,-11]];
  function landing(u,y,v,r) {
    const [px,,pz]=pt(u,y,v);
    K.C(r,r*.76,2.7,8,slate,px,y-1.55,pz,Math.PI/8);
    K.C(r,r,.42,8,stone,px,y-.21,pz,Math.PI/8);
    K.C(r*.91,r*.83,.38,8,bronze,px,y-2.03,pz,Math.PI/8);
  }
  for(let i=0;i<nodes.length;i++){
    const [u,y,v]=nodes[i]; if(i>0)landing(u,y,v,i===4?9.3:5.4);
    if(!i)continue;
    const [su,sy,sv]=nodes[i-1], length=Math.hypot(u-su,v-sv), a=(u-su)/length, b=(v-sv)/length;
    const lead=i===1?0:4.5, tail=i===4?8.35:4.5, run=length-lead-tail, count=Math.ceil((y-sy)/1.2);
    const angle=Math.atan2(dx*a-dz*b,dz*a+dx*b);
    for(let k=0;k<count;k++) {
      const d=lead+(k+.5)*run/count, top=sy+(y-sy)*(k+1)/count;
      const [px,,pz]=pt(su+a*d,top,sv+b*d);
      K.B(6.7,1.65,run/count+.03,tread,px,top-.825,pz,angle);
      if(k%3===1) K.B(6.3,.07,.18,bronze,px-Math.sin(angle)*run/count*.32,top+.035,pz-Math.cos(angle)*run/count*.32,angle);
    }
    for(const side of [-1,1]){
      const rail=(d,level,h)=>pt(su+a*d-b*side*3.15,level+h,sv+b*d+a*side*3.15);
      span(K,rail(lead,sy,-.65),rail(length-tail,y,-.65),.58,slate);
      span(K,rail(lead,sy,2.7),rail(length-tail,y,2.7),.16,bronze);
      for(const f of [0,.5,1]){const d=lead+run*f, level=sy+(y-sy)*f;span(K,rail(d,level,-.2),rail(d,level,2.7),.13,bronze);}
    }
  }
  const [px,y,pz]=pt(...nodes[4]);
  K.C(1.8,3.1,3,8,slate,px,y+1.5,pz);
  for (let i=0;i<3;i++)K.add(new THREE.TorusGeometry(3.6+i*.42,.17,7,48).rotateX(.35+i*.79).rotateY(i*.9).translate(px,y+6.4,pz),bronze);
  K.add(new THREE.OctahedronGeometry(1.25).translate(px,y+6.4,pz),inlay);
  // The second gallery passes above the first landing and ends over another aisle.
  landing(15,y,-11,6);
  landing(15,y,11,11);
  function gallery(u,v,eu,ev,r1,r2) {
    const len=Math.hypot(eu-u,ev-v), a=(eu-u)/len, b=(ev-v)/len, start=r1*.91, end=len-r2*.91;
    const angle=Math.atan2(dx*a-dz*b,dz*a+dx*b);
    const [mx,,mz]=pt(u+a*(start+end)/2,y,v+b*(start+end)/2);
    K.B(5.6,1.9,end-start+.3,slate,mx,y-.95,mz,angle);
    K.B(5.8,.28,end-start+.3,stone,mx,y-.14,mz,angle);
    for(const side of [-1,1]) {
      const point=(dist,h)=>pt(u+a*dist-b*side*2.7,y+h,v+b*dist+a*side*2.7);
      span(K,point(start,2.6),point(end,2.6),.16,bronze);
      for(const dist of [start,(start+end)/2,end])span(K,point(dist,0),point(dist,2.6),.13,bronze);
    }
  }
  gallery(-18,-11,15,-11,9.3,6); gallery(15,-11,15,11,6,11);
  const [ex,,ez]=pt(15,y,11);
  K.T(7,.13,bronze,ex,y+.1,ez,0,Math.PI/2,Math.PI*2,64);
  for(let i=0;i<24;i++){
    const a=i*Math.PI/12,len=i%3===0?1.6:.8;
    K.B(.19,.11,len,bronze,ex+Math.sin(a)*(7-len/2),y+.15,ez+Math.cos(a)*(7-len/2),a);
  }
  K.add(new THREE.TetrahedronGeometry(2.6).rotateZ(.35).translate(ex,y+3.7,ez),slate);
  K.mark('survey-stair',px,y-14,pz);
}

export function underworldRoom(K, name, x, z, facing, mats) {
  const {wood,iron,stone,brick,flame}=mats;
  const brass=surface(0x957444,.51,.38), oak=surface(0x896342), cloth=surface(name==='exchange'?0x704438:0x3c5b55);
  const ca=Math.cos(facing), sa=Math.sin(facing);
  const pt=(u,y,v)=>[x+ca*u+sa*v,y,z-sa*u+ca*v];
  const box=(w,h,d,m,u,y,v)=>K.B(w,h,d,m,...pt(u,y,v),facing);
  const pole=(a,b,r,m)=>span(K,pt(...a),pt(...b),r,m);
  const coin=(u,y,v,r)=>K.C(r,r,.22,10,brass,...pt(u,y,v));
  const crate=(u,y,v)=>{
    box(6.3,5,5,wood,u,y+2.5,v);
    for(const h of [.55,4.5])box(6.6,.65,5.3,oak,u,y+h,v);
    for(const side of [-1,1])pole([u-2.7,y+.8,v+side*2.54],[u+2.7,y+4.3,v+side*2.54],.28,oak);
  };
  if(name==='sealed'){
    // A blind recess backed by masonry. Light escapes at the threshold and between the leaves.
    box(29,20,6,brick,0,11,23); box(20,16,2,iron,0,9.1,19.2);
    const light=K.glow(0xffe5a4,1.6), leaf=surface(0x27292b,.65,.28);
    box(15.3,.32,.65,light,0,1.53,17.96);box(.26,13,.45,light,0,8,18.04);
    for(const s of [-1,1]){
      box(7.35,13.3,1.2,leaf,s*3.85,8.35,18.25);
      for(const h of [4.3,11.7])box(6.9,.72,.45,iron,s*3.85,h,17.5);
      for(let i=0;i<5;i++)box(3.3,3.25,3.9,stone,s*10,3.1+i*3.32,19.4);
    }
    for(let i=0;i<11;i++){
      const a=(i+.5)*Math.PI/11, geo=new THREE.BoxGeometry(2.8,3.1,4.2).rotateZ(a-Math.PI/2).rotateY(facing);
      K.add(geo.translate(...pt(9.3*Math.cos(a),15+5.4*Math.sin(a),19.4)),stone);
    }
    box(12,.85,1,iron,0,7.6,16.95);
    K.T(1.12,.27,iron,...pt(.25,7.8,16.29),facing);
    box(2.05,2.3,.85,brass,.25,6.35,16.25);
    box(.28,.67,.13,iron,.25,6.4,15.78);
    const glow=K.tex(128,128,(ctx,w,h)=>{
      const im=ctx.createImageData(w,h);
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){
        const k=(j*w+i)*4,t=j/(h-1),across=Math.abs((i+.5)/w*2-1);
        im.data.set([255,213,139,Math.round(138*(1-t)**2.3*Math.max(0,1-across**2)**2)],k);
      }
      ctx.putImageData(im,0,0);
    });
    const spill=new THREE.MeshBasicMaterial({map:glow,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    K.P(16,9,spill,...pt(0,1.24,13.1),facing+Math.PI);
    K.light(...pt(0,2.1,15),0xffdd99,1.6,40,0);
    K.mark('sealed-door',...pt(0,9,17));
    return;
  }
  if(name==='wharf'){
    box(13,.14,39,mats.water,0,1.39,-13.5);
    for(const edge of [-1,1])box(1,.8,38,stone,edge*7,1.65,-13);
    for(let i=0;i<14;i++)box(2.45,1,14,oak,-17+i*2.5,2.1,10);
    for(const ux of [-16,-4,15])for(const vz of [4,16])pole([ux,1,vz],[ux,3.8,vz],.55,wood);
    for(const [u,y,v] of [[-13,2.6,10],[-6,2.6,11],[-11,7.6,10],[13,1.2,-10],[20,1.2,-10],[16,6.2,-10]])crate(u,y,v);
    pole([7,2.5,12],[7,18,12],.83,wood);pole([7,17,12],[7,17,1],.73,oak);
    pole([7,8,12],[7,16,2],.44,wood);pole([7,17,1],[7,6,1],.11,iron);
    K.T(1.4,.25,iron,...pt(7,16.8,1),facing+Math.PI/2);crate(7,1.2,1);
  } else {
    for(const u of [-14,14]){
      for(const side of [-1,1])for(const v of [-5,5])pole([u+side*7,1.2,v],[u+side*7,12,v],.32,wood);
      const trim=surface(name==='exchange'?0x9f8066:0x8a9a83);
      for(let i=0;i<8;i++) {
        const x0=u-8+i*2,x1=x0+2;
        const canopy=new THREE.PlaneGeometry(2,12,1,12),pos=canopy.attributes.position;
        for(let j=0;j<pos.count;j++){
          const v=-pos.getY(j),h=11.6+2.7*(1-Math.abs(v)/6)**1.55;
          pos.setXYZ(j,...pt(pos.getX(j)<0?x0:x1,h,v));
        }
        canopy.computeVertexNormals();
        cloth.side=trim.side=THREE.DoubleSide;
        K.add(canopy,i%4===0?trim:cloth);
      }
      box(13,.8,5,oak,u,5.1,0);
      for(const side of [-1,1])box(.9,4.1,4,wood,u+side*5.6,3.05,0);
      if(name==='exchange'){
        for(let i=0;i<6;i++){const cx=u-3.4+i*1.2;for(let k=0;k<=i%3;k++)coin(cx,5.63+k*.22,.75,.53);}
        box(3.2,.4,2.4,cloth,u,5.75,-1.2);
        pole([u+3.6,5.5,-1],[u+3.6,8.8,-1],.12,brass);
        pole([u+1.8,8.6,-1],[u+5.4,8.6,-1],.14,brass);
        for(const offset of [1.8,5.4]){pole([u+offset,8.6,-1],[u+offset,7.3,-1],.05,iron);coin(u+offset,7.2,-1,.69);}
      } else {
        for(let i=0;i<4;i++)K.C(.64,.86,2.2,8,i%2?brass:cloth,...pt(u-3+i*2.1,6.6,.1));
        crate(u,1.15,9);
      }
    }
  }
  const lampX=name==='wharf'?-10:0;
  K.C(.85,1.2,4,8,iron,...pt(lampX,3.2,-9));K.K(1,2.5,8,flame,...pt(lampX,6.3,-9));
  K.light(...pt(lampX,11,-8),0xffba79,2.3,100,.08);
}
export function cascadeGeometry(width, sample) {
  const pos=[],uv=[],indices=[],rows=24,lanes=8;
  for(let i=0;i<=rows;i++){
    const t=i/rows;
    for(let j=0;j<=lanes;j++){
      const side=j/lanes*2-1;
      const offset=side*width*.5*(.58+.42*t)*(1+.045*Math.sin(t*8.2+side));
      pos.push(...sample(t,offset)); uv.push(j/lanes,1-t);
      const k=i*(lanes+1)+j;
      if(i && j)indices.push(k-lanes-2,k-1,k,k-lanes-2,k,k-lanes-1);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
