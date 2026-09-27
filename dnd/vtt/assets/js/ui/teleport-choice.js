import {floorElevations} from '../state/normalize/floor-elevation.js';
import {floorSupported,intersectsFloor} from './floor-support.js';
export function teleportDistance(from,to,startHeight,endHeight){return Math.max(Math.abs(to.column-from.column),Math.abs(to.row-from.row),Math.abs(endHeight-startHeight));}
export function chooseTeleportHeight({from,to,range=null,context,ground,startHeight}){
 const config=context.state.boardState.sceneState?.[context.state.boardState.activeSceneId]||{},surfaces=config.environment?.walls?.value?.roofs||[],heights=floorElevations(config.mapLevels);
 const x=to.column+(from.width||1)/2,y=to.row+(from.height||1)/2,p={...from,...to};
 const choices=[{height:ground(x,y),label:'Ground',levelId:'level-0'}];
 for(const l of config.mapLevels?.levels||[]){
  if(l.hidden&&!context.isGM)continue;
  const support=floorSupported({...p,levelId:l.id},surfaces,l.cutouts||[]);
  const centerInHole=(l.cutouts||[]).some(c=>p.column>=c.column&&p.row>=c.row&&p.column+(p.width||1)<=c.column+c.width&&p.row+(p.height||1)<=c.row+c.height);
  if(support??!centerInHole)choices.push({height:heights.get(l.id),label:l.name||'Floor',levelId:l.id});
 }
 for(const s of surfaces){if((config.mapLevels?.levels||[]).some(l=>l.id===s.levelId&&l.hidden&&!context.isGM))continue;if(intersectsFloor(p,s))choices.push({height:s.height,label:s.kind==='floor'?'Floor':'Roof',levelId:s.levelId||'level-0'});}
 const unique=choices.filter((c,i)=>Number.isFinite(c.height)&&choices.findIndex(v=>v.height===c.height)===i).sort((a,b)=>a.height-b.height);
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.dataset.teleportChoice='';dialog.style.cssText='max-width:380px;background:#24252b;color:white;border:1px solid #d9b363;border-radius:7px;padding:18px';
  const intro=document.createElement('p');intro.textContent=`Starting height ${startHeight+1}. Teleport distance ${range??'unlimited'}. Ground height ${choices[0].height+1}.`;
  const list=document.createElement('div');list.textContent='Choose a landing height: ';
  const input=document.createElement('input');input.type='number';input.step='.25';input.setAttribute('aria-label','Teleport destination height');input.style.width='80px';
  const preferred=unique.find(c=>c.levelId===(from.levelId||'level-0'))||unique[0];input.value=(preferred?.height??startHeight)+1;
  for(const choice of unique){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=`${choice.label}: ${choice.height+1}`;b.onclick=()=>{input.value=choice.height+1;update();};list.append(b);}
  const label=document.createElement('label');label.textContent='Destination height ';label.append(input);
  const warning=document.createElement('p'),confirm=document.createElement('button'),cancel=document.createElement('button');confirm.textContent='Teleport';cancel.textContent='Cancel';confirm.className=cancel.className='btn';
  function update(){const z=Number(input.value)-1,d=teleportDistance(from,to,startHeight,z),landing=[...unique].reverse().find(c=>c.height<=z+1e-6),air=['fly','hover'].includes(from.movementMode);confirm.disabled=!Number.isFinite(z)||!landing||(range!==null&&d>range+1e-6);
   warning.textContent=`Required distance: ${Math.round(d*100)/100}. `+(!landing?'Below the ground.':range!==null&&d>range?`Too far. Choose a height between ${Math.max(choices[0].height,startHeight-range)+1} and ${startHeight+range+1}, or cancel.`:z>landing.height+.001?(air?'You will arrive airborne.':`You will fall ${Math.round((z-landing.height)*100)/100} squares after arriving.`):'You will arrive on the selected surface.');
  }
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};confirm.onclick=()=>finish({height:Number(input.value)-1,range});cancel.onclick=()=>finish(null);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});input.oninput=update;
  dialog.append(intro,list,label,warning,confirm,cancel);document.body.append(dialog);update();dialog.showModal();
 });
}
