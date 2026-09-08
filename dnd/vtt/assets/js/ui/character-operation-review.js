function outcomeText(receipt) {
  const result = receipt.response;
  if (result.success !== true) return `Recorded rejection: ${result.error || 'The change was rejected.'}`;
  if (Number.isInteger(result.spent)) return `Recorded recovery spend: ${result.spent}; recoveries remaining then: ${result.currentRecoveries}.`;
  if (typeof result.paid === 'boolean') return `Recorded payment: ${result.paid ? 'paid' : 'not paid'}; resource balance then: ${result.resource}.`;
  if (Number.isInteger(result.resource)) return `Recorded resource balance: ${result.resource}.`;
  if (Number.isInteger(result.surges)) return `Recorded surge count: ${result.surges}.`;
  return 'The character write was recorded.';
}

export function mountCharacterOperationReview(button, journal, endpoint) {
  if (!button || !journal) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'vtt-character-operation-review';
  dialog.dataset.characterOperationReview = '';
  dialog.setAttribute('aria-labelledby','character-operation-review-title');
  const title = document.createElement('h2'); title.id='character-operation-review-title'; title.textContent='Interrupted character actions';
  const explanation = document.createElement('p');
  explanation.textContent='Check what the server recorded, then compare the current character and any later effects. Checking a result does not repeat the action. These reminders belong to this account in this browser.';
  const list = document.createElement('ul'), close = document.createElement('button');
  close.type='button';close.className='btn';close.textContent='Close';close.addEventListener('click',()=>dialog.close());
  dialog.append(title,explanation,list,close);document.body.append(dialog);
  function render() {
    list.replaceChildren();
    let entries;
    try {entries=journal.list();} catch {button.textContent='Action review unavailable';list.textContent='Local action records could not be read.';return;}
    button.textContent=entries.length ? `Action review (${entries.length})` : 'Action review';
    if (!entries.length) list.textContent='No interrupted character writes recorded in this browser.';
    for (const entry of entries) {
      const row=document.createElement('li');row.dataset.characterOperationId=entry.operationId;
      const heading=document.createElement('strong');
      const label=entry.action==='sync-surges'?'Surge change':entry.action==='sync-vitals'?'Recovery spend':'Resource change';
      heading.textContent=`${entry.fields.character} · ${label} · ${new Date(entry.createdAt).toLocaleString()}`;
      const status=document.createElement('p');status.setAttribute('role','status');status.dataset.characterOperationOutcome='';
      status.textContent=entry.reason || 'The final result has not been confirmed in this browser.';
      const check=document.createElement('button');check.type='button';check.className='btn';check.textContent='Check saved result';
      check.addEventListener('click',async()=>{
        check.disabled=true;status.textContent='Checking saved result…';
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
        try {
          const url=new URL(endpoint,window.location.href);
          url.search=new URLSearchParams({action:'operation-status',character:entry.fields.character,operationId:entry.operationId});
          const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
          const result=await response.json();
          if (!response.ok || result.success!==true || result.operationId!==entry.operationId) throw Error(result.error || 'No confirmed lookup result.');
          status.textContent=result.recorded
            ? `${outcomeText(result.receipt)} This is the original result; later healing, zone effects or other steps still need review.`
            : 'No receipt is recorded yet. The request may still be in progress. Check again before deciding what to do.';
        } catch(error) {status.textContent=`Could not check the result: ${error.message}`;}
        finally {clearTimeout(timer);check.disabled=false;}
      });
      const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='btn';dismiss.textContent='Mark reviewed';
      dismiss.title='Remove this local reminder without changing character or board data';
      dismiss.addEventListener('click',()=>{try {journal.complete(entry.operationId);} catch(error) {status.textContent=error.message;}});
      row.append(heading,status,check,dismiss);list.append(row);
    }
  }
  button.addEventListener('click',()=>{render();dialog.showModal();});
  document.addEventListener('vtt:character-operation-review',render);
  window.addEventListener('storage',render);
  render();
}
