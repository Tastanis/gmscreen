import {zoneEntryRequest} from '../services/zone-entry-claims.js';

export function mountZoneEntryRecovery(root,store,{api=zoneEntryRequest}={}) {
  if (!root) return;
  const status=root.querySelector('[data-zone-recovery-status]');
  const list=root.querySelector('[data-zone-recovery-list]');
  const refreshButton=root.querySelector('[data-zone-recovery-refresh]');
  let busy=false;
  function setBusy(value) {busy=value;root.querySelectorAll('button').forEach(button=>button.disabled=value);}
  async function refresh() {
    if (busy) return;
    setBusy(true);status.textContent='Loading unresolved entries…';
    try {
      const {claims,limit}=await api();
      list.replaceChildren();
      for (const claim of claims) {
        const row=document.createElement('li');row.dataset.zoneClaimId=claim.claimId;
        const state=store.getState?.() ?? {};
        const placements=state.placements?.[claim.sceneId];
        const token=(Array.isArray(placements)?placements.find(item=>item.id===claim.placementId):placements?.[claim.placementId]);
        const heading=document.createElement('strong');
        heading.textContent=`${claim.zone?.abilityName || 'Zone'} → ${token?.name || claim.placementId}`;
        const meta=document.createElement('p');meta.textContent=`${claim.status==='pending'?'Unconfirmed':'Needs review'} · ${claim.actorId} · ${new Date(claim.createdAt).toLocaleString()} · Scene ${claim.sceneId}`;
        const evidence=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');
        summary.textContent='Recorded effects and movement';text.textContent=JSON.stringify({effects:claim.zone?.effects,movement:claim.movement},null,2);
        text.style.whiteSpace='pre-wrap';text.style.overflowWrap='anywhere';evidence.append(summary,text);
        row.append(heading,meta);
        const reason=document.createElement('p');reason.dataset.zoneReviewReason='';
        reason.textContent=claim.outcome?.reason
          ? `Reported by ${claim.outcome.actorId}: ${claim.outcome.reason}`
          : 'No failure details were confirmed. Check the recorded effects against current stamina and conditions.';
        row.append(reason,evidence);
        for (const [outcome,label] of [['completed','Mark resolved'],['dismissed','Dismiss without replay']]) {
          const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=label;
          button.addEventListener('click',async()=>{
            if (busy) return;
            setBusy(true);
            try {
              await api({action:'finish',claimId:claim.claimId,status:outcome});
              setBusy(false);await refresh();
            } catch(error) {status.textContent=`Outcome unconfirmed: ${error.message} Refresh before trying again.`;setBusy(false);}
          });row.append(button);
        }
        list.append(row);
      }
      status.textContent=claims.length?`${claims.length} unresolved entries${claims.length>=limit?' (oldest first; refresh after resolving to see more)':''}. Check stamina and conditions before resolving.`:'No unresolved zone entries.';
    } catch(error) {status.textContent=`Could not refresh entries: ${error.message}`;}
    finally {setBusy(false);}
  }
  refreshButton.addEventListener('click',refresh);
  root.addEventListener('toggle',()=>{if(root.open)refresh();});
  document.addEventListener('vtt:zone-entry-review-needed',()=>{if(root.open)refresh();});
}
