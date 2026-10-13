// A check for whoever is testing "a page only needs the scene it is showing", against a running LOCAL sandbox
// (one that has test-login.php; never the live site):
//   node dnd/vtt/tools/check-scene-designs.cjs <origin> [user ...]        users default to GM cal sharon indigo zepha
// For each user it asks for the whole snapshot (the old way), the lighter one (?designs=own) and every scene's
// design (scene-design.php), puts the designs back into the lighter one, and says whether that is the whole
// snapshot again, scene by scene and by name. It also prints the size and time of each, which is the measure of
// what the change saves. It only reads.
const assert = require('node:assert/strict');
const [, , origin, ...asked] = process.argv;
if (!origin || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
  console.error('usage: node check-scene-designs.cjs http://127.0.0.1:<port> [user ...]   (a local sandbox only)');
  process.exit(2);
}
const users = asked.length ? asked : ['GM', 'cal', 'sharon', 'indigo', 'zepha'];
const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';

async function get(cookie, address) {
  const began = performance.now();
  const response = await fetch(origin + address, { headers: { cookie }, cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) throw new Error(`${address} answered ${response.status}: ${text.slice(0, 200)}`);
  return { json: JSON.parse(text), bytes: Buffer.byteLength(text), ms: Math.round(performance.now() - began) };
}

(async () => {
  let failed = false;
  const names = new Map();
  for (const user of users) {
    const login = await fetch(`${origin}/test-login.php?user=${encodeURIComponent(user)}`, { redirect: 'manual' });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    if (!cookie) throw new Error(`could not sign in as ${user}: is this a sandbox with test-login.php?`);
    if (user === 'GM' && !names.size) {
      try { const catalog = (await get(cookie, '/dnd/vtt/api/scenes.php')).json; for (const scene of catalog?.data?.items || catalog?.scenes?.items || catalog?.items || []) names.set(scene.id, scene.name); } catch { /* names are a nicety */ }
    }
    const whole = await get(cookie, '/dnd/vtt/api/v2/snapshot.php');
    const light = await get(cookie, '/dnd/vtt/api/v2/snapshot.php?designs=own');
    const full = whole.json.snapshot, lighter = light.json.snapshot;
    console.log(`\n${user}: shown ${names.get(lighter.designs?.scene) || lighter.designs?.scene || 'no scene'}`);
    console.log(`  the whole snapshot (old way):  ${mb(whole.bytes)} in ${whole.ms} ms`);
    console.log(`  the lighter one (?designs=own): ${mb(light.bytes)} in ${light.ms} ms   (${Math.round(100 - (100 * light.bytes) / whole.bytes)}% less)`);
    if (full.revision !== lighter.revision) { console.log('  the sandbox changed between the two questions; run again with nothing else going on'); failed = true; continue; }
    const rebuilt = structuredClone(lighter);
    delete rebuilt.designs;
    const held = Object.keys(lighter.designs?.held || {});
    let largest = { bytes: 0 };
    for (const sceneId of held) {
      const design = await get(cookie, '/dnd/vtt/api/v2/scene-design.php?sceneId=' + encodeURIComponent(sceneId));
      if (design.json.revision !== full.revision) { console.log('  the sandbox changed while the designs were being fetched; run again'); failed = true; break; }
      rebuilt.state.sceneConfig[sceneId].environment = design.json.environment;
      if (design.bytes > largest.bytes) largest = { ...design, sceneId };
    }
    const scenes = Object.keys(full.state?.sceneConfig || {});
    let wrong = 0;
    for (const sceneId of scenes) {
      try { assert.deepStrictEqual(rebuilt.state.sceneConfig[sceneId], full.state.sceneConfig[sceneId]); }
      catch { wrong += 1; console.log(`  NOT THE SAME after putting its design back: ${names.get(sceneId) || sceneId}`); }
    }
    try { assert.deepStrictEqual(rebuilt, full); } catch (error) { if (!wrong) { wrong += 1; console.log('  NOT THE SAME outside the scenes: ' + String(error.message).split('\n').slice(0, 6).join(' | ')); } }
    const withDesign = scenes.filter((sceneId) => full.state.sceneConfig[sceneId] && 'environment' in full.state.sceneConfig[sceneId]);
    console.log(`  ${scenes.length} scenes, ${withDesign.length} with a design, ${held.length} left out of the lighter one` + (largest.sceneId ? `; the largest single design is ${names.get(largest.sceneId) || largest.sceneId}, ${mb(largest.bytes)} in ${largest.ms} ms` : ''));
    for (const sceneId of withDesign) if (/orchard/i.test(names.get(sceneId) || sceneId)) console.log(`  ${names.get(sceneId) || sceneId}: ${wrong ? 'see above' : 'its design put back is the whole snapshot\'s own'}`);
    console.log(wrong ? `  FAILED: ${wrong} difference(s)` : '  every scene with its design put back equals the whole snapshot: YES');
    if (wrong) failed = true;
  }
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error.message); process.exit(1); });
