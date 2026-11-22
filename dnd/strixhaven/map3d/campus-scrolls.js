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

export function installCampusTable({scene, renderer, camera, things, width, depth, travel, overview, glide, canNavigate}) {
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
    return {book,item};
  }
  let timer=0,mouseReady=false;
  function clear(){clearTimeout(timer);mark.visible=false;mouseReady=false;}
  function visit(item){clear();travel(item.thing);}
  function read(book){
    clear();
    const target=book.g.position.clone(), tilt=.16;
    const distance=1.1*Math.max(book.h,book.w/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))+book.h*Math.sin(tilt)/2;
    glide(target.clone().add(new THREE.Vector3(0,distance*Math.cos(tilt),distance*Math.sin(tilt))),target,.8);
  }
  renderer.domElement.addEventListener('pointermove',e=>{mouseReady=e.pointerType==='mouse'&&!e.buttons;});
  for(const event of ['pointerdown','pointerleave','wheel'])renderer.domElement.addEventListener(event,clear,{passive:true});
  function hover(hit){
    clearTimeout(timer);mark.visible=false;
    if(!hit?.item||!mouseReady)return;
    highlight(hit.book,hit.book.entries.indexOf(hit.item));
    timer=setTimeout(()=>{if(mouseReady&&canNavigate())visit(hit.item);},650);
  }
  function activate({book,item}){if(canNavigate()){if(item)visit(item);else read(book);}}

  const launcher=document.getElementById('scrollLauncher'),status=document.getElementById('scrollStatus');
  let bookIndex=-1,rowIndex=-1;
  launcher.onclick=()=>{if(canNavigate()){clear();bookIndex=rowIndex=-1;status.textContent='';overview();}};
  launcher.addEventListener('keydown',e=>{
    if(!canNavigate())return;
    if(!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Enter','Escape'].includes(e.key))return;
    if(e.key==='Enter'&&bookIndex<0)return;
    e.preventDefault();e.stopPropagation();
    if(e.key==='Escape'){launcher.click();return;}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'||bookIndex<0){
      bookIndex=bookIndex<0?0:(bookIndex+(e.key==='ArrowLeft'?-1:1)+books.length)%books.length;
      rowIndex=-1;read(books[bookIndex]);
    }else if(e.key==='Enter'){
      if(rowIndex>=0)visit(books[bookIndex].entries[rowIndex]);else read(books[bookIndex]);
    }else{
      const count=books[bookIndex].entries.length;
      rowIndex=rowIndex<0?(e.key==='ArrowUp'?count-1:0):(rowIndex+(e.key==='ArrowUp'?-1:1)+count)%count;
      highlight(books[bookIndex],rowIndex);
    }
    const book=books[bookIndex];
    status.textContent=book.college.name+(rowIndex>=0?', '+book.entries[rowIndex].label:'');
  });
  return {clear,activate,hover,hit};
}
