export async function spendZoneUpkeep(endpoint, {character,cost,resourceName}, {fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
  const controller=new AbortController();let timer;
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
    reject(new Error('Zone upkeep save timed out; payment needs review.'));controller.abort();
  },timeoutMs);});
  try {
    return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl(endpoint,{method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({action:'sync-resource',source:'vtt',character,spend:String(cost),resourceName:resourceName || ''}),
      });
      const result=await response.json();
      if(!response.ok || result?.success!==true || typeof result.paid!=='boolean')throw new Error(result?.error || 'Zone upkeep payment was not confirmed.');
      return result;
    })()]);
  } finally {clearTimeout(timer);}
}
