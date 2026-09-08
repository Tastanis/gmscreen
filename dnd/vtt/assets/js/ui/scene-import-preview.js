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
      const response = await fetch('/dnd/vtt/api/v2/scene-import-preview.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:await file.text()});
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
    } catch(error) {status.textContent=error.message || 'Unable to preview scene package.';}
    finally {input.disabled=false;input.value='';}
  });
}
