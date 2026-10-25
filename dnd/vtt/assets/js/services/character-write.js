import {getCharacterOperationJournal} from './character-operation-journal.js';
import {recordSheetUndo} from './undo-client.js';

// Turn undo: the change a confirmed write made to a hero's counters (the server cannot see sheet writes).
function noteSheetChange(action, fields, result) {
  const characterId = String(fields?.character || '');
  if (!characterId) return;
  const whole = (value) => { const number = Number.parseInt(value, 10); return Number.isFinite(number) ? number : 0; };
  if (action === 'sync-surges' && fields.delta !== undefined) recordSheetUndo({ characterId, counter: 'surges', delta: whole(fields.delta) });
  else if (action === 'sync-resource' && fields.delta !== undefined) recordSheetUndo({ characterId, counter: 'resource', delta: whole(fields.delta) });
  else if (action === 'sync-resource' && fields.spend !== undefined && result?.paid !== false) recordSheetUndo({ characterId, counter: 'resource', delta: -whole(fields.spend) });
  else if (action === 'sync-vitals' && fields.spendRecoveries !== undefined) recordSheetUndo({ characterId, counter: 'recoveries', delta: -whole(result?.spent ?? fields.spendRecoveries) });
}
/** Confirm a narrow character write; an uncertain outcome must never be retried here. */
export async function confirmCharacterWrite(endpoint, action, fields, {fetchImpl=globalThis.fetch,timeoutMs=15000,operationId,journalOverride,noUndo=false}={}) {
  const usesReceipt = action === 'sync-surges' || action === 'sync-resource' || (action === 'sync-vitals' && fields.spendRecoveries !== undefined);
  const receiptId = usesReceipt ? (operationId ?? globalThis.crypto.randomUUID()) : null;
  const journal = receiptId ? (journalOverride ?? getCharacterOperationJournal()) : null;
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
      if (!controller.signal.aborted) journal?.complete(receiptId);
      if (!noUndo) noteSheetChange(action, fields, result);
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
