import {floorElevations} from '../state/normalize/floor-elevation.js';
import {floorSupported,intersectsFloor,resolveSupportSurfaces,terrainFloorContact} from './floor-support.js';
import {wallCubeModel} from './wall-cubes.js';
export function teleportDistance(from,to,startHeight,endHeight){return Math.max(Math.abs(to.column-from.column),Math.abs(to.row-from.row),Math.abs(endHeight-startHeight));}
export function teleportSurfaces({from,to,context,ground}){
 const sceneId=context.state.boardState.activeSceneId,config=context.state.boardState.sceneState?.[sceneId]||{},model=wallCubeModel(config.environment?.walls?.value,context.state.boardState.templates?.[sceneId]||[],config,ground),surfaces=resolveSupportSurfaces(model),heights=floorElevations(config.mapLevels);
 const x=to.column+(from.width||1)/2,y=to.row+(from.height||1)/2,p={...from,...to};
 const contact=terrainFloorContact(p,surfaces,config.mapLevels,ground(x,y));
 const choices=contact?[]:[{height:ground(x,y),label:'Ground',levelId:'level-0'}];
 for(const l of config.mapLevels?.levels||[]){
  if(l.hidden&&!context.isGM)continue;
  const support=floorSupported({...p,levelId:l.id},surfaces,l.cutouts||[]);
  const centerInHole=(l.cutouts||[]).some(c=>p.column>=c.column&&p.row>=c.row&&p.column+(p.width||1)<=c.column+c.width&&p.row+(p.height||1)<=c.row+c.height);
  if(support===null&&!centerInHole)choices.push({height:heights.get(l.id),label:l.name||'Floor',levelId:l.id});
 }
 for(const s of surfaces){if((config.mapLevels?.levels||[]).some(l=>l.id===s.levelId&&l.hidden&&!context.isGM))continue;if(intersectsFloor(p,s,(config.mapLevels?.levels||[]).find(l=>l.id===s.levelId)?.cutouts||[]))choices.push({height:s.height,label:s.templateCube?'Wall':s.kind==='floor'?'Floor':'Roof',levelId:s.levelId||'level-0',surfaceId:s.id});}
 // Match WallCubes::assertDestination. Buried lids and terrain inside a stack
 // are not landing choices; empty space beneath a floating cube remains usable.
 const bodyHeight=Math.max(p.width||1,p.height||1),cubes=surfaces.filter(s=>s.templateCube);
 const legalChoices=choices.filter(c=>!cubes.some(s=>c.height<s.height-1e-7&&c.height+bodyHeight>s.base+1e-7&&intersectsFloor(p,s)));
 legalChoices.sort((a,b)=>Number(!!b.surfaceId)-Number(!!a.surfaceId));
 const unique=legalChoices.filter((c,i)=>Number.isFinite(c.height)&&legalChoices.findIndex(v=>v.height===c.height)===i).sort((a,b)=>a.height-b.height);
 return unique;
}
export function chooseTeleportHeight({from,to,range=null,context,ground,startHeight,combatActive=false}){
 const unique=teleportSurfaces({from,to,context,ground}),x=to.column+(from.width||1)/2,y=to.row+(from.height||1)/2;
 const display=z=>Math.round(z)+1,air=['fly','hover'].includes(from.movementMode);
 if(!combatActive&&range===null&&!air&&unique.length===1&&Math.abs(unique[0].height-startHeight)<1e-6)return Promise.resolve({height:unique[0].height,range});
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.dataset.teleportChoice='';dialog.className='vtt-teleport-choice';dialog.setAttribute('aria-label','Teleport landing');
  const header=document.createElement('div');header.className='vtt-teleport-choice__header';
  const title=document.createElement('strong');title.textContent='Teleport';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='vtt-teleport-choice__cancel';cancel.textContent='Cancel';header.append(title,cancel);
  const info=document.createElement('div');info.className='vtt-teleport-choice__info';
  const start=document.createElement('span');start.textContent=`Current height ${display(startHeight)}`;info.append(start);
  if(range!==null){const limit=document.createElement('span');limit.textContent=`Teleport range ${Math.round(range)}`;info.append(limit);}
  const list=document.createElement('div');list.className='vtt-teleport-choice__locations';
  const controls=[];let armed=false,closed=false;
  const allowed=z=>range===null||teleportDistance(from,to,startHeight,z)<=range+1e-6;
  const finish=value=>{if(!armed||closed)return;closed=true;clearTimeout(timer);window.removeEventListener('resize',position);dialog.close();dialog.remove();resolve(value);};
  for(const choice of unique){
   const button=document.createElement('button');button.type='button';button.className='vtt-teleport-choice__location';
   const label=document.createElement('span');label.textContent=choice.label;const height=document.createElement('strong');height.textContent=display(choice.height);button.append(label,height);
   const legal=allowed(choice.height);button.classList.toggle('is-out-of-range',!legal);button.title=legal?`${choice.label}, height ${display(choice.height)}`:'Out of range';
   button.onclick=()=>finish({height:choice.height,range,allowOutOfRange:!legal});list.append(button);controls.push({button,legal});
  }
  const custom=document.createElement('div');custom.className='vtt-teleport-choice__custom';
  const label=document.createElement('label');label.textContent='Custom height';
  const input=document.createElement('input');input.type='number';input.step='1';input.setAttribute('aria-label','Teleport destination height');
  const preferred=unique.find(c=>c.levelId===(from.levelId||'level-0'))||unique[0];input.value=display(preferred?.height??startHeight);label.append(input);
  const go=document.createElement('button');go.type='button';go.textContent='Go';custom.append(label,go);
  const warning=document.createElement('div');warning.className='vtt-teleport-choice__warning';warning.setAttribute('aria-live','polite');
  function customHeight(){const value=input.valueAsNumber;return unique.find(c=>display(c.height)===value)?.height??value-1;}
  function update(){
   const z=customHeight(),landing=[...unique].reverse().find(c=>c.height<=z+1e-6),valid=Number.isInteger(input.valueAsNumber)&&!!landing;
   go.disabled=!armed||!valid;go.classList.toggle('is-out-of-range',Number.isFinite(z)&&!allowed(z));
   warning.textContent=!Number.isInteger(input.valueAsNumber)?'Use a whole square.':!landing?'Below ground.':!allowed(z)?'Out of range.':z>landing.height+.001?(air?'Arrive airborne.':`Fall ${Math.round(z-landing.height)} squares.`):'';
   warning.hidden=!warning.textContent;
  }
  go.onclick=()=>{if(!go.disabled)finish({height:customHeight(),range,allowOutOfRange:!allowed(customHeight())});};cancel.onclick=()=>finish(null);input.oninput=update;
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(!go.disabled)go.click();}};
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
  dialog.append(header,info,list,custom,warning);document.body.append(dialog);
  function position(){
   const transform=document.getElementById('vtt-map-transform'),rect=transform?.getBoundingClientRect(),view=context.view;
   const sx=rect&&transform.offsetWidth?rect.width/transform.offsetWidth:1,sy=rect&&transform.offsetHeight?rect.height/transform.offsetHeight:1;
   const cx=rect?rect.left+((view.gridOffsets?.left||0)+x*view.gridSize)*sx:innerWidth/2;
   const cy=rect?rect.top+((view.gridOffsets?.top||0)+y*view.gridSize)*sy:innerHeight/2;
   const gap=rect?Math.max(18,view.gridSize*sx*(from.width||1)/2+12):18;
   const box=dialog.getBoundingClientRect();let left=cx+gap;if(left+box.width>innerWidth-12)left=cx-gap-box.width;
   dialog.style.left=`${Math.max(12,Math.min(innerWidth-box.width-12,left))}px`;dialog.style.top=`${Math.max(12,Math.min(innerHeight-box.height-12,cy-box.height/2))}px`;
  }
  controls.forEach(c=>c.button.disabled=true);cancel.disabled=true;input.disabled=true;update();dialog.showModal();position();window.addEventListener('resize',position);
  const timer=setTimeout(()=>{armed=true;dialog.dataset.ready='true';controls.forEach(c=>c.button.disabled=false);cancel.disabled=false;input.disabled=false;update();position();},500);
 });
}
