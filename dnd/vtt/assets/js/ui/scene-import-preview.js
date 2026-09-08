export function mountSceneImportPreview(root) {
  if (!root) return;
  const input = root.querySelector('input[type="file"]');
  const status = root.querySelector('[data-scene-import-status]');
  const result = root.querySelector('[data-scene-import-result]');
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true; result.replaceChildren(); status.textContent = 'Checking scene package…';
    try {
      if (file.size > 33554432) throw Error('Scene JSON file is too large (32 MB maximum).');
      const packageText = await file.text();
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
      const label = document.createElement('label');
      const visibility = document.createElement('input'); visibility.type='checkbox';
      label.append(visibility, document.createTextNode(' Allow players to browse this new scene. Importing will not change anyone’s active scene.'));
      const install = document.createElement('button'); install.type='button'; install.className='btn btn--primary'; install.textContent='Import as new scene'; install.disabled=true;
      const operationId = `scene-import-${crypto.randomUUID()}`;
      visibility.addEventListener('change',()=>{install.disabled=!visibility.checked;});
      install.addEventListener('click',async()=>{
        install.disabled=true; visibility.disabled=true; input.disabled=true;
        status.textContent='Importing scene…';
        try {
          const response = await fetch('/dnd/vtt/api/v2/scene-import.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({package:JSON.parse(packageText),operationId,allowPlayerBrowsing:true})});
          const data = await response.json();
          if (!response.ok || !data.success) throw Error(data.error || `Import failed (${response.status}).`);
          status.textContent=`Created “${data.scene.name}”. Reload the VTT to open the new scene.`;
          result.replaceChildren(title,counts);
          const reload = document.createElement('button'); reload.type='button'; reload.className='btn'; reload.textContent='Reload VTT'; reload.addEventListener('click',()=>location.reload()); result.append(reload);
          status.scrollIntoView({block:'center'});
        } catch(error) {
          status.textContent=`${error.message || 'Import response was interrupted.'} Retry here to finish the same import without creating a duplicate.`;
          install.textContent='Retry import'; install.disabled=false; visibility.disabled=false;
        } finally {input.disabled=false;}
      });
      result.append(label,install);
    } catch(error) {status.textContent=error.message || 'Unable to preview scene package.';}
    finally {input.disabled=false;input.value='';}
  });
}
