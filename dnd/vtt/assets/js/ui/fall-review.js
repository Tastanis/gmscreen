import {collisionRequest} from '../services/collision-effects.js';
import {playTokenFallAnimation} from './token-fall-animation.js';
export function fallDamage(squares,agility=0,forcedDown=false){
 const effective=Math.max(0,squares-(forcedDown?0:Math.max(0,agility)));return effective<2?0:Math.min(50,2*effective);
}
export function fallerLandsProne(details,agility=0){return !!details.collidedIds?.length||fallDamage(details.squares,agility,details.forcedDown)>0;}
export function landingTargetProne(fallerSize,targetMight){return (Number.parseFloat(fallerSize)||1)>Number(targetMight||0);}
export function ownsFall(record,user,scene){return record.kind==='fall'&&record.status==='pending'&&record.actorId.toLowerCase()===String(user).toLowerCase()&&record.sceneId===scene;}
export function nextReviewableFall(records,user,scene,placement){
 // Missing creatures require manual recovery. Keep their durable receipts, but
 // do not let one unavailable fall block every later review in this scene.
 return records.find(record=>ownsFall(record,user,scene)&&
  [record.targetId,...(record.details?.collidedIds||[])].every(id=>!!placement(id)));
}
export function mountFallReview({context,placement,traits,damage,prone,api=collisionRequest}){
 let busy=false,popup=null,disposed=false;
 const tick=async()=>{
  if(disposed)return;
  try{
   if(busy||popup||document.hidden)return;
   busy=true;const c=context();if(!c?.userId)return;
   const records=await api(),record=nextReviewableFall(records,c.userId,c.sceneId,placement);if(!record)return;
   const faller=placement(record.targetId);if(!faller)return;
   const stats=await traits(faller),details=record.details||{},targets=[{id:record.targetId,name:faller.name||'Token',prone:fallerLandsProne(details,Number(stats.agility)||0)}];
   for(const id of details.collidedIds||[]){const p=placement(id);if(!p)throw Error('Fall target is unavailable; GM review is required.');const t=await traits(p);targets.push({id,name:p.name||'Creature',prone:landingTargetProne(stats.size,t.might)});}
   if(context().sceneId!==record.sceneId)return;
   const token=[...document.querySelectorAll('#vtt-token-layer [data-placement-id]')].find(e=>e.dataset.placementId===record.targetId);
   await playTokenFallAnimation(token);
   const panel=document.createElement('div');popup=panel;panel.dataset.fallReview='';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Review fall');
   panel.className='vtt-fall-review';
   const title=document.createElement('strong');title.className='vtt-fall-review__title';title.textContent='Fall';
   const summary=document.createElement('div');summary.className='vtt-fall-review__summary';
   for(const [name,value] of [['Fell',`${Math.round(details.squares)} squares`],['Agility',`${details.forcedDown?0:Math.max(0,Number(stats.agility)||0)}`]]){
    const row=document.createElement('div'),key=document.createElement('span'),amount=document.createElement('strong');key.textContent=name;amount.textContent=value;row.append(key,amount);summary.append(row);
   }
   const affected=document.createElement('div');affected.className='vtt-fall-review__targets';
   for(const target of targets){const row=document.createElement('div'),name=document.createElement('span');name.textContent=target.name;row.append(name);if(target.prone){const condition=document.createElement('span');condition.className='vtt-fall-review__condition';condition.textContent='Will be prone';row.append(condition);}affected.append(row);}
   const label=document.createElement('label');label.className='vtt-fall-review__damage';label.textContent='Damage';const input=document.createElement('input');input.type='number';input.min='0';input.max='1000000';input.step='1';input.value=fallDamage(details.squares,Number(stats.agility)||0,details.forcedDown);label.append(input);
   const status=document.createElement('p');status.className='vtt-fall-review__status';status.setAttribute('aria-live','polite');if(details.needsPlacementReview)status.textContent='GM: choose a free landing space.';
   const actions=document.createElement('div');actions.className='vtt-fall-review__actions';const apply=document.createElement('button'),dismiss=document.createElement('button');apply.textContent='Apply';dismiss.textContent='Dismiss';apply.type=dismiss.type='button';dismiss.className='vtt-fall-review__dismiss';actions.append(dismiss,apply);
   const close=()=>{panel.remove();popup=null;};const key={operationId:record.operationId,targetId:record.targetId};
   dismiss.onclick=async()=>{apply.disabled=dismiss.disabled=true;try{await api({...key,action:'finish',status:'dismissed'});close();}catch(e){status.textContent='Dismissal unconfirmed. Reload to check the outcome.';}};
   apply.onclick=async()=>{
    const amount=Number(input.value);if(!Number.isInteger(amount)||amount<0||amount>1000000)return;
    if(context().sceneId!==record.sceneId){status.textContent='Return to the original scene before applying.';return;}
    apply.disabled=dismiss.disabled=input.disabled=true;
    try{const claim=await api({...key,action:'start'});if(!claim.granted)throw Error('This fall already needs review.');
     for(const target of targets){if(amount)await damage(target.id,amount,'');if(target.prone)await prone(target.id);}
     await api({...key,action:'finish',status:'completed'});close();
    }catch(e){try{await api({...key,action:'finish',status:'needs_review'});}catch{}status.textContent='Outcome uncertain. Check stamina and conditions in GM recovery; do not apply again.';}
   };
   panel.append(title,summary,affected,label,status,actions);document.body.append(panel);
   const bounds=token?.getBoundingClientRect(),box=panel.getBoundingClientRect();let left=(bounds?.right??20)+12;if(left+box.width>innerWidth-12)left=(bounds?.left??innerWidth)-box.width-12;
   panel.style.left=Math.max(12,Math.min(innerWidth-box.width-12,left))+'px';panel.style.top=Math.max(12,Math.min(innerHeight-box.height-12,bounds?.top??20))+'px';
  }catch(error){console.error('Fall review unavailable',error);}finally{busy=false;if(!disposed)setTimeout(tick,4000);}
 };
 setTimeout(tick,2000);return ()=>{disposed=true;popup?.remove();};
}
