import * as THREE from 'three';
import { buildDesk } from './campus-desk.js';

export const tableMargin = {x:1450,z:1090};
const colleges = [
  {name:'Lorehold', color:'#933f2b', glyph:'pillar', side:-1, z:-.48},
  {name:'Prismari', color:'#404d83', glyph:'flame', side:-1, z:.55},
  {name:'Quandrix', color:'#246556', glyph:'knot', north:-.29},
  {name:'Central Campus', color:'#76572c', glyph:'sun', north:.32},
  {name:'Silverquill', color:'#503956', glyph:'quill', side:1, z:-.48},
  {name:'Witherbloom', color:'#495929', glyph:'leaf', side:1, z:.55},
];
function crest(c,key,x,y) {
  c.save();c.translate(x,y);c.lineWidth=3;
  c.beginPath();c.arc(0,0,34,0,2*Math.PI);c.stroke();
  c.beginPath();c.arc(0,0,29,0,2*Math.PI);c.stroke();
  const forms={
    pillar:'M-17 -15H17 M-15 -10H15 M-11 -7V14 M-5 -7V14 M5 -7V14 M11 -7V14 M-16 17H16',
    flame:'M-1 21Q-25 13 -10 -5Q-4 -11 -7 -20Q7 -13 6 0Q14 -4 13 -12Q27 10 -1 21Z M-1 14Q-8 7 1 0',
    knot:'M0 -22L21 11H-21Z M0 22L-21 -11H21Z',
    sun:'M0 -24L5 -7L18 -16L8 -3L24 0L8 4L17 17L4 8L0 24L-4 8L-18 17L-9 4L-24 0L-8 -4L-17 -17L-4 -8Z',
    quill:'M-14 21Q-2 -8 18 -20Q19 6 -7 12L-14 21Z M-9 13L12 -12 M2 2L12 0',
    leaf:'M-3 21V-8 M-2 4Q-20 5 -21 -9Q-4 -11 -2 4Z M-2 -4Q0 -21 15 -21Q13 -5 -2 -4Z M-2 15Q5 -1 22 0Q18 13 -2 15Z'
  };c.stroke(new Path2D(forms[key]));c.restore();
}
const inkWidth = 1024;
const inset = 56;
const firstRow = 138;

function layoutFor(college, count) {
  const columns = !college.side && count > 12 ? 2 : 1;
  const rows = Math.ceil(count / columns);
  const line = columns === 2 ? 39 : 48;
  const height = firstRow + rows * line + 45;
  return {columns, rows, line, height, columnWidth:(inkWidth - 2 * inset) / columns};
}

function scrollArt(college, entries, layout, renderer) {
  const {height, rows, columnWidth, line} = layout;
  const canvas = document.createElement('canvas');
  canvas.width = inkWidth;
  canvas.height = height;
  const c = canvas.getContext('2d'), wash = c.createLinearGradient(0,0,inkWidth,height);
  for (const [stop,color] of [[0,'#c9a773'],[.12,'#e6cca0'],[.48,'#f5e5bf'],[.84,'#e5cda0'],[1,'#bd975f']]) wash.addColorStop(stop,color);
  c.fillStyle=wash;c.fillRect(0,0,inkWidth,height);
  let seed=117;const random=()=>((seed=seed*16807%2147483647)/2147483647);
  for(let i=0;i<9000;i++){c.fillStyle=random()<.5?'rgba(92,59,27,.055)':'rgba(255,249,215,.11)';c.fillRect(random()*inkWidth,random()*height,1+random()*4,1);}
  c.strokeStyle='#a08049';c.lineWidth=2;c.strokeRect(18,12,inkWidth-36,height-24);
  c.strokeStyle=college.color;c.lineWidth=3;c.strokeRect(26,20,inkWidth-52,height-40);
  crest(c,college.glyph,102,66);
  c.fillStyle=college.color;c.textAlign='center';c.font='bold 82px Georgia';c.fillText(college.name,556,97,815);
  c.beginPath();c.moveTo(inset,118);c.lineTo(inkWidth-inset,118);c.stroke();
  c.font=(line*.79)+'px Georgia';c.fillStyle='#302319';c.textAlign='left';
  entries.forEach(({label},i)=>{
    const col=Math.floor(i/rows),row=i%rows;
    c.fillText(label,inset+6+col*columnWidth,firstRow+(row+.76)*line,columnWidth-14);
  });
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return map;
}

function entriesFor(things,name) {
  const entries=things.filter(t=>t.campus===name);
  return entries.map(thing=>{
    const hex=thing.hexes[0],duplicate=entries.some(t=>t!==thing&&t.name===thing.name);
    return {thing,label:duplicate&&hex?thing.name+' ('+hex.q+', '+hex.r+')':thing.name};
  }).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
}

export function installCampusTable({scene, renderer, things, width, depth, travel, overview, anim, canNavigate}) {
  const top=26,root=new THREE.Group();
  root.name='Strixhaven war table';scene.add(root);buildDesk(root,renderer,width,depth,top,tableMargin);
  const brass=new THREE.MeshStandardMaterial({color:0xb4904e,metalness:.55,roughness:.38});
  const wood=new THREE.MeshStandardMaterial({color:0x553321,roughness:.62});
  const parchment=new THREE.MeshStandardMaterial({color:0xd5b784,roughness:.91});
  const tube=new THREE.CylinderGeometry(1,1,1,20).rotateZ(Math.PI/2);
  const pages=[],books=[];
  for(const college of colleges){
    const entries=entriesFor(things,college.name),layout=layoutFor(college,entries.length);
    const w=college.side?1140:1360,h=w*layout.height/inkWidth;
    const g=new THREE.Group();
    g.name='Campus scroll · '+college.name;
    g.position.set(college.side?college.side*(width/2+811):width*college.north,top+9,college.side?depth/2*college.z:-(depth/2+620));
    root.add(g);
    const map=scrollArt(college,entries,layout,renderer);
    const page=new THREE.Mesh(new THREE.PlaneGeometry(w,h).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map,roughness:.91}));
    g.add(page);pages.push(page);
    const book={college,entries,layout,g,page,w,h};books.push(book);page.userData.book=book;
    for(const sign of [-1,1]){
      const bar=new THREE.Group();bar.position.set(0,12,sign*h/2);g.add(bar);
      function spindle(material,x,length,radius){
        const part=new THREE.Mesh(tube,material);
        part.position.x=x;part.scale.set(length,radius,radius);bar.add(part);
      }
      spindle(wood,0,w+62,13);spindle(parchment,0,w+5,22);
      for(const end of [-1,1])spindle(brass,end*(w/2+23),12,19);
    }
  }
  // A single translucent wash follows the selected printed line on the table.
  const mark=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color:0x967640,transparent:true,opacity:.24,depthWrite:false}));
  root.add(mark);mark.visible=false;
  function highlight(book,index){
    mark.visible=index>=0;
    if(!mark.visible)return;
    const {rows,columnWidth,line}=book.layout, scale=book.w/inkWidth;
    mark.scale.set((columnWidth-5)*scale,1,line*scale);
    mark.position.set(book.g.position.x-book.w/2+(inset+(Math.floor(index/rows)+.5)*columnWidth)*scale,
      book.g.position.y+1,book.g.position.z-book.h/2+(firstRow+(index%rows+.5)*line)*scale);
  }
  function hit(ray,distance){
    const paper=ray.intersectObjects(pages,false)[0];
    if(!paper||paper.distance>=distance)return null;
    const book=paper.object.userData.book,{columnWidth,rows,columns,height,line}=book.layout;
    const col=Math.floor((paper.uv.x*inkWidth-inset)/columnWidth);
    const row=Math.floor(((1-paper.uv.y)*height-firstRow)/line);
    const item=col>=0&&col<columns&&row>=0&&row<rows?book.entries[col*rows+row]:null;
    return item || (1-paper.uv.y)*height < firstRow ? {book,item} : null;
  }
  const panel=document.getElementById('pinnedScroll');
  const heading=panel.querySelector('h2'), list=panel.querySelector('.scroll-entries');
  const launcher=document.getElementById('scrollLauncher'), status=document.getElementById('scrollStatus');
  let pinned=null, bookIndex=-1, rowIndex=-1, previewItem=null, menuItem=null;
  const beam=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{strength:{value:0}},
    vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec4 base=modelViewMatrix*vec4(0.,0.,0.,1.);
        float height=clamp(length(base.xyz)*.65,175.,960.);
        // Keep the shaft legible even when looking down on its destination.
        vec3 axis=mat3(viewMatrix)*vec3(0.,height,0.);
        axis.xy+=height*vec2(.12,.22);
        vec2 across=normalize(vec2(axis.y,-axis.x));
        vec4 p=base+vec4(axis*uv.y,0.);
        p.xy+=across*position.x*height*.29;
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`
      varying vec2 vUv;
      uniform float strength;
      void main(){
        // Shape the cone in the fragment shader so both triangles share one smooth gradient.
        float width=mix(.42,1.,vUv.y);
        float lateral=(vUv.x-.5)*2./width;
        float core=exp(-5.*lateral*lateral);
        float halo=1.-smoothstep(.15,1.,abs(lateral));
        float ends=smoothstep(0.,.035,vUv.y)*(1.-smoothstep(.56,1.,vUv.y));
        float alpha=(.62*core+.24*halo)*ends;
        gl_FragColor=vec4(mix(vec3(1.,.66,.24),vec3(1.,.89,.60),core),strength*alpha);
      }`
  }));
  beam.name='Campus scroll destination ray';
  beam.frustumCulled=false;beam.visible=false;root.add(beam);
  function preview(book,item){
    if(item!==previewItem)beam.material.uniforms.strength.value=0;
    previewItem=item;
    beam.visible=Boolean(item);
    if(item)highlight(book,book.entries.indexOf(item));
    else mark.visible=false;
  }
  anim.push((time,dt)=>{
    if(!previewItem)return;
    const t=previewItem.thing;
    if(t.focusObject)t.focusObject.getWorldPosition(beam.position);
    else beam.position.set(t.x,t.group.position.y+THREE.MathUtils.clamp(t.labelY-t.group.position.y,10,100),t.z);
    beam.material.uniforms.strength.value=Math.min(1,beam.material.uniforms.strength.value+dt*9);
  });
  function endPreview(){menuItem=null;preview(null,null);}
  function close(){
    endPreview();pinned=null;panel.hidden=true;list.replaceChildren();
    bookIndex=rowIndex=-1;status.textContent='';
  }
  function visit(item){
    if(!canNavigate())return;
    endPreview();travel(item.thing);
  }
  function pin(book,focus=false){
    if(!canNavigate())return;
    endPreview();pinned=book;bookIndex=books.indexOf(book);rowIndex=-1;
    heading.textContent=book.college.name;
    panel.style.setProperty('--seal',book.college.color);
    list.replaceChildren();
    for(const item of book.entries){
      const button=document.createElement('button');
      button.type='button';button.textContent=item.label;
      const show=()=>{if(canNavigate()){menuItem=item;preview(book,item);}};
      const leave=()=>{if(menuItem===item)endPreview();};
      button.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')show();});
      button.addEventListener('pointerleave',leave);
      button.addEventListener('focus',()=>{if(button.matches(':focus-visible'))show();});
      button.addEventListener('blur',leave);
      button.onclick=()=>visit(item);
      list.append(button);
    }
    panel.hidden=false;list.scrollTop=0;
    if(focus)panel.querySelector('.scroll-close').focus({preventScroll:true});
  }
  function dismiss(){close();launcher.focus({preventScroll:true});}
  panel.querySelector('.scroll-close').onclick=dismiss;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pinned){e.preventDefault();dismiss();}});
  panel.addEventListener('keydown',e=>{
    if(!['ArrowDown','ArrowUp'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    const buttons=Array.from(list.children),i=buttons.indexOf(document.activeElement);
    buttons[(i<0?(e.key==='ArrowDown'?0:buttons.length-1):(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length)]?.focus();
  });
  function hover(hit){
    if(menuItem)return;
    preview(hit?.book,hit?.item??null);
  }
  renderer.domElement.addEventListener('pointerleave',()=>{if(!menuItem)endPreview();});
  function activate({book,item}){
    if(!canNavigate())return;
    if(item)visit(item);else pin(book,true);
  }
  launcher.onclick=()=>{if(canNavigate()){close();overview();}};
  launcher.addEventListener('keydown',e=>{
    if(!canNavigate())return;
    if(!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Enter','Escape'].includes(e.key))return;
    if(e.key==='Enter'&&bookIndex<0)return;
    e.preventDefault();e.stopPropagation();
    if(e.key==='Escape'){launcher.click();return;}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'||bookIndex<0){
      const next=bookIndex<0?0:(bookIndex+(e.key==='ArrowLeft'?-1:1)+books.length)%books.length;
      pin(books[next]);
    }else if(e.key==='Enter'){
      if(rowIndex>=0)visit(books[bookIndex].entries[rowIndex]);
      else pin(books[bookIndex],true);
    }else{
      const book=books[bookIndex];
      rowIndex=rowIndex<0?(e.key==='ArrowUp'?book.entries.length-1:0):(rowIndex+(e.key==='ArrowUp'?-1:1)+book.entries.length)%book.entries.length;
      menuItem=book.entries[rowIndex];preview(book,menuItem);
      list.children[rowIndex].scrollIntoView({block:'nearest'});
    }
    status.textContent=books[bookIndex].college.name+(rowIndex>=0?', '+books[bookIndex].entries[rowIndex].label:'');
  });
  return {clear:close,activate,hover,hit};
}
