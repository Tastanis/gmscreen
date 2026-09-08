let copyPreview = null;

export async function previewSceneCopy(packageData) {
  if (!copyPreview) throw Error('Scene import controls are not available.');
  await copyPreview(packageData);
}

export function mountSceneImportPreview(root, store) {
  if (!root) return;
  const input = root.querySelector('input[type="file"]');
  const status = root.querySelector('[data-scene-import-status]');
  const result = root.querySelector('[data-scene-import-result]');
  let busy = false;
  async function previewText(packageText) {
    if (busy) throw Error('Wait for the current scene request to finish.');
    busy = true;
    input.disabled = true; result.replaceChildren(); status.textContent = 'Checking scene package…';
    try {
      const response = await fetch('/dnd/vtt/api/v2/scene-import-preview.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:packageText});
      const data = await response.json();
      if (!response.ok || !data.success) throw Error(data.error || `Preview failed (${response.status}).`);
      const preview = data.preview;
      const title = document.createElement('strong'); title.textContent = preview.name;
      const counts = document.createElement('p');
      counts.textContent = `${preview.counts.placements} tokens · ${preview.counts.floors} floors · ${preview.counts.drawings} drawings · ${preview.counts.templates} templates`;
      result.append(title,counts);
      for (const warning of preview.warnings) {const text=document.createElement('p');text.textContent=warning;result.append(text);}
      const assets = document.createElement('details'); const summary=document.createElement('summary');
      summary.textContent=`${preview.assetReferences.length} image references`; assets.append(summary);
      const list=document.createElement('ul');
      for (const url of preview.assetReferences) {const item=document.createElement('li');item.textContent=url;list.append(item);}
      assets.append(list); result.append(assets); status.textContent='Scene package preview ready.';
      if (!preview.importable) {
        const error = document.createElement('p'); error.textContent = `Cannot import yet: ${preview.importError || 'Unsupported scene data.'}`;
        result.append(error); return;
      }
      const nameLabel = document.createElement('label'); nameLabel.textContent='New scene name';
      const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.maxLength=160; nameInput.value=preview.name;
      nameLabel.append(nameInput); result.append(nameLabel);
      const label = document.createElement('label');
      const visibility = document.createElement('input'); visibility.type='checkbox';
      label.append(visibility, document.createTextNode(' Allow players to browse this new scene. Importing will not change anyone’s active scene.'));
      const install = document.createElement('button'); install.type='button'; install.className='btn btn--primary'; install.textContent='Import as new scene'; install.disabled=true;
      const operationId = `scene-import-${crypto.randomUUID()}`;
      let requestBody = null;
      visibility.addEventListener('change',()=>{install.disabled=!visibility.checked;});
      install.addEventListener('click',async()=>{
        if (!nameInput.value.trim()) {status.textContent='Enter a name for the new scene.';nameInput.focus();return;}
        if (requestBody === null) {
          const packageData = JSON.parse(packageText); packageData.scene.name=nameInput.value.trim();
          requestBody=JSON.stringify({package:packageData,operationId,allowPlayerBrowsing:true});
        }
        busy=true; install.disabled=true; visibility.disabled=true; input.disabled=true; nameInput.disabled=true;
        status.textContent='Importing scene…';
        try {
          const response = await fetch('/dnd/vtt/api/v2/scene-import.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
            body:requestBody});
          const data = await response.json();
          if (!response.ok || !data.success) throw Error(data.error || `Import failed (${response.status}).`);
          status.textContent=`Created “${data.scene.name}”. Loading its board data…`;
          if (typeof store?.confirmImportedScene !== 'function') throw Error('Scene saved, but the board connection is not ready.');
          await store.confirmImportedScene(data.scene.id);
          const catalogResponse = await fetch('/dnd/vtt/api/scenes.php',{credentials:'same-origin',cache:'no-store'});
          const catalog = await catalogResponse.json();
          if (!catalogResponse.ok || !catalog.success || !catalog.data?.items?.some(scene=>scene.id===data.scene.id)) throw Error('Scene saved, but the scene list could not be refreshed.');
          store.updateState(draft=>{draft.scenes=catalog.data;});
          status.textContent=`Created “${data.scene.name}”. Ready to open. Everyone remains on their current scene.`;
          title.textContent=data.scene.name;
          result.replaceChildren(title,counts);
          const open = document.createElement('button'); open.type='button'; open.className='btn'; open.textContent='Open copy for GM';
          open.addEventListener('click',()=>{
            const target=Array.from(document.querySelectorAll('[data-action="activate-scene"]')).find(button=>button.dataset.sceneId===data.scene.id);
            if(target) target.click(); else status.textContent='The saved scene is no longer in the scene list.';
          }); result.append(open);
          status.scrollIntoView({block:'center'});
        } catch(error) {
          status.textContent=`${error.message || 'Import response was interrupted.'} Retry here to finish the same import without creating a duplicate.`;
          install.textContent='Retry import'; install.disabled=false; visibility.disabled=false;
        } finally {input.disabled=false;busy=false;}
      });
      result.append(label,install);
    } catch(error) {status.textContent=error.message || 'Unable to preview scene package.';}
    finally {input.disabled=false;input.value='';busy=false;}
  }
  input.addEventListener('change',async()=>{
    const file=input.files?.[0]; if(!file)return;
    try {
      if(file.size>33554432) throw Error('Scene JSON file is too large (32 MB maximum).');
      await previewText(await file.text());
    } catch(error) {status.textContent=error.message || 'Unable to read scene file.';}
  });
  copyPreview = async packageData => {
    if(busy) throw Error('Wait for the current scene request to finish.');
    const copy=structuredClone(packageData);
    copy.scene.name=Array.from(`Copy of ${copy.scene.name}`).slice(0,160).join('');
    root.open=true;
    await previewText(JSON.stringify(copy));
    status.scrollIntoView({block:'center'});
  };
}
