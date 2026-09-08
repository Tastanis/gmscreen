const endpoint='/dnd/vtt/api/v2/zone-entries.php';
const executionQueues=new Map();

export function assertZoneEntryOutcomesConfirmed(outcomes=[]) {
  if(outcomes.flat().some(result=>result && !['completed','dismissed'].includes(result.status))) {
    throw new Error('Movement was saved, but a zone entry needs GM review before continuing the ability.');
  }
}

async function executeInOrder(request,execute) {
  if (!request.sceneId || !request.placementId) return execute();
  const key=JSON.stringify([request.sceneId,request.placementId]);
  const previous=executionQueues.get(key) || Promise.resolve();
  const current=previous.catch(()=>{}).then(execute);
  executionQueues.set(key,current);
  try {return await current;}
  finally {if(executionQueues.get(key)===current)executionQueues.delete(key);}
}

export async function zoneEntryRequest(request=null,{fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(endpoint,{method:request?'POST':'GET',credentials:'same-origin',cache:'no-store',
      signal:controller.signal,...(request?{headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}:{})});
    const result=await response.json();
    if (!response.ok || result.success!==true) throw new Error(result.error || 'Zone entry request failed.');
    return result;
  } finally {clearTimeout(timer);}
}

/** A lost claim or effect response must never authorize an automatic replay. */
export async function executeClaimedZoneEntry(request,execute,{api=zoneEntryRequest}={}) {
  let claim;
  try {claim=await api(request);}
  catch(error) {return {status:'needs_review',error,claimId:null};}
  if (!claim.claimed) return {status:claim.status,claimId:claim.claimId,executed:false};
  try {
    await executeInOrder(request,execute);
    await api({action:'finish',claimId:claim.claimId,status:'completed'});
    return {status:'completed',claimId:claim.claimId,executed:true};
  } catch(error) {
    try {await api({action:'finish',claimId:claim.claimId,status:'needs_review'});} catch {}
    return {status:'needs_review',claimId:claim.claimId,error};
  }
}
