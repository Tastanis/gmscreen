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
function scrollArt(college,entries,renderer) {
  const w=1024,h=640,cv=document.createElement('canvas');cv.width=768;cv.height=480;
  const c=cv.getContext('2d');c.scale(.75,.75);const wash=c.createLinearGradient(0,0,w,h);
  for(const [u,color] of [[0,'#c9a773'],[.12,'#e6cca0'],[.48,'#f5e5bf'],[.84,'#e5cda0'],[1,'#bd975f']])wash.addColorStop(u,color);
  c.fillStyle=wash;c.fillRect(0,0,w,h);
  let seed=117;const random=()=>((seed=seed*16807%2147483647)/2147483647);
  for(let i=0;i<9000;i++){c.fillStyle=random()<.5?'rgba(92,59,27,.055)':'rgba(255,249,215,.11)';c.fillRect(random()*w,random()*h,1+random()*4,1);}
  c.strokeStyle='#a08049';c.lineWidth=2;c.strokeRect(18,12,w-36,h-24);
  c.strokeStyle=college.color;c.lineWidth=3;c.strokeRect(26,20,w-52,h-40);
  c.strokeStyle=college.color;crest(c,college.glyph,102,66);
  c.fillStyle=college.color;c.textAlign='center';c.font='bold 88px Georgia';c.fillText(college.name,556,96,815);
  c.beginPath();c.moveTo(68,116);c.lineTo(956,116);c.stroke();
  const {rows,cw,line}=pageLayout(entries);
  c.font=Math.min(30,line*.79)+'px Georgia';c.fillStyle='#392b20';c.textAlign='left';
  entries.forEach((e,i)=>{const col=Math.floor(i/rows),row=i%rows;c.fillText(e.label,60+col*cw,146+(row+.63)*line,cw-20);});
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
function pageLayout(entries){
  const cols=entries.length>15?2:1,rows=Math.ceil(entries.length/cols);
  return {cols,rows,cw:912/cols,line:Math.min(44,485/rows)};
}
function entriesFor(things,name) {
  const entries=things.filter(t=>t.campus===name);
  return entries.map(thing=>{
    const hex=thing.hexes[0],duplicate=entries.some(t=>t!==thing&&t.name===thing.name);
    return {thing,label:duplicate&&hex?thing.name+' ('+hex.q+', '+hex.r+')':thing.name};
  }).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
}
export function installCampusTable({scene,renderer,things,width,depth,anim,travel,overview,canNavigate}) {
  const top=26,root=new THREE.Group();root.name='Strixhaven war table';scene.add(root);
  buildDesk(root,renderer,width,depth,top,tableMargin);
  const panel=document.getElementById('scrollReader'), launcher=document.getElementById('scrollLauncher');
  const title=panel.querySelector('h2'),list=panel.querySelector('.scroll-entries'),back=panel.querySelector('.scroll-back');
  const objects=[],scrolls=[];let current=null,timer=0,paperTimer=0;
  const brass=new THREE.MeshStandardMaterial({color:0xb4904e,metalness:.55,roughness:.38});
  const wood=new THREE.MeshStandardMaterial({color:0x553321,roughness:.62});
  const tube=new THREE.CylinderGeometry(1,1,1,20).rotateZ(Math.PI/2);
  for(const college of colleges){
    const entries=entriesFor(things,college.name),g=new THREE.Group();
    const W=college.side?1050:1120,H=640,short=166;
    g.name='Campus scroll · '+college.name;
    g.position.set(college.side?college.side*(width/2+811):width*college.north,top+9,college.side?depth/2*college.z:-(depth/2+620));root.add(g);
    const map=scrollArt(college,entries,renderer),page=new THREE.Mesh(new THREE.PlaneGeometry(W,H).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map,roughness:.91}));
    g.add(page);
    const parchment=new THREE.MeshStandardMaterial({color:0xd5b784,roughness:.91});
    const rolls=[-1,1].map(sign=>{const bar=new THREE.Group();g.add(bar);const add=(material,x,length,radius)=>{const m=new THREE.Mesh(tube,material);m.position.x=x;m.scale.set(length,radius,radius);bar.add(m);return m;};
      add(wood,0,W+62,13);add(parchment,0,W+5,22);for(const sd of [-1,1])add(brass,sd*(W/2+23),12,19);
      bar.position.y=12;return bar;});
    const book={college,entries,g,page,rolls,map,H,short,openness:0}; scrolls.push(book);
    const hit=new THREE.Mesh(new THREE.PlaneGeometry(W+78,H).rotateX(-Math.PI/2));hit.visible=false;g.add(hit);hit.userData.book=book;objects.push(hit);book.hit=hit;
    pose(book,0);
  }
  function pose(b,t){
    const length=b.short+(b.H-b.short)*t;
    b.page.scale.z=length/b.H;
    b.map.repeat.y=length/b.H;b.map.offset.y=1-length/b.H;
    b.rolls[0].position.z=-length/2;b.rolls[1].position.z=length/2;
    b.hit.scale.z=(length+45)/b.H;b.hit.position.y=18;
  }
  anim.push((time,dt)=>{for(const b of scrolls){const target=b===current?1:0;if(b.openness===target)continue;
    const delta=Math.min(Math.abs(target-b.openness),3*Math.min(dt||.016,.1));b.openness+=Math.sign(target-b.openness)*delta;pose(b,b.openness);}});
  function cancel(){clearTimeout(timer);clearTimeout(paperTimer);}
  function close(){cancel();current=null;panel.hidden=true;launcher.setAttribute('aria-expanded','false');}
  function button(label,action){const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=action;return el;}
  function open(book,focus=false){
    if(!canNavigate())return;
    cancel();current=book;panel.hidden=false;launcher.setAttribute('aria-expanded','true');
    panel.classList.toggle('scroll-left',book?.college.side===1);panel.style.setProperty('--seal',book?.college.color||'#76572c');title.textContent=book?.college.name||'Campus scrolls';
    back.hidden=!book;list.replaceChildren();
    const items=book?book.entries:scrolls;
    for(const item of items){
      const el=button(book?item.label:item.college.name,()=>{if(book){close();travel(item.thing);}else open(item,true);});
      if(book){
        el.addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse')return;clearTimeout(timer);timer=setTimeout(()=>{if(current===book&&canNavigate()){travel(item.thing);}},650);});
        el.addEventListener('pointerleave',()=>clearTimeout(timer));
      }
      list.append(el);
    }
    list.scrollTop=0;if(focus)list.firstElementChild?.focus({preventScroll:true});
  }
  launcher.onclick=()=>{if(!canNavigate())return;if(!panel.hidden){close();return;}overview();open(null,true);};
  back.onclick=()=>{overview();open(null,true);};
  panel.querySelector('.scroll-close').onclick=()=>{close();launcher.focus({preventScroll:true});};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){close();launcher.focus({preventScroll:true});}});
  function hit(ray,distance){
    const hit=ray.intersectObjects(objects,false)[0];
    if(!hit||hit.distance>=distance)return null;
    const book=hit.object.userData.book;
    let item=null;
    if(book===current&&book.openness>.99){
      const paper=ray.intersectObject(book.page,false)[0];
      if(paper){
        const {cols,rows,cw,line}=pageLayout(book.entries);
        const col=Math.floor((paper.uv.x*1024-56)/cw),row=Math.floor(((1-paper.uv.y)*640-146)/line);
        if(col>=0&&col<cols&&row>=0&&row<rows)item=book.entries[col*rows+row]||null;
      }
    }
    return {book,item};
  }
  function hover(hit){
    clearTimeout(paperTimer);
    if(hit?.item)paperTimer=setTimeout(()=>{if(current===hit.book&&canNavigate())travel(hit.item.thing);},650);
  }
  function activate({book,item}){
    if(item){close();travel(item.thing);}
    else open(book,true);
  }
  return {close,activate,hover,hit};
}
