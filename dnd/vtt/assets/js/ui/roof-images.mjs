const dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('terrain-roof-images',1);r.onupgradeneeded=()=>r.result.createObjectStore('images');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export async function putRoofImage(file){const body=new FormData();body.append('map',file,file.name||'roof.png');const response=await fetch('/dnd/vtt/api/uploads.php',{method:'POST',body});const result=await response.json();if(!response.ok||!result.success||!result.data?.url)throw Error(result.error||'Roof upload failed');return result.data.url;}
export async function getRoofImage(id){const db=await dbPromise;return new Promise((resolve,reject)=>{const r=db.transaction('images').objectStore('images').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}

// Migrate old browser-only uploads before committing a shared wall document.
export async function shareRoofImages(model){
 const migrated=new Map();
 for(const roof of model.roofs||[]){const id=roof.imageId;if(!id||id.startsWith('/dnd/vtt/'))continue;
  if(!migrated.has(id)){const blob=await getRoofImage(id);if(!blob)throw Error('This browser does not have the saved roof image. Open the original GM browser to migrate it.');migrated.set(id,await putRoofImage(blob));}
  roof.imageId=migrated.get(id);
 }
 return model;
}
