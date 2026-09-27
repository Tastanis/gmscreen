import {collisionRequest} from '../services/collision-effects.js';
import {playTokenFallAnimation} from './token-fall-animation.js';
export function fallDamage(squares,agility=0,forcedDown=false){
 const effective=Math.max(0,squares-(forcedDown?0:agility));return effective<2?0:Math.min(50,2*effective);
}
export function ownsFall(record,user,scene){return record.kind==='fall'&&record.status==='pending'&&record.actorId.toLowerCase()===String(user).toLowerCase()&&record.sceneId===scene;}
export function mountFallReview({context,placement,traits,damage,prone,api=collisionRequest}){
 let busy=false,popup=null,disposed=false;
 const tick=async()=>{
  if(disposed)return;
  try{
   if(busy||popup||document.hidden)return;
   busy=true;const c=context();if(!c?.userId)return;
   const records=await api(),record=records.find(r=>ownsFall(r,c.userId,c.sceneId));if(!record)return;
   const faller=placement(record.targetId);if(!faller)return;
   const stats=await traits(faller),details=record.details||{},targets=[{id:record.targetId,name:faller.name||'Token',prone:true}];
   for(const id of details.collidedIds||[]){const p=placement(id);if(!p)throw Error('Fall target is unavailable; GM review is required.');const t=await traits(p);targets.push({id,name:p.name||'Creature',prone:(Number.parseFloat(stats.size)||1)>Number(t.might||0)});}
   if(context().sceneId!==record.sceneId)return;
   const token=[...document.querySelectorAll('[data-placement-id]')].find(e=>e.dataset.placementId===record.targetId);
   await playTokenFallAnimation(token);
   const panel=document.createElement('div');popup=panel;panel.dataset.fallReview='';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Review fall');
   Object.assign(panel.style,{position:'fixed',zIndex:100010,background:'#24252b',color:'#fff',padding:'12px',border:'1px solid #d9b363',borderRadius:'6px',width:'280px',boxShadow:'0 3px 20px #0009'});
   const bounds=token?.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(innerWidth-300,bounds?.right??20))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-210,bounds?.top??20))+'px';
   const summary=document.createElement('p');summary.textContent=`Fell ${details.squares} squares − Agility ${details.forcedDown?0:stats.agility||0}. ${targets.map(t=>t.name+(t.prone?' + Prone':'')).join('; ')}${details.needsPlacementReview?' — GM must choose a free landing space.':''}`;
   const label=document.createElement('label');label.textContent='Damage per creature ';const input=document.createElement('input');input.type='number';input.min='0';input.max='1000000';input.step='1';input.value=fallDamage(details.squares,Number(stats.agility)||0,details.forcedDown);input.style.width='75px';label.append(input);
   const status=document.createElement('p'),apply=document.createElement('button'),dismiss=document.createElement('button');apply.textContent='Apply';dismiss.textContent='Dismiss';apply.className=dismiss.className='btn';
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
   panel.append(summary,label,status,apply,dismiss);document.body.append(panel);
  }catch(error){console.error('Fall review unavailable',error);}finally{busy=false;if(!disposed)setTimeout(tick,4000);}
 };
 setTimeout(tick,2000);return ()=>{disposed=true;popup?.remove();};
}
