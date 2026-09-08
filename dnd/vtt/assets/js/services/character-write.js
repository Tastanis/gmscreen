/** Confirm a narrow character write; an uncertain outcome must never be retried here. */
export async function confirmCharacterWrite(endpoint, action, fields, {fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
  const controller=new AbortController();let timer;
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
    reject(new Error('Character save timed out; its outcome needs review.'));
    controller.abort();
  },timeoutMs);});
  try {
    return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl(endpoint,{method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({...fields,action,source:'vtt'}),
      });
      const result=await response.json();
      if(!response.ok || result?.success!==true)throw new Error(result?.error || 'Character save was not confirmed.');
      return result;
    })()]);
  } finally {clearTimeout(timer);}
}
