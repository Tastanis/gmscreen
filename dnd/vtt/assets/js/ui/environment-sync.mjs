// Uses the existing canonical command client, event stream and recovery snapshots.
export function sharedField(field){const c=window.terrainContext?.();return c?.state.boardState.sceneState?.[c.state.boardState.activeSceneId]?.environment?.[field]||null;}
let queue=Promise.resolve();
export function terrainPatch(before,after){
 if(!before||before.n!==after.n||before.m!==after.m||JSON.stringify(before.bounds)!==JSON.stringify(after.bounds))return null;
 let i0=after.n,j0=after.m,i1=-1,j1=-1;
 for(let j=0;j<after.m;j++)for(let i=0;i<after.n;i++)if(before.h[j*after.n+i]!==after.h[j*after.n+i]){i0=Math.min(i0,i);j0=Math.min(j0,j);i1=Math.max(i1,i);j1=Math.max(j1,j);}
 if(i1<0)return null;
 const values=[];for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)values.push(after.h[j*after.n+i]);
 return {i0,j0,i1,j1,values};
}
export function acknowledgedRevision(results,field){
 const event=results?.[0]?.event;
 return event?.payload?.entry?.revision??event?.payload?.[field+'Revision']??event?.payload?.environment?.[field]?.revision;
}
export async function saveShared(field,value,expectedRevision,sceneId=null){
 const c=window.terrainContext?.();if(!c?.isGM)throw Error('Only the GM can edit map design.');
 let type='environment.set',payload={field,value,expectedRevision};const shared=sharedField(field);
 if(field==='terrain'&&shared?.revision===expectedRevision){const patch=terrainPatch(shared.value,value);if(patch){type='environment.terrain.patch';payload={patch,expectedRevision};}}
 const descriptor={type,sceneId:sceneId||c.state.boardState.activeSceneId,payload};
 queue=queue.catch(()=>{}).then(()=>window.submitEnvironmentCommand(descriptor));return queue;
}
export function savePortal(segmentId,open){
 const c=window.terrainContext?.(),sceneId=c.state.boardState.activeSceneId;
 if(!c?.isGM)throw Error('Only the GM can change doors.');
 queue=queue.catch(()=>{}).then(()=>{
   if(window.terrainContext?.()?.state.boardState.activeSceneId!==sceneId)throw Error('Scene changed before door action.');
   return window.submitEnvironmentCommand({type:'environment.portal.set',sceneId,payload:{segmentId,open,expectedRevision:sharedField('walls')?.revision??0}});
 });return queue;
}
