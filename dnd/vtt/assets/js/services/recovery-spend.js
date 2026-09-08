export async function spendCharacterRecoveries(endpoint, character, cost, {fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
  const controller=new AbortController();let timer;
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
    reject(new Error('Recovery spending timed out; its outcome needs review.'));controller.abort();
  },timeoutMs);});
  try {
    return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl(endpoint,{method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({action:'sync-vitals',source:'vtt',character,spendRecoveries:String(cost)}),
      });
      const result=await response.json();
      if(!response.ok || result?.success!==true || !Number.isInteger(result.spent))throw new Error(result?.error || 'Recovery spending was not confirmed.');
      return result;
    })()]);
  } finally {clearTimeout(timer);}
}
