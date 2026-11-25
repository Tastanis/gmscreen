import * as THREE from 'three';

// All materials are shared across the archive. Its placement seed belongs to the map.
export function archiveFinishes(K, random) {
  const wood = K.tex(384,256,(c,w,h)=>{
    c.fillStyle='#916644';c.fillRect(0,0,w,h);
    for(let j=0;j<7;j++){
      const y=j*h/7, tone=Math.floor(112+random()*40);
      c.fillStyle='rgb('+[tone,tone*.70|0,tone*.49|0]+')';c.fillRect(0,y,w,h/7);
      c.fillStyle='#4c3329';c.fillRect(0,y,w,2);
      for(let k=0;k<12;k++){
        const level=y+3+random()*(h/7-5),phase=random()*6.28;
        c.strokeStyle=k%4?'rgba(51,30,21,.18)':'rgba(230,188,134,.3)';
        c.beginPath();for(let x=0;x<=w;x+=4)c.lineTo(x,level+1.7*Math.sin(x/w*6.283+phase)+Math.sin(x/w*18.85+phase));c.stroke();
      }
    }
  });
  const binding=K.tex(512,128,(c,w,h)=>{
    const hues=['#833c3e','#35586a','#54623e','#8e6033','#554368','#386454','#77514b','#535268'];
    for(let i=0;i<16;i++){
      const x=i*32;c.fillStyle=hues[i%8];c.fillRect(x,0,32,h);
      const gr=c.createLinearGradient(x,0,x+32,0);gr.addColorStop(0,'rgba(13,8,8,.78)');gr.addColorStop(.27,'rgba(250,216,164,.14)');gr.addColorStop(1,'rgba(19,13,15,.55)');
      c.fillStyle=gr;c.fillRect(x,0,32,h);
      for(const y of [8,15,95,110]){c.fillStyle='#392b29';c.fillRect(x+2,y-2,28,6);c.fillStyle='#c39b5f';c.fillRect(x+3,y,26,2);}
      c.fillStyle='#392f30';c.fillRect(x+5,33,22,29);c.strokeStyle='#c19b63';c.lineWidth=1.5;c.strokeRect(x+5,33,22,29);
      c.fillStyle='#bdac8e';c.fillRect(x+2,116,28,12);c.fillStyle='#88755c';for(let py=117;py<128;py+=3)c.fillRect(x+3,py,26,1);
      c.fillStyle='#ddc28c';for(let k=0;k<3;k++){const len=7+random()*10;c.fillRect(x+16-len/2,40+k*6,len,1.5);}
    }
  });
  const hide=K.tex(384,256,(c,w,h)=>{
    const im=c.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x/w*2*Math.PI,v=y/h, wave=.5+.5*Math.sin(9*u+.9*Math.sin(3*u)+v*9);
      const rim=Math.max(0,(v-.70)/.30),grain=random()*10,ring=.5+.5*Math.cos(v*34+1.5*Math.sin(5*u));
      im.data.set([38+27*rim+18*ring+grain,71+65*rim+20*wave+grain,87+55*rim+20*wave+grain,255],4*(x+y*w));
    }c.putImageData(im,0,0);
    for(let i=0;i<850;i++){
      const x=random()*w,y=random()*h,r=.35+random()**3*4.5;
      c.fillStyle=i%4?'rgba(181,215,183,.48)':'rgba(21,56,69,.56)';
      for(const off of [-w,0,w]){c.beginPath();c.ellipse(x+off,y,r,r*.62,0,0,Math.PI*2);c.fill();}
    }
  });
  const fiber=K.tex(256,256,(c,w,h)=>{
    c.fillStyle='#c4b598';c.fillRect(0,0,w,h);
    for(let i=0;i<320;i++){
      const x=random()*w,y=random()*h,l=4+random()*52;
      c.strokeStyle=i%4?'rgba(103,77,64,.24)':'rgba(247,228,190,.77)';c.lineWidth=.6+random()*1.4;
      c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+2,y+l*.5,x+4*Math.sin(i),y+l);c.stroke();
    }
  });
  const manuscript=K.tex(256,256,(c,w,h)=>{
    c.fillStyle='#e4d8b7';c.fillRect(0,0,w,h);
    for(let n=0;n<1600;n++){c.fillStyle=n%3?'rgba(118,83,63,.10)':'rgba(255,250,218,.32)';c.fillRect(random()*w,random()*h,1+random()*3,1);}
    c.strokeStyle='#a45448';c.lineWidth=2;c.strokeRect(13,15,230,226);
    for(let row=0;row<13;row++)for(let x=25;x<213;){
      const len=6+random()*21,y=29+row*16;c.strokeStyle=row%5?'#716353':'#914b3c';c.lineWidth=1.6;
      c.beginPath();for(let j=0;j<len;j+=2)c.lineTo(x+j,y-Math.sin(j*1.7)*2-random()*3);c.stroke();x+=len+5;
    }
  });
  return {
    wood:new THREE.MeshStandardMaterial({map:wood,bumpMap:wood,bumpScale:.07,roughness:.76}),
    books:new THREE.MeshStandardMaterial({map:binding,roughness:.69}),
    cap:new THREE.MeshStandardMaterial({map:hide,bumpMap:hide,bumpScale:.18,roughness:.52,emissive:0x173b40,emissiveIntensity:.35}),
    stem:new THREE.MeshStandardMaterial({map:fiber,bumpMap:fiber,bumpScale:.17,roughness:.89}),
    gills:new THREE.MeshStandardMaterial({color:0xb7ccaa,emissive:0x337c74,emissiveIntensity:.38,roughness:.79,side:THREE.DoubleSide}),
    manuscript
  };
}

export function volumes(put,width,cx,sy,seed,finish) {
  const count=Math.max(1,Math.round(width/1.15)), pitch=width/count;
  for(let i=0;i<count;i++){
    const phase=seed*407+i*27.31, h=3.45+.65*Math.sin(phase),z=.27*Math.cos(phase);
    const ge=new THREE.BoxGeometry(pitch*.95,h,2.55);
    const uv=ge.attributes.uv,slot=(i+Math.floor(seed*16))%16;
    for(let j=0;j<uv.count;j++){
      const pageEdge=Math.abs(ge.attributes.normal.getY(j))>.5;
      uv.setXY(j,(slot+.08+.84*uv.getX(j))/16,pageEdge?.012+.067*uv.getY(j):.12+.87*uv.getY(j));
    }
    put(ge.translate(cx-width/2+(i+.5)*pitch,sy+.25+h/2,z),finish.books);
  }
}

export function giantMushroom(K,x,y,z,h,r,lean,finish) {
  // Both surfaces meet at the same rippled cap edge. The underside is fluted radially.
  const phase=x*.39+z*.21, cx=x-Math.sin(lean)*h*.5, cy=y+h-1;
  const rim=a=>1+.045*Math.sin(5*a+phase)+.027*Math.cos(9*a-phase);
  const edge=a=>r*(.028*Math.cos(4*a+phase)+.021*Math.sin(7*a));
  function skin(count,rows,point,material){
    const pos=[],uv=[],idx=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=count;i++){
      const u=i/count,v=j/rows;pos.push(...point(u*2*Math.PI,v));uv.push(u,1-v);
      const k=pos.length/3-1;if(i&&j)idx.push(k-count-2,k,k-1,k-count-2,k-count-1,k);
    }
    const ge=new THREE.BufferGeometry();ge.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));ge.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));ge.setIndex(idx);ge.computeVertexNormals();K.add(ge,material);
  }
  skin(64,14,(a,v)=>{
    const radius=r*Math.sin(v*Math.PI/2)*rim(a);
    return [cx+Math.cos(a)*radius,cy+r*.50*Math.cos(v*Math.PI/2)+edge(a)*v*v, z+Math.sin(a)*radius];
  },finish.cap);
  skin(168,7,(a,v)=>{
    const f=1-v*.9,radius=r*f*rim(a),fold=(.5+.5*Math.cos(a*42+.48*Math.sin(v*5+a*2)))**3;
    return [cx+Math.cos(a)*radius,cy+edge(a)*f-r*.19*(1-f)-r*.12*fold*Math.sin(Math.PI*v)**.6,z+Math.sin(a)*radius];
  },finish.gills);
  const profile=[[.30,-.06],[.27,.04],[.18,.15],[.128,.50],[.11,.80],[.145,.94],[.19,.98]];
  const stalk=new THREE.LatheGeometry(profile.map(([w,v])=>new THREE.Vector2(r*w,v*h)),32);
  const pos=stalk.attributes.position;
  for(let i=0;i<pos.count;i++){
    const v=pos.getY(i)/h,a=Math.atan2(pos.getZ(i),pos.getX(i)),rib=1+.06*Math.cos(a*9+v*2);
    pos.setXYZ(i,x+pos.getX(i)*rib+(cx-x)*v+Math.sin(v*Math.PI)*r*.09,pos.getY(i)+y,z+pos.getZ(i)*rib);
  }
  stalk.computeVertexNormals();K.add(stalk,finish.stem);
}

export function paperCranes(rnd,parchment,time) {
  const pos=[],uv=[],col=[],hinge=[];
  function fold(a,b,c,shade,wing=0){
    for(const p of [a,b,c]){
      pos.push(...p);col.push(shade,shade*.97,shade*.91);
      uv.push(.5+p[0]/8.8,.5+p[2]/7.8);hinge.push(wing);
    }
  }
  for(const s of [-1,1]){
    const breast=[0,.43,1.15],keel=[0,-.62,.15],root=[s*.56,.10,.33],back=[0,.52,-1.35],tail=[0,1.12,-2.95];
    fold(breast,keel,root,.78);fold(root,back,keel,.68);fold(back,root,breast,.97);fold(back,keel,tail,.78);
    const joint=[s*1.55,.67,-.52], tip=[s*3.7,1.33,-1.53], trailing=[s*1.45,.16,-1.65];
    fold(root,joint,tip,.94,1);fold(root,tip,trailing,.72,1);fold(root,trailing,back,.86,1);
    const neck=[0,1.8,1.96],beak=[0,1.39,2.82],n=[s*.23,1.48,1.83];
    fold(breast,neck,n,.95);fold(root,breast,n,.84);fold(neck,beak,n,.72);
  }
  const geo=new THREE.BufferGeometry();
  for(const [name,data,size] of [['position',pos,3],['uv',uv,2],['color',col,3],['wing',hinge,1]])geo.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
  geo.computeVertexNormals();
  const paper=new THREE.MeshStandardMaterial({map:parchment,side:THREE.DoubleSide,vertexColors:true,roughness:.92});
  paper.onBeforeCompile=shader=>{
    shader.uniforms.paperTime=time;
    shader.vertexShader='attribute float wing; uniform float paperTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      float phase=instanceMatrix[3].x*.31+instanceMatrix[3].z*.17;
      transformed.y+=wing*max(0.,abs(position.x)-.56)*(.07+.28*sin(paperTime*2.8+phase));
      transformed.y+=.44*sin(paperTime*1.2+phase);
    `);
  };
  const flock=new THREE.InstancedMesh(geo,paper,50),obj=new THREE.Object3D();
  for(let i=0;i<50;i++){
    const a=i/50*Math.PI*2,r=10+rnd()*26;
    obj.position.set(Math.cos(a)*r,(rnd()-.5)*14,Math.sin(a)*r);
    obj.rotation.set(.09*Math.sin(i),Math.PI-a,.18*Math.sin(i*2.3),'YXZ');obj.scale.setScalar(.82+.18*Math.cos(i*1.4));obj.updateMatrix();flock.setMatrixAt(i,obj.matrix);
  }
  flock.computeBoundingSphere();flock.boundingSphere.radius+=2;flock.raycast=()=>{};return flock;
}

export function ripplingPool(time,noise) {
  const mat=new THREE.MeshStandardMaterial({color:0x43818a,roughness:.27,metalness:.12,emissive:0x103b40,emissiveIntensity:.4});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.poolTime=time;shader.uniforms.poolNoise=noise;
    shader.vertexShader='varying vec2 poolXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npoolXZ=(modelMatrix*vec4(position,1.)).xz;');
    shader.fragmentShader='varying vec2 poolXZ;uniform float poolTime;uniform sampler2D poolNoise;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 p=poolXZ*.035;
      float n=texture2D(poolNoise,p*.27).r;
      float ripple=sin(12.*p.x+5.*p.y+11.*n+poolTime*1.7)+.5*sin(6.*p.x-8.*p.y+9.*n-poolTime*1.25);
      diffuseColor.rgb*=.58+.64*n+.12*ripple;
      diffuseColor.rgb+=vec3(.075,.15,.16)*smoothstep(.83,1.45,ripple);
    `);
  };return mat;
}
