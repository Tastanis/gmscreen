<?php
/**
 * The Table's Add scenes window (Brandon, November 17, 2026: "in the scenes, i cannot add, import, or delete a scene in
 * the new table version"). The Director only. A new scene from a map picture, or a map package (.vttmap) or scene file
 * imported, with the map's own import steps (vtt/assets/js/ui/scene-import-preview.js). Both are hidden from the players
 * until Show players. Deleting is on each scene in the Scenes list (table-apps.js). The map stays closed throughout; the
 * Table hears of each change (postMessage) and has an open map read its scene list again.
 */
require __DIR__ . '/config.php';
$config = tableSiteConfig();
session_write_close();
if ($config === null) { header('Location: /dnd/index.php'); exit; }
if (!$config['isGM']) { http_response_code(403); echo 'The Director adds scenes.'; exit; }
$v = static fn ($file) => (int) @filemtime(__DIR__ . '/../' . $file);
$json = static fn ($value) => json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
$folders = array_values(array_filter($config['scenes']['folders'] ?? [], static fn ($f) => is_array($f) && is_string($f['id'] ?? null)));
header('Cache-Control: no-store');
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Add scenes</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap">
  <style>
    html, body { margin: 0; background: #16130f; color: #e9dcc4; font: 13px "Segoe UI", sans-serif; }
    main { padding: 12px 14px 18px; display: grid; gap: 14px; }
    section { border: 1px solid #3b2b1d; border-radius: 8px; padding: 10px 12px; background: #1b1610; }
    h2 { margin: 0 0 4px; font: 700 13px Cinzel, Georgia, serif; color: #f0d898; letter-spacing: .03em; }
    p.note { margin: 0 0 8px; color: #a8987c; font-size: 12px; }
    label { display: grid; gap: 3px; margin: 6px 0; color: #cdbb98; font-size: 12px; }
    input[type=text], select { font: inherit; color: #efe4cf; background: #120e0a; border: 1px solid #4a3826; border-radius: 5px; padding: 5px 7px; }
    input[type=file] { color: #cdbb98; font-size: 12px; }
    button { font: 700 12px Cinzel, Georgia, serif; padding: 6px 12px; border-radius: 6px; cursor: pointer; background: #3e2d18; color: #f0d898; border: 1px solid #8a6d36; margin-top: 6px; }
    button:disabled { opacity: .5; cursor: default; }
    .status { min-height: 1.2em; margin-top: 6px; color: #d9c7a4; }
    .status.bad { color: #f0a090; }
    [data-scene-import-result] p, [data-scene-import-result] ul { margin: 4px 0; color: #cdbb98; font-size: 12px; }
    [data-scene-import-result] strong { color: #f0d898; }
    details summary { cursor: pointer; color: #a8987c; font-size: 12px; }
  </style>
</head>
<body>
<main>
  <section id="new">
    <h2>New scene from a map picture</h2>
    <p class="note">A picture (PNG, JPG, WebP or GIF). The scene starts hidden from the players.</p>
    <label>Map picture <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-new-file></label>
    <label>Name <input type="text" maxlength="160" data-new-name placeholder="Named after the picture"></label>
    <label>Folder <select data-new-folder></select></label>
    <button type="button" data-new-go>Create scene</button>
    <div class="status" data-new-status></div>
  </section>
  <section id="import" data-scene-import-preview>
    <h2>Import a map package</h2>
    <p class="note">A map package (.vttmap) or a scene file (.json). It is checked first; the scene starts hidden from the players.</p>
    <label>Package <input type="file" accept=".vttmap,.json,application/json"></label>
    <div class="status" data-scene-import-status></div>
    <div data-scene-import-result></div>
  </section>
</main>
<script type="module">
  import { mountSceneImportPreview } from '/dnd/vtt/assets/js/ui/scene-import-preview.js?v=<?php echo $v('vtt/assets/js/ui/scene-import-preview.js'); ?>';
  const endpoints = { scenes: <?php echo $json($config['scenesEndpoint'] ?? '/dnd/vtt/api/scenes.php'); ?>, uploads: '/dnd/vtt/api/uploads.php' };
  let folders = <?php echo $json($folders); ?>;
  // Tells the Table a scene was added (it reads its list again, and so does an open map), or asks it to open one.
  const tell = (message) => { try { window.parent?.postMessage({ source: 'table-scenes', ...message }, location.origin); } catch (_) { /* not in the Table */ } };

  const $ = (sel) => document.querySelector(sel);
  const folderSelect = $('[data-new-folder]');
  folderSelect.append(new Option('Unsorted', ''), ...folders.map((f) => new Option(f.name || 'Untitled Folder', f.id)));
  const fileInput = $('[data-new-file]'), nameInput = $('[data-new-name]'), go = $('[data-new-go]'), status = $('[data-new-status]');
  const say = (text, bad = false) => { status.textContent = text; status.classList.toggle('bad', bad); };
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file && !nameInput.value.trim()) nameInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 160);
  });
  go.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) { say('Pick a map picture first.', true); return; }
    go.disabled = true; fileInput.disabled = true;
    try {
      say('Uploading the picture…');
      const form = new FormData(); form.append('map', file, file.name || 'map.png');
      const up = await fetch(endpoints.uploads, { method: 'POST', credentials: 'same-origin', body: form });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok || !upData.success || typeof upData.data?.url !== 'string') throw Error(upData.error || 'The picture could not be uploaded.');
      say('Saving the scene…');
      const made = await fetch(endpoints.scenes, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-scene', name: nameInput.value.trim(), folderId: folderSelect.value || null, mapUrl: upData.data.url, thumbnailUrl: upData.data.thumbnailUrl || null, playerVisible: false }) });
      const scene = await made.json().catch(() => ({}));
      if (!made.ok || !scene.success || !scene.data?.id) throw Error(scene.error || 'The scene could not be saved.');
      say(`Created “${scene.data.name}”. It is in the Scenes list, hidden from the players.`);
      tell({ type: 'changed', sceneId: scene.data.id });
      fileInput.value = ''; nameInput.value = '';
    } catch (error) { say(error?.message || 'The scene could not be made.', true); }
    finally { go.disabled = false; fileInput.disabled = false; }
  });

  // The import steps the map uses, with this window standing in for the board: nothing to confirm on a board that is
  // not open, the folders from the Table, and Open sent to the Table.
  mountSceneImportPreview($('[data-scene-import-preview]'), {
    getState: () => ({ scenes: { folders } }),
    confirmImportedScene: async () => {},
    updateState: (change) => { const draft = { scenes: { folders } }; change(draft); folders = draft.scenes?.folders || folders; tell({ type: 'changed' }); },
    openImportedScene: (sceneId) => tell({ type: 'open', sceneId }),
  });
  // The Scenes list's New scene / Import buttons open this window at their part.
  const part = new URLSearchParams(location.search).get('part');
  if (part === 'import') document.getElementById('import').scrollIntoView();
</script>
</body>
</html>
