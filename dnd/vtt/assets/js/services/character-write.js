import {getCharacterOperationJournal} from './character-operation-journal.js';
/** Confirm a narrow character write; an uncertain outcome must never be retried here. */
export async function confirmCharacterWrite(endpoint, action, fields, {fetchImpl=globalThis.fetch,timeoutMs=15000,operationId}={}) {
  const usesReceipt = action === 'sync-surges' || action === 'sync-resource' || (action === 'sync-vitals' && fields.spendRecoveries !== undefined);
  const receiptId = usesReceipt ? (operationId ?? globalThis.crypto.randomUUID()) : null;
  const journal = receiptId ? getCharacterOperationJournal() : null;
  journal?.begin({operationId:receiptId,endpoint,action,fields});
  const controller=new AbortController();let timer;
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
    reject(new Error('Character save timed out; its outcome needs review.'));
    controller.abort();
  },timeoutMs);});
  try {
    return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl(endpoint,{method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({...fields,action,source:'vtt',...(receiptId ? {operationId:receiptId} : {})}),
      });
      const result=await response.json();
      if(!response.ok || result?.success!==true)throw new Error(result?.error || 'Character save was not confirmed.');
      if (receiptId && result.operationId !== receiptId) throw new Error('Character operation receipt was not confirmed.');
      journal?.complete(receiptId);
      return result;
    })()]);
  } catch (error) {
    if (receiptId) {
      error.operationId = receiptId;
      try { journal?.fail(receiptId,error.message); } catch { /* Pending record remains available for review. */ }
    }
    throw error;
  } finally {clearTimeout(timer);}
}
