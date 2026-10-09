// Local prototype exploration: one half-resolution mask per map/floor/viewer.
// Only terrain silhouettes are remembered; token visibility never reads this mask.
export function createExploredFog(){
 const mask=document.createElement('canvas'),m=mask.getContext('2d');
 let key='',generation=0,timer=null,dirty=false,ready=false,revision=0,dirtySince=0;
 // What a viewer has explored is saved once the board has been still for a moment, not a third of
 // a second after every move: saving reads back a picture half the size of the map, which is
 // felt as a stutter in the middle of play. It is never left unsaved for longer than SAVE_LATEST,
 // and it is saved when the page is hidden or closed.
 const SAVE_QUIET=2500,SAVE_LATEST=20000;
 const epochs=new Map();let resetBarrier=Promise.resolve();
 function sceneOf(value){try{return JSON.parse(String(value).slice(0,String(value).lastIndexOf(']')+1))[1];}catch{return null;}}
 const db=new Promise((resolve,reject)=>{const request=indexedDB.open('terrain-exploration-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('masks');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 db.catch(console.error);
 function persist(){clearTimeout(timer);timer=null;if(!dirty||!ready)return;dirty=false;const savedKey=key,scene=sceneOf(key),epoch=epochs.get(scene)||0;mask.toBlob(async blob=>{if(!blob)return;try{const d=await db;if(epoch!==(epochs.get(scene)||0))return;d.transaction('masks','readwrite').objectStore('masks').put(blob,savedKey);}catch(e){console.error('Explored fog save failed',e);}},'image/png');}
 function select(next,width,height){
  if(key===next)return;persist();clearTimeout(timer);key=next;const mine=++generation;ready=false;
  mask.width=Math.ceil(width/2);mask.height=Math.ceil(height/2);revision++;
  (async()=>{try{await resetBarrier;const d=await db,blob=await new Promise((resolve,reject)=>{const q=d.transaction('masks').objectStore('masks').get(next);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});let blobs=blob?[blob]:[];
    if(!blob){
     let target;try{target=JSON.parse(next);}catch{}
     if(target?.[3]==='player-view-v3'){
      const legacy=await new Promise((resolve,reject)=>{const found=[],q=d.transaction('masks').objectStore('masks').openCursor();q.onsuccess=()=>{const cur=q.result;if(!cur){resolve(found);return;}try{const old=JSON.parse(cur.key);if(old[3]==='stacked-view-v2'){old[3]='player-view-v3';old[5]='personal';if(JSON.stringify(old)===next)found.push(cur.value);}}catch{}cur.continue();};q.onerror=()=>reject(q.error);});
      blobs=legacy;
     }
    }
    for(const blob of blobs){const bitmap=await createImageBitmap(blob);if(mine===generation){m.drawImage(bitmap,0,0,mask.width,mask.height);m.globalCompositeOperation='source-in';m.fillStyle='#202020';m.fillRect(0,0,mask.width,mask.height);m.globalCompositeOperation='source-over';}bitmap.close();}if(!blob&&blobs.length&&mine===generation){dirty=true;timer=setTimeout(persist,350);}}catch(e){console.error('Explored fog load failed',e);}finally{if(mine===generation){ready=true;revision++;}}})();
 }
 async function resetScene(scene){
  if(!scene)return;
  epochs.set(scene,(epochs.get(scene)||0)+1);
  const current=sceneOf(key)===scene,mine=current?++generation:generation;
  if(current){clearTimeout(timer);timer=null;dirty=false;ready=false;m.clearRect(0,0,mask.width,mask.height);revision++;}
  const operation=resetBarrier.then(async()=>{const d=await db;await new Promise((resolve,reject)=>{
   const tx=d.transaction('masks','readwrite'),request=tx.objectStore('masks').openCursor();
   request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;if(sceneOf(cursor.key)===scene)cursor.delete();cursor.continue();};
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Exploration reset aborted'));
  });});
  resetBarrier=operation.catch(()=>{});
  try{await operation;}finally{if(current&&mine===generation){ready=true;revision++;}}
 }
 function paint(ctx,path,remember,smoothing=0){
  // A very narrow rounded border closes tiny notches in the cosmetic terrain
  // mask. It never participates in the separate token line-of-sight check.
  function soften(context){if(!smoothing)return;context.save();context.lineWidth=smoothing;context.lineJoin='round';context.lineCap='round';context.strokeStyle=context.fillStyle;context.stroke(path);context.restore();}
  if(ready&&remember){m.save();m.scale(.5,.5);m.fillStyle='#202020';m.fill(path);soften(m);m.restore();const now=Date.now();if(!dirty){dirty=true;dirtySince=now;}clearTimeout(timer);timer=setTimeout(persist,Math.max(0,Math.min(SAVE_QUIET,dirtySince+SAVE_LATEST-now)));}
  ctx.globalCompositeOperation='destination-out';ctx.drawImage(mask,0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.72;ctx.drawImage(mask,0,0,ctx.canvas.width,ctx.canvas.height);ctx.globalAlpha=1;
  ctx.globalCompositeOperation='destination-out';ctx.fill(path);soften(ctx);ctx.globalCompositeOperation='source-over';
 }
 window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
 return {select,paint,resetScene,get revision(){return revision;}};
}
