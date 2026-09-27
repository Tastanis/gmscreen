export async function collisionRequest(request=null,operationId=null){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch('/dnd/vtt/api/v2/collision-effects.php'+(operationId?'?operationId='+encodeURIComponent(operationId):''),{method:request?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,...(request?{headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}:{})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Collision outcome unavailable.');return data.result;}finally{clearTimeout(timer);}
}
export async function settleCollisionEffects(operationId,apply,{api=collisionRequest}={}){
 if(!operationId)throw Error('Missing accepted movement receipt.');
 const records=await api(null,operationId);
 for(const record of records){
  if(record.kind==='fall')continue;
  if(record.status==='completed'||record.status==='dismissed')continue;
  const key={operationId,targetId:record.targetId};
  const claim=await api({...key,action:'start'});
  if(!claim.granted)throw Error('Collision damage needs review; it will not be replayed.');
  try{await apply(record.targetId,claim.amount,claim.damageType||'');await api({...key,action:'finish',status:'completed'});}
  catch(error){try{await api({...key,action:'finish',status:'needs_review'});}catch{}throw error;}
 }
}
